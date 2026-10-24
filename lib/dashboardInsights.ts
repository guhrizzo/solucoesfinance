// lib/dashboardInsights.ts
//
// Cálculos do Dashboard (app/[locale]/dashboard) — funções PURAS, sem React nem
// Firestore, pra poderem ser testadas (tests/dashboard). Os componentes só
// formatam e exibem o que sai daqui.
//
// Regras adotadas (resumo — o detalhe está em cada função):
//  • REALIZADO = só lançamentos do Fluxo de Caixa (users/{uid}/cashflow) com
//    data <= hoje. Conta a pagar/receber em aberto NUNCA entra como realizada.
//  • PREVISTO = saldo em aberto de contas a pagar, impostos, despesas de Centro
//    de Custo ainda não pagas e contas a receber. Saldo em aberto = valor −
//    baixa parcial (amountPaid / amountReceived): a parte já baixada JÁ está no
//    Fluxo de Caixa, então nunca é somada de novo.
//  • VENCIDA = em aberto com vencimento anterior a hoje (derivado da data; o
//    rótulo gravado "vencido/atrasado" não é necessário). Vencida não é paga.
//  • RESULTADO (déficit/superávit) ≠ SALDO: o resultado ignora o que não é
//    receita/despesa (transferência entre contas do titular, aplicação/resgate,
//    empréstimo/aporte/estorno — mesmas regras do DRE em Relatórios). O saldo
//    conta tudo que passou pelo caixa.
//  • Comparações usam o PERÍODO ANTERIOR EQUIVALENTE: mês/ano em andamento é
//    comparado com o mesmo intervalo do mês/ano anterior (1º dia até o mesmo
//    dia), e não com o período anterior inteiro.

import { budgetForCenterMonth } from "@/lib/costCenterSync";
import { isFinancingMovement, isInvestmentMovement, isSameOwnerTransfer } from "@/lib/cashflowCategories";

// ─── Tipos de entrada (subconjunto dos docs do Firestore) ──────────────────────

export interface DashTx {
  id: string;
  type: "entrada" | "saida";
  description?: string;
  category?: string;
  amount: number;
  /** "YYYY-MM-DD" */
  date: string;
  reconciled?: boolean;
  sourceBillId?: string;
  sourceTaxId?: string;
  sourceReceivableId?: string;
  sourceExpenseId?: string;
}

export interface DashBill { id: string; title?: string; dueDate: string; amount: number; amountPaid?: number; status: string; category?: string }
export interface DashTax { id: string; name?: string; dueDate: string; amount: number; amountPaid?: number; status: string }
export interface DashExpense { id: string; description?: string; category?: string; center?: string; date: string; amount: number; status: string }
export interface DashReceivable {
  id: string; title?: string; clientName?: string; partyName?: string; description?: string;
  dueDate: string; amount: number; amountReceived?: number; status: string;
}
export interface DashCostCenter { id: string; name?: string; budget?: number; budgetsByMonth?: Record<string, number> }

// ─── Datas (strings "YYYY-MM-DD", sem passar por fuso) ─────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const ISO_RE = /^\d{4}-\d{2}-\d{2}/;

/** Hoje no calendário LOCAL (toISOString() devolveria o dia em UTC). */
export function todayISO(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dayOf(iso: string): string { return (iso ?? "").slice(0, 10); }
function validDate(iso: string | undefined): iso is string { return !!iso && ISO_RE.test(iso); }

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
export function addDays(iso: string, n: number): string {
  const d = new Date(toUTC(dayOf(iso)) + n * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** b − a em dias inteiros. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUTC(dayOf(b)) - toUTC(dayOf(a))) / 86400000);
}
function daysInMonth(y: number, m0: number): number { return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate(); }

const round2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

// ─── Período ───────────────────────────────────────────────────────────────────

export interface DashPeriod { mode: "mes" | "ano"; year: number; /** 0-11 */ month: number }
export interface DateRange { start: string; end: string }

export function periodRange(p: DashPeriod): DateRange {
  if (p.mode === "ano") return { start: `${p.year}-01-01`, end: `${p.year}-12-31` };
  return { start: `${p.year}-${pad(p.month + 1)}-01`, end: `${p.year}-${pad(p.month + 1)}-${pad(daysInMonth(p.year, p.month))}` };
}

export function periodMonthKeys(p: DashPeriod): string[] {
  if (p.mode === "mes") return [`${p.year}-${pad(p.month + 1)}`];
  return Array.from({ length: 12 }, (_, i) => `${p.year}-${pad(i + 1)}`);
}

/** Intervalo do período limitado a hoje (período futuro → null; ainda não há realizado). */
export function realizedRange(p: DashPeriod, today: string): DateRange | null {
  const r = periodRange(p);
  if (r.start > today) return null;
  return { start: r.start, end: r.end < today ? r.end : today };
}

/**
 * Período anterior EQUIVALENTE: mesmo mês/ano do ano/mês anterior, truncado no
 * mesmo ponto em que o período atual está hoje (mês/ano em andamento).
 * Período já encerrado → o anterior inteiro.
 */
export function previousEquivalentRange(p: DashPeriod, today: string): DateRange {
  const cur = periodRange(p);
  const capped = cur.end > today && cur.start <= today ? today : cur.end;
  const elapsed = Math.max(daysBetween(cur.start, capped), 0); // dias além do 1º
  if (p.mode === "ano") {
    const start = `${p.year - 1}-01-01`;
    const full = `${p.year - 1}-12-31`;
    if (capped === cur.end) return { start, end: full };
    const end = addDays(start, elapsed);
    return { start, end: end > full ? full : end };
  }
  const pm = p.month === 0 ? 11 : p.month - 1;
  const py = p.month === 0 ? p.year - 1 : p.year;
  const start = `${py}-${pad(pm + 1)}-01`;
  const full = `${py}-${pad(pm + 1)}-${pad(daysInMonth(py, pm))}`;
  if (capped === cur.end) return { start, end: full };
  const end = addDays(start, elapsed);
  return { start, end: end > full ? full : end };
}

export function inRange(date: string | undefined, r: DateRange | null): boolean {
  if (!r || !validDate(date)) return false;
  const d = dayOf(date);
  return d >= r.start && d <= r.end;
}

/** Variação percentual; null quando não há base de comparação (anterior = 0). */
export function pctChange(curr: number, prev: number): number | null {
  if (Math.abs(prev) < EPS) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

// ─── Realizado (Fluxo de Caixa) ────────────────────────────────────────────────

const isOutsideResult = (tx: DashTx) => {
  const cat = tx.category ?? "";
  return isSameOwnerTransfer(cat) || isInvestmentMovement(cat, tx.description ?? "") || isFinancingMovement(cat, tx.description ?? "");
};

export interface TxSummary {
  /** Tudo que entrou/saiu do caixa no intervalo (igual ao Fluxo de Caixa). */
  entradas: number;
  saidas: number;
  saldo: number;
  /** Só receita/despesa de verdade (fora transferência, aplicação/resgate e financiamento). */
  receita: number;
  despesa: number;
  resultado: number;
  /** Movimentos que passaram pelo caixa mas não são resultado. */
  foraDoResultado: { entradas: number; saidas: number };
  count: number;
}

const emptySummary = (): TxSummary => ({
  entradas: 0, saidas: 0, saldo: 0, receita: 0, despesa: 0, resultado: 0,
  foraDoResultado: { entradas: 0, saidas: 0 }, count: 0,
});

export function summarizeTxs(txs: DashTx[], range: DateRange | null): TxSummary {
  const s = emptySummary();
  if (!range) return s;
  for (const tx of txs) {
    if (!inRange(tx.date, range)) continue;
    const amt = Number(tx.amount) || 0;
    s.count++;
    const out = isOutsideResult(tx);
    if (tx.type === "entrada") {
      s.entradas += amt;
      if (out) s.foraDoResultado.entradas += amt; else s.receita += amt;
    } else {
      s.saidas += amt;
      if (out) s.foraDoResultado.saidas += amt; else s.despesa += amt;
    }
  }
  s.entradas = round2(s.entradas); s.saidas = round2(s.saidas);
  s.receita = round2(s.receita); s.despesa = round2(s.despesa);
  s.foraDoResultado.entradas = round2(s.foraDoResultado.entradas);
  s.foraDoResultado.saidas = round2(s.foraDoResultado.saidas);
  s.saldo = round2(s.entradas - s.saidas);
  s.resultado = round2(s.receita - s.despesa);
  return s;
}

/** Saldo em caixa até `upTo` (inclusive): só lançamentos já realizados (data <= hoje). */
export function cashBalance(txs: DashTx[], today: string, upTo?: string): number {
  const limit = upTo && upTo < today ? upTo : today;
  let b = 0;
  for (const tx of txs) {
    if (!validDate(tx.date) || dayOf(tx.date) > limit) continue;
    b += (tx.type === "entrada" ? 1 : -1) * (Number(tx.amount) || 0);
  }
  return round2(b);
}

export interface ResultOverview {
  periodo: TxSummary;
  anterior: TxSummary;
  anteriorRange: DateRange;
  /** Acumulado do ano (1º de janeiro até o fim do período, limitado a hoje). */
  acumulado: TxSummary;
  acumuladoAnterior: TxSummary;
  /** Ano inteiro do período selecionado (realizado até hoje). */
  ano: TxSummary;
  anoAnterior: TxSummary;
  saldoAtual: number;
  /** Saldo no último dia do período (só difere de saldoAtual em períodos já encerrados). */
  saldoFimPeriodo: number;
  variacao: { entradas: number | null; saidas: number | null; resultado: number | null; acumulado: number | null; ano: number | null };
}

export function buildResultOverview(txs: DashTx[], p: DashPeriod, today: string): ResultOverview {
  const cur = realizedRange(p, today);
  const prevRange = previousEquivalentRange(p, today);
  const periodo = summarizeTxs(txs, cur);
  const anterior = summarizeTxs(txs, prevRange);

  const yearStart = `${p.year}-01-01`;
  const periodEnd = periodRange(p).end;
  const accEnd = periodEnd < today ? periodEnd : today;
  const accRange: DateRange | null = yearStart <= today ? { start: yearStart, end: accEnd } : null;
  const acumulado = summarizeTxs(txs, accRange);
  // Mesmo intervalo do ano anterior (1º jan → mesmo dia/mês).
  const accPrev: DateRange | null = accRange
    ? { start: `${p.year - 1}-01-01`, end: shiftYear(accRange.end, -1) }
    : null;
  const acumuladoAnterior = summarizeTxs(txs, accPrev);

  const yearRange = realizedRange({ mode: "ano", year: p.year, month: 0 }, today);
  const ano = summarizeTxs(txs, yearRange);
  const anoAnterior = summarizeTxs(txs, previousEquivalentRange({ mode: "ano", year: p.year, month: 0 }, today));

  return {
    periodo, anterior, anteriorRange: prevRange, acumulado, acumuladoAnterior, ano, anoAnterior,
    saldoAtual: cashBalance(txs, today),
    saldoFimPeriodo: cashBalance(txs, today, periodEnd),
    variacao: {
      entradas: pctChange(periodo.entradas, anterior.entradas),
      saidas: pctChange(periodo.saidas, anterior.saidas),
      resultado: pctChange(periodo.resultado, anterior.resultado),
      acumulado: pctChange(acumulado.resultado, acumuladoAnterior.resultado),
      ano: pctChange(ano.resultado, anoAnterior.resultado),
    },
  };
}

function shiftYear(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const ny = y + delta;
  return `${ny}-${pad(m)}-${pad(Math.min(d, daysInMonth(ny, m - 1)))}`;
}

// ─── Evolução no tempo ─────────────────────────────────────────────────────────

export type Granularity = "day" | "week" | "month";

export interface TimelinePoint {
  /** 1-based: dia do mês, semana do mês (1-5) ou mês do ano (1-12). */
  index: number;
  entradas: number;
  saidas: number;
  resultado: number;
  /** Resultado acumulado desde o início do período (não do saldo bancário). */
  acumulado: number;
}

/**
 * Série do período, truncada em hoje (nada de pontos no futuro). Entradas e
 * saídas = caixa; resultado/acumulado = só receita/despesa (ver cabeçalho).
 * Período no futuro → [].
 */
export function buildTimeline(txs: DashTx[], p: DashPeriod, today: string, gran: Granularity): TimelinePoint[] {
  const range = realizedRange(p, today);
  if (!range) return [];
  const bucketOf = (iso: string): number => {
    const d = dayOf(iso);
    if (gran === "month") return Number(d.slice(5, 7));
    const day = Number(d.slice(8, 10));
    return gran === "week" ? Math.ceil(day / 7) : day;
  };
  const last = bucketOf(range.end);
  const pts: TimelinePoint[] = Array.from({ length: last }, (_, i) => ({ index: i + 1, entradas: 0, saidas: 0, resultado: 0, acumulado: 0 }));
  for (const tx of txs) {
    if (!inRange(tx.date, range)) continue;
    const pt = pts[bucketOf(tx.date) - 1];
    if (!pt) continue;
    const amt = Number(tx.amount) || 0;
    const out = isOutsideResult(tx);
    if (tx.type === "entrada") { pt.entradas += amt; if (!out) pt.resultado += amt; }
    else { pt.saidas += amt; if (!out) pt.resultado -= amt; }
  }
  let acc = 0;
  for (const pt of pts) {
    pt.entradas = round2(pt.entradas); pt.saidas = round2(pt.saidas); pt.resultado = round2(pt.resultado);
    acc = round2(acc + pt.resultado);
    pt.acumulado = acc;
  }
  return pts;
}

// ─── Obrigações e recebíveis em aberto ─────────────────────────────────────────

export type PayableKind = "bill" | "tax" | "expense";
export interface OpenItem {
  key: string;
  kind: PayableKind | "receivable";
  label: string;
  dueDate: string;
  amount: number;
  /** Parte já baixada (já está no Fluxo de Caixa). */
  settled: number;
  /** Saldo em aberto = amount − settled (0 se quitada/cancelada). */
  open: number;
  category?: string;
}

const CLOSED = new Set(["pago", "recebido", "cancelado", "cancelada", "estornado", "estornada"]);
export const isClosedStatus = (s: string | undefined) => CLOSED.has((s ?? "").trim().toLowerCase());

function mkOpen(base: Omit<OpenItem, "settled" | "open">, settledRaw: number | undefined, status: string): OpenItem {
  const amount = Number(base.amount) || 0;
  if (isClosedStatus(status)) return { ...base, amount, settled: amount, open: 0 };
  const settled = Math.min(Math.max(Number(settledRaw) || 0, 0), amount);
  return { ...base, amount, settled, open: round2(Math.max(amount - settled, 0)) };
}

/** Contas a pagar + impostos + despesas de Centro de Custo ainda não pagas (mesmo balaio do detalhamento de Inadimplência). */
export function buildPayables(bills: DashBill[], taxes: DashTax[], expenses: DashExpense[]): OpenItem[] {
  const out: OpenItem[] = [];
  for (const b of bills) if (validDate(b.dueDate))
    out.push(mkOpen({ key: `bill-${b.id}`, kind: "bill", label: b.title ?? "", dueDate: dayOf(b.dueDate), amount: b.amount, category: b.category }, b.amountPaid, b.status));
  for (const x of taxes) if (validDate(x.dueDate))
    out.push(mkOpen({ key: `tax-${x.id}`, kind: "tax", label: x.name ?? "", dueDate: dayOf(x.dueDate), amount: x.amount }, x.amountPaid, x.status));
  for (const e of expenses) if (validDate(e.date))
    out.push(mkOpen({ key: `expense-${e.id}`, kind: "expense", label: e.description ?? e.center ?? "", dueDate: dayOf(e.date), amount: e.amount, category: e.category }, undefined, e.status));
  return out;
}

export function buildReceivables(list: DashReceivable[]): OpenItem[] {
  const out: OpenItem[] = [];
  for (const r of list) if (validDate(r.dueDate))
    out.push(mkOpen({
      key: `rec-${r.id}`, kind: "receivable", dueDate: dayOf(r.dueDate), amount: r.amount, category: undefined,
      label: r.title || r.clientName || r.partyName || r.description || "",
    }, r.amountReceived, r.status));
  return out;
}

const sumOpen = (items: OpenItem[]) => round2(items.reduce((s, i) => s + i.open, 0));
const stillOpen = (items: OpenItem[]) => items.filter((i) => i.open > EPS);

export interface DueBucket { count: number; total: number }
export interface DueSummary {
  pagar: { vencidas: DueBucket; hoje: DueBucket; proximos: DueBucket; totalAberto: DueBucket };
  receber: { vencidas: DueBucket; hoje: DueBucket; proximos: DueBucket; totalAberto: DueBucket };
  /** Vencidas primeiro (mais atrasadas antes), depois as mais próximas. */
  pagarItens: Array<OpenItem & { diffDays: number }>;
  receberItens: Array<OpenItem & { diffDays: number }>;
  dias: number;
}

const bucket = (items: OpenItem[]): DueBucket => ({ count: items.length, total: sumOpen(items) });

export function buildDueSummary(payables: OpenItem[], receivables: OpenItem[], today: string, dias = 7, listLimit = 5): DueSummary {
  const split = (list: OpenItem[]) => {
    const open = stillOpen(list);
    return {
      vencidas: open.filter((i) => i.dueDate < today),
      hoje: open.filter((i) => i.dueDate === today),
      proximos: open.filter((i) => i.dueDate > today && i.dueDate <= addDays(today, dias)),
      open,
    };
  };
  const p = split(payables), r = split(receivables);
  const decorate = (list: OpenItem[]) =>
    list.map((i) => ({ ...i, diffDays: daysBetween(today, i.dueDate) }))
      .filter((i) => i.diffDays <= dias)
      .sort((a, b) => a.diffDays - b.diffDays || b.open - a.open)
      .slice(0, listLimit);
  return {
    pagar: { vencidas: bucket(p.vencidas), hoje: bucket(p.hoje), proximos: bucket(p.proximos), totalAberto: bucket(p.open) },
    receber: { vencidas: bucket(r.vencidas), hoje: bucket(r.hoje), proximos: bucket(r.proximos), totalAberto: bucket(r.open) },
    pagarItens: decorate(p.open),
    receberItens: decorate(r.open),
    dias,
  };
}

/** Pendências (a pagar) com vencimento dentro do período — base do KPI de inadimplência. */
export function buildDefaultRate(payables: OpenItem[], p: DashPeriod, today: string) {
  const range = periodRange(p);
  const inPeriod = stillOpen(payables).filter((i) => inRange(i.dueDate, range));
  const total = sumOpen(inPeriod);
  const overdue = sumOpen(inPeriod.filter((i) => i.dueDate < today));
  return { total, overdue, rate: total > EPS ? (overdue / total) * 100 : 0 };
}

// ─── Orçamento ─────────────────────────────────────────────────────────────────

export interface BudgetGroup { key: "centers" | "bills" | "taxes"; orcado: number; realizado: number; pct: number | null; saldo: number }
export interface CenterDeviation { id: string; name: string; orcado: number; realizado: number; desvio: number; pct: number | null; over: boolean }
export interface BudgetSummary {
  orcado: number;
  realizado: number;
  pct: number | null;
  /** orçado − realizado; negativo = excedido. */
  saldo: number;
  excedido: boolean;
  grupos: BudgetGroup[];
  /** Centros com orçamento, do maior estouro/consumo ao menor. */
  desvios: CenterDeviation[];
  /** Centros que passaram do orçado no período. */
  centrosEstourados: number;
  hasBudget: boolean;
}

const pctOf = (part: number, whole: number): number | null => (whole > EPS ? (part / whole) * 100 : null);

/**
 * Orçamento do período — mesma base do KPI "Orçamento" do Fluxo de Caixa:
 * orçamento dos centros + contas a pagar e impostos que vencem no período.
 * Realizado = despesas PAGAS do centro no período + parte efetivamente paga de
 * contas/impostos (quitado inteiro; baixa parcial = amountPaid).
 */
export function buildBudget(
  p: DashPeriod, today: string,
  input: { costCenters: DashCostCenter[]; expenses: DashExpense[]; bills: DashBill[]; taxes: DashTax[] },
): BudgetSummary {
  const range = periodRange(p);
  const months = periodMonthKeys(p);
  const currentMonthKey = today.slice(0, 7);

  const desvios: CenterDeviation[] = [];
  for (const c of input.costCenters) {
    const orcado = round2(months.reduce((s, m) => s + budgetForCenterMonth(c, m, currentMonthKey), 0));
    if (orcado <= 0) continue;
    const realizado = round2(input.expenses
      .filter((e) => e.center === c.name && (e.status ?? "").toLowerCase() === "pago" && inRange(e.date, range))
      .reduce((s, e) => s + (Number(e.amount) || 0), 0));
    desvios.push({ id: c.id, name: c.name ?? "", orcado, realizado, desvio: round2(realizado - orcado), pct: pctOf(realizado, orcado), over: realizado > orcado + EPS });
  }
  desvios.sort((a, b) => b.desvio - a.desvio);

  const centersOrcado = round2(desvios.reduce((s, d) => s + d.orcado, 0));
  const centersReal = round2(desvios.reduce((s, d) => s + d.realizado, 0));

  const paidOf = (amount: number, paid: number | undefined, status: string) =>
    isClosedStatus(status) ? amount : Math.min(Math.max(paid ?? 0, 0), amount);
  const bills = input.bills.filter((b) => inRange(b.dueDate, range));
  const taxes = input.taxes.filter((x) => inRange(x.dueDate, range));
  const billsOrcado = round2(bills.reduce((s, b) => s + (Number(b.amount) || 0), 0));
  const billsReal = round2(bills.reduce((s, b) => s + paidOf(Number(b.amount) || 0, b.amountPaid, b.status), 0));
  const taxesOrcado = round2(taxes.reduce((s, x) => s + (Number(x.amount) || 0), 0));
  const taxesReal = round2(taxes.reduce((s, x) => s + paidOf(Number(x.amount) || 0, x.amountPaid, x.status), 0));

  const grp = (key: BudgetGroup["key"], orcado: number, realizado: number): BudgetGroup =>
    ({ key, orcado, realizado, pct: pctOf(realizado, orcado), saldo: round2(orcado - realizado) });
  const grupos = [grp("centers", centersOrcado, centersReal), grp("bills", billsOrcado, billsReal), grp("taxes", taxesOrcado, taxesReal)]
    .filter((g) => g.orcado > 0 || g.realizado > 0);

  const orcado = round2(centersOrcado + billsOrcado + taxesOrcado);
  const realizado = round2(centersReal + billsReal + taxesReal);
  return {
    orcado, realizado, pct: pctOf(realizado, orcado), saldo: round2(orcado - realizado),
    excedido: orcado > EPS && realizado > orcado + EPS,
    grupos, desvios,
    centrosEstourados: desvios.filter((d) => d.over).length,
    hasBudget: orcado > EPS,
  };
}

// ─── Projeção de saldo (7 / 15 / 30 dias) ──────────────────────────────────────

export const PROJECTION_HORIZONS = [7, 15, 30] as const;

export interface ProjectionPoint { days: number; receber: number; pagar: number; lancamentosFuturos: number; saldo: number }
export interface Projection {
  saldoAtual: number;
  horizontes: ProjectionPoint[];
  /** Saldo projetado dia a dia (índice 0 = hoje) até o maior horizonte. */
  diario: number[];
  /** Fora da projeção por incerteza: a receber já vencido (não se sabe se/quando entra). */
  receberVencido: DueBucket;
  /** Dentro da projeção: a pagar já vencido (é dívida certa, entra no 1º dia). */
  pagarVencido: DueBucket;
  /** Primeiro dia (0-based) em que o saldo projetado fica negativo, ou null. */
  primeiroDiaNegativo: number | null;
}

/**
 * Saldo projetado = saldo realizado hoje
 *   + a receber em aberto com vencimento de hoje até D+N (vencidas NÃO entram)
 *   − a pagar em aberto com vencimento até D+N (vencidas ENTRAM, no dia de hoje)
 *   ± lançamentos do Fluxo de Caixa datados no futuro (ainda não realizados).
 * Só o saldo em aberto entra: o que já foi baixado já está no saldo, então não
 * duplica.
 */
export function buildProjection(txs: DashTx[], payables: OpenItem[], receivables: OpenItem[], today: string): Projection {
  const maxH = Math.max(...PROJECTION_HORIZONS);
  const saldoAtual = cashBalance(txs, today);
  const rec = new Array<number>(maxH + 1).fill(0);
  const pag = new Array<number>(maxH + 1).fill(0);
  const fut = new Array<number>(maxH + 1).fill(0);

  for (const i of stillOpen(receivables)) {
    const d = daysBetween(today, i.dueDate);
    if (d >= 0 && d <= maxH) rec[d] += i.open;
  }
  for (const i of stillOpen(payables)) {
    const d = Math.max(daysBetween(today, i.dueDate), 0); // vencida cai no dia 0
    if (d <= maxH) pag[d] += i.open;
  }
  for (const tx of txs) {
    if (!validDate(tx.date)) continue;
    const d = daysBetween(today, tx.date);
    if (d >= 1 && d <= maxH) fut[d] += (tx.type === "entrada" ? 1 : -1) * (Number(tx.amount) || 0);
  }

  const diario: number[] = [];
  const cum = { rec: 0, pag: 0, fut: 0 };
  const horizontes: ProjectionPoint[] = [];
  let primeiroDiaNegativo: number | null = null;
  for (let d = 0; d <= maxH; d++) {
    cum.rec += rec[d]; cum.pag += pag[d]; cum.fut += fut[d];
    const saldo = round2(saldoAtual + cum.rec - cum.pag + cum.fut);
    diario.push(saldo);
    if (saldo < 0 && primeiroDiaNegativo === null) primeiroDiaNegativo = d;
    if ((PROJECTION_HORIZONS as readonly number[]).includes(d)) {
      horizontes.push({ days: d, receber: round2(cum.rec), pagar: round2(cum.pag), lancamentosFuturos: round2(cum.fut), saldo });
    }
  }
  return {
    saldoAtual, horizontes, diario,
    receberVencido: bucket(stillOpen(receivables).filter((i) => i.dueDate < today)),
    pagarVencido: bucket(stillOpen(payables).filter((i) => i.dueDate < today)),
    primeiroDiaNegativo,
  };
}

// ─── Centros de custo (destaques) ──────────────────────────────────────────────

export interface CenterHighlight {
  name: string;
  orcado: number;
  realizado: number;
  realizadoAnterior: number;
  /** Utilização do orçamento; null quando o centro não tem orçamento no período. */
  pct: number | null;
  over: boolean;
  variacao: number | null;
}
export interface CenterHighlights {
  total: number;
  totalAnterior: number;
  variacaoTotal: number | null;
  /** Maiores despesas pagas no período. */
  top: CenterHighlight[];
  estourados: number;
  semOrcamento: number;
}

export function buildCenterHighlights(
  p: DashPeriod, today: string,
  input: { costCenters: DashCostCenter[]; expenses: DashExpense[] }, limit = 5,
): CenterHighlights {
  const range = periodRange(p);
  const prev = previousEquivalentRange(p, today);
  const months = periodMonthKeys(p);
  const currentMonthKey = today.slice(0, 7);
  const paid = input.expenses.filter((e) => (e.status ?? "").toLowerCase() === "pago");

  const byName = new Map<string, { id?: string; budget?: number; budgetsByMonth?: Record<string, number> }>();
  for (const c of input.costCenters) if (c.name) byName.set(c.name, c);
  for (const e of paid) if (e.center && !byName.has(e.center)) byName.set(e.center, {}); // despesa de centro removido/sem doc

  const sumFor = (name: string, r: DateRange | null) =>
    round2(paid.filter((e) => e.center === name && inRange(e.date, r)).reduce((s, e) => s + (Number(e.amount) || 0), 0));

  const rows: CenterHighlight[] = [];
  for (const [name, c] of byName) {
    const orcado = round2(months.reduce((s, m) => s + budgetForCenterMonth(c, m, currentMonthKey), 0));
    const realizado = sumFor(name, range);
    const realizadoAnterior = sumFor(name, prev);
    if (realizado <= 0 && realizadoAnterior <= 0 && orcado <= 0) continue;
    rows.push({
      name, orcado, realizado, realizadoAnterior,
      pct: pctOf(realizado, orcado), over: orcado > EPS && realizado > orcado + EPS,
      variacao: pctChange(realizado, realizadoAnterior),
    });
  }
  const withSpend = rows.filter((r) => r.realizado > 0).sort((a, b) => b.realizado - a.realizado);
  const total = round2(rows.reduce((s, r) => s + r.realizado, 0));
  const totalAnterior = round2(rows.reduce((s, r) => s + r.realizadoAnterior, 0));
  return {
    total, totalAnterior, variacaoTotal: pctChange(total, totalAnterior),
    top: withSpend.slice(0, limit),
    estourados: rows.filter((r) => r.over).length,
    semOrcamento: withSpend.filter((r) => r.orcado <= EPS).length,
  };
}

// ─── Conciliação ───────────────────────────────────────────────────────────────

export interface ReconciliationCheck {
  /** Algum lançamento já foi conciliado → o usuário usa o recurso (senão "pendente" seria ruído). */
  inUse: boolean;
  pendentes: number;
  pendentesValor: number;
  totalNoPeriodo: number;
  pendentesPct: number | null;
  duplicados: { grupos: number; extras: number; valorExtras: number };
}

const normText = (s: string | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

export function checkReconciliation(txs: DashTx[], p: DashPeriod, today: string): ReconciliationCheck {
  const range = realizedRange(p, today);
  const inPeriod = range ? txs.filter((t) => inRange(t.date, range)) : [];
  const pend = inPeriod.filter((t) => !t.reconciled);

  // Duplicado suspeito: mesmo tipo, dia, valor e descrição, e nenhum dos dois é
  // espelho gerado por uma conta/imposto/cobrança/despesa (esses são únicos por origem).
  const groups = new Map<string, DashTx[]>();
  for (const t of inPeriod) {
    if (t.sourceBillId || t.sourceTaxId || t.sourceReceivableId || t.sourceExpenseId) continue;
    const key = `${t.type}|${dayOf(t.date)}|${(Number(t.amount) || 0).toFixed(2)}|${normText(t.description)}`;
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  let grupos = 0, extras = 0, valorExtras = 0;
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    grupos++; extras += arr.length - 1;
    valorExtras += (arr.length - 1) * (Number(arr[0].amount) || 0);
  }
  return {
    inUse: txs.some((t) => t.reconciled),
    pendentes: pend.length,
    pendentesValor: round2(pend.reduce((s, t) => s + (Number(t.amount) || 0), 0)),
    totalNoPeriodo: inPeriod.length,
    pendentesPct: inPeriod.length ? (pend.length / inPeriod.length) * 100 : null,
    duplicados: { grupos, extras, valorExtras: round2(valorExtras) },
  };
}

// ─── Central de alertas ────────────────────────────────────────────────────────

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertCode =
  | "negativeBalance" | "projectedNegative" | "overduePayables" | "dueTodayPayables" | "dueSoonPayables"
  | "overdueReceivables" | "budgetExceeded" | "budgetNearLimit" | "centersOver"
  | "reconPending" | "duplicateSuspects"
  | "negativeResult" | "revenueDrop" | "expenseRise" | "marginBelowTarget";

export interface DashAlert {
  code: AlertCode;
  severity: AlertSeverity;
  /** Valor do indicador (R$, contagem ou %, conforme indicatorKind). */
  indicator: number;
  indicatorKind: "money" | "count" | "percent";
  /** Params do texto (ICU) — ex.: {count, total, days, pct, limit}. */
  params: Record<string, number>;
  /** Escopo temporal do alerta, pra exibir "hoje / próximos N dias / período". */
  scope: "today" | "next" | "period";
  /** Módulo da ação recomendada. */
  href: string;
}

/** Critérios dos alertas — transparentes e ajustáveis. Não há metas gravadas: margem só alerta se `marginTargetPct` for informado. */
export interface AlertThresholds {
  budgetNearPct: number;
  revenueDropPct: number;
  expenseRisePct: number;
  reconPendingWarnPct: number;
  marginTargetPct: number | null;
  dueSoonDays: number;
}
export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  budgetNearPct: 90,
  revenueDropPct: 20,
  expenseRisePct: 20,
  reconPendingWarnPct: 50,
  marginTargetPct: null,
  dueSoonDays: 7,
};

const SEV_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function buildAlerts(input: {
  overview: ResultOverview;
  due: DueSummary;
  projection: Projection;
  budget: BudgetSummary;
  recon: ReconciliationCheck;
  /** Quais módulos o usuário pode ver — alerta de módulo sem acesso não aparece. */
  access?: { payables?: boolean; receivables?: boolean; budget?: boolean; cashflow?: boolean };
  thresholds?: Partial<AlertThresholds>;
}): DashAlert[] {
  const th = { ...DEFAULT_ALERT_THRESHOLDS, ...input.thresholds };
  const ac = { payables: true, receivables: true, budget: true, cashflow: true, ...input.access };
  const { overview, due, projection, budget, recon } = input;
  const out: DashAlert[] = [];
  const push = (a: DashAlert) => out.push(a);

  if (ac.cashflow) {
    if (overview.saldoAtual < -EPS) {
      push({ code: "negativeBalance", severity: "critical", indicator: overview.saldoAtual, indicatorKind: "money", params: {}, scope: "today", href: "/fluxo-caixa" });
    } else {
      const neg = projection.horizontes.find((h) => h.saldo < -EPS);
      if (neg) {
        push({
          code: "projectedNegative", severity: neg.days <= 7 ? "critical" : "warning",
          indicator: neg.saldo, indicatorKind: "money", params: { days: neg.days }, scope: "next", href: "/fluxo-caixa",
        });
      }
    }
  }

  if (ac.payables) {
    const v = due.pagar.vencidas;
    if (v.count > 0) push({ code: "overduePayables", severity: "critical", indicator: v.total, indicatorKind: "money", params: { count: v.count, total: v.total }, scope: "today", href: "/contasPagar" });
    const h = due.pagar.hoje;
    if (h.count > 0) push({ code: "dueTodayPayables", severity: "warning", indicator: h.total, indicatorKind: "money", params: { count: h.count, total: h.total }, scope: "today", href: "/contasPagar" });
    const n = due.pagar.proximos;
    if (n.count > 0) push({ code: "dueSoonPayables", severity: "info", indicator: n.total, indicatorKind: "money", params: { count: n.count, total: n.total, days: due.dias }, scope: "next", href: "/contasPagar" });
  }
  if (ac.receivables) {
    const v = due.receber.vencidas;
    if (v.count > 0) push({ code: "overdueReceivables", severity: "warning", indicator: v.total, indicatorKind: "money", params: { count: v.count, total: v.total }, scope: "today", href: "/contasReceber" });
  }

  if (ac.budget && budget.hasBudget) {
    const pct = budget.pct ?? 0;
    if (budget.excedido) {
      push({ code: "budgetExceeded", severity: "critical", indicator: pct, indicatorKind: "percent", params: { pct: Math.round(pct), over: Math.abs(budget.saldo) }, scope: "period", href: "/costCenter" });
    } else if (pct >= th.budgetNearPct) {
      push({ code: "budgetNearLimit", severity: "warning", indicator: pct, indicatorKind: "percent", params: { pct: Math.round(pct), limit: th.budgetNearPct }, scope: "period", href: "/costCenter" });
    }
    if (!budget.excedido && budget.centrosEstourados > 0) {
      push({ code: "centersOver", severity: "warning", indicator: budget.centrosEstourados, indicatorKind: "count", params: { count: budget.centrosEstourados }, scope: "period", href: "/costCenter" });
    }
  }

  if (ac.cashflow) {
    if (recon.inUse && recon.pendentes > 0) {
      const warn = (recon.pendentesPct ?? 0) >= th.reconPendingWarnPct;
      push({
        code: "reconPending", severity: warn ? "warning" : "info", indicator: recon.pendentes, indicatorKind: "count",
        params: { count: recon.pendentes, total: recon.pendentesValor, pct: Math.round(recon.pendentesPct ?? 0), limit: th.reconPendingWarnPct },
        scope: "period", href: "/relatorios",
      });
    }
    if (recon.duplicados.grupos > 0) {
      push({
        code: "duplicateSuspects", severity: "warning", indicator: recon.duplicados.extras, indicatorKind: "count",
        params: { count: recon.duplicados.extras, total: recon.duplicados.valorExtras }, scope: "period", href: "/fluxo-caixa",
      });
    }

    const { periodo, anterior, acumulado } = overview;
    if (periodo.resultado < -EPS) {
      push({
        code: "negativeResult", severity: acumulado.resultado < -EPS ? "critical" : "warning",
        indicator: periodo.resultado, indicatorKind: "money", params: { acc: acumulado.resultado }, scope: "period", href: "/relatorios",
      });
    }
    const drop = pctChange(periodo.receita, anterior.receita);
    if (drop !== null && anterior.receita > 0 && drop <= -th.revenueDropPct) {
      push({ code: "revenueDrop", severity: "warning", indicator: Math.abs(drop), indicatorKind: "percent", params: { pct: Math.round(Math.abs(drop)), limit: th.revenueDropPct }, scope: "period", href: "/relatorios" });
    }
    const rise = pctChange(periodo.despesa, anterior.despesa);
    if (rise !== null && anterior.despesa > 0 && rise >= th.expenseRisePct) {
      push({ code: "expenseRise", severity: "warning", indicator: rise, indicatorKind: "percent", params: { pct: Math.round(rise), limit: th.expenseRisePct }, scope: "period", href: "/relatorios" });
    }
    if (th.marginTargetPct !== null && periodo.receita > EPS) {
      const margem = (periodo.resultado / periodo.receita) * 100;
      if (margem < th.marginTargetPct) {
        push({ code: "marginBelowTarget", severity: "warning", indicator: margem, indicatorKind: "percent", params: { pct: Math.round(margem * 10) / 10, target: th.marginTargetPct }, scope: "period", href: "/relatorios" });
      }
    }
  }

  return out.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || Math.abs(b.indicator) - Math.abs(a.indicator));
}
