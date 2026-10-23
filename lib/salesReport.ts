// lib/salesReport.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cálculos do Relatório de Vendas (/relatorios › aba "Vendas").
//
// 100% ANALÍTICO e PURO: recebe as linhas de venda IMPORTADAS (relatórios
// enviados pelo usuário e lidos pela IA — ver lib/salesReportImport.ts) e
// devolve números. NÃO lê vendas, caixa, contas, estoque nem qualquer outro
// módulo do sistema, e não escreve em nada. Sem imports de propósito (roda
// também nos testes do Node).
//
// Origem dos números (tudo vem do relatório importado):
//   • venda          = linha do relatório (data, produto, quantidade, valor);
//   • taxas/devolução = colunas do relatório, quando existirem;
//   • custo unitário = (1) custo informado na própria linha do relatório;
//                      (2) tabela de custos do relatório de vendas, com
//                      vigência por data (informada/importada na própria aba).
//                      Nunca o preço de venda, nunca um custo inventado.
//
// Fórmulas:
//   receita líquida = vendas − taxas − devoluções (descontos já estão no valor
//                     cobrado da linha; não são deduzidos de novo)
//   CMV             = Σ (unidades líquidas × custo unitário vigente na data da venda)
//   lucro bruto     = receita líquida − CMV
//   margem bruta %  = lucro bruto ÷ receita líquida × 100
//   ROI sobre CMV % = lucro bruto ÷ CMV × 100
//   markup %        = (preço de venda − custo) ÷ custo × 100
// Lucro, margem, ROI e markup só consideram as vendas COM custo conhecido
// (`cobertura`); as demais aparecem separadas em `semCusto`, nunca como custo 0.
// ─────────────────────────────────────────────────────────────────────────────

/** Linha de venda importada de um relatório (já normalizada). */
export interface ImportedSale {
  id: string;
  date: string; // YYYY-MM-DD
  sku: string; // "" quando o relatório não traz SKU
  name: string;
  qty: number;
  /** Valor total cobrado na linha (já com desconto). */
  amount: number;
  /** Custo unitário, só quando o relatório traz coluna de custo/CMV. */
  unitCost?: number | null;
  fees?: number | null;
  returnedQty?: number | null;
  returnedValue?: number | null;
  channel?: string;
  orderId?: string;
  /** Situação no relatório (cancelado, devolvido…). Cancelada/devolvida não conta como venda. */
  status?: string;
}

export interface CostEntry {
  /** Vigência: "" = todo o histórico anterior ao próximo registro; senão YYYY-MM-DD. */
  from: string;
  unitCost: number;
}
/** Histórico de custos por SKU (chave = SKU em maiúsculas). */
export type CostHistory = Record<string, CostEntry[]>;

export type CostSource = "relatorio" | "historico";

export interface SaleLine {
  id: string;
  orderKey: string; // pedido (várias linhas do mesmo pedido = 1 venda)
  date: string;
  sku: string; // chave do produto: SKU do relatório (ou o nome, se não houver SKU)
  name: string;
  channel: string;
  qty: number;
  returnedQty: number;
  gross: number;
  fees: number;
  returned: number;
  net: number; // gross − fees − returned
  unitCost: number | null;
  costSource: CostSource | null;
  cmv: number | null; // (qty − returnedQty) × unitCost
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validIso = (d: string) => {
  if (!DATE_RE.test(d || "")) return false;
  const [y, m, dd] = d.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, dd));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === dd;
};

export const skuKey = (sku: string | undefined) => (sku || "").toString().trim().toUpperCase();

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Venda cancelada/devolvida/estornada no relatório — não conta como venda válida. */
export function isCancelledSale(row: { status?: string }): boolean {
  const s = fold(row.status || "");
  return ["cancel", "estorn", "devolv", "refund", "void", "reembols"].some((k) => s.includes(k));
}

// ─── Custo unitário vigente ──────────────────────────────────────────────────

/**
 * Custo unitário vigente na data da venda. Prioriza o custo informado no
 * próprio relatório; senão usa o último registro da tabela de custos com
 * vigência ≤ data. Se a venda é anterior a qualquer registro com data, NÃO há
 * custo aplicável (null) — o custo de hoje não reescreve o passado.
 */
export function resolveUnitCost(
  sku: string,
  date: string,
  costs: CostHistory,
  reported?: number | null,
): { unitCost: number | null; source: CostSource | null } {
  if (typeof reported === "number" && Number.isFinite(reported) && reported >= 0) {
    return { unitCost: reported, source: "relatorio" };
  }
  const list = costs[skuKey(sku)];
  if (!list || list.length === 0) return { unitCost: null, source: null };
  let best: CostEntry | null = null;
  for (const e of list) {
    if (!(e.unitCost >= 0) || !Number.isFinite(e.unitCost)) continue;
    if (e.from !== "" && e.from > date) continue;
    if (!best || e.from >= best.from) best = e;
  }
  return best ? { unitCost: best.unitCost, source: "historico" } : { unitCost: null, source: null };
}

// ─── Montagem das linhas de venda ────────────────────────────────────────────

/**
 * Normaliza as linhas importadas em linhas de análise, já com taxas,
 * devoluções e custo. Linhas canceladas/devolvidas, sem data válida ou sem
 * valor positivo não entram.
 */
export function buildSaleLines(rows: ImportedSale[], costs: CostHistory): SaleLine[] {
  return rows
    .filter((r) => !isCancelledSale(r) && num(r.amount) > 0 && validIso(r.date))
    .map((r): SaleLine => {
      // Sem SKU no relatório, o nome do produto vira a chave (custo e agrupamento).
      const sku = skuKey(r.sku || r.name);
      const qty = num(r.qty) > 0 ? num(r.qty) : 1;
      const gross = round2(num(r.amount));
      const fees = round2(Math.min(Math.max(num(r.fees), 0), gross));
      const returned = round2(Math.min(Math.max(num(r.returnedValue), 0), gross - fees));
      const returnedQty = Math.min(
        Math.max(num(r.returnedQty), 0) || (returned > 0 && returned >= gross - fees ? qty : 0),
        qty,
      );
      const { unitCost, source } = resolveUnitCost(sku, r.date, costs, r.unitCost);
      const liveQty = Math.max(0, qty - returnedQty);
      return {
        id: r.id,
        orderKey: (r.orderId || "").trim() || r.id,
        date: r.date,
        sku,
        name: (r.name || "").trim() || sku || "—",
        channel: (r.channel || "").trim() || "n/d", // "n/d" = relatório sem canal
        qty,
        returnedQty,
        gross,
        fees,
        returned,
        net: round2(gross - fees - returned),
        unitCost,
        costSource: source,
        cmv: unitCost === null ? null : round2(liveQty * unitCost),
      };
    });
}

// ─── Filtros e períodos ──────────────────────────────────────────────────────

export interface ReportFilters {
  from: string;
  to: string;
  sku: string; // "" = todos
  channel: string; // "" = todos
}

export function filterLines(lines: SaleLine[], f: ReportFilters): SaleLine[] {
  const sku = skuKey(f.sku);
  return lines.filter(
    (l) => l.date >= f.from && l.date <= f.to && (!sku || l.sku === sku) && (!f.channel || l.channel === f.channel),
  );
}

const toUtc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => fromUtc(toUtc(iso) + n * 86400000);
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const pad = (n: number) => String(n).padStart(2, "0");

export type PeriodPreset = "hoje" | "7d" | "mes" | "mesAnterior" | "ano";

export function presetRange(preset: PeriodPreset, today: string): { from: string; to: string } {
  const [y, m] = today.split("-").map(Number);
  switch (preset) {
    case "hoje":
      return { from: today, to: today };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "mes":
      return { from: `${y}-${pad(m)}-01`, to: today };
    case "mesAnterior": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDayOfMonth(py, pm))}` };
    }
    case "ano":
      return { from: `${y}-01-01`, to: today };
  }
}

/**
 * Período anterior equivalente: mês civil inteiro → mês anterior inteiro; ano
 * civil inteiro → ano anterior; "mês atual até hoje" → mesmos dias do mês
 * anterior; demais → mesma duração imediatamente antes.
 */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (fd === 1 && fy === ty && fm === tm) {
    const py = fm === 1 ? fy - 1 : fy;
    const pm = fm === 1 ? 12 : fm - 1;
    const last = lastDayOfMonth(py, pm);
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(Math.min(td, last))}` };
  }
  if (fm === 1 && fd === 1 && fy === ty) {
    return { from: `${fy - 1}-01-01`, to: `${fy - 1}-${pad(tm)}-${pad(Math.min(td, lastDayOfMonth(fy - 1, tm)))}` };
  }
  const len = daysBetween(from, to) + 1;
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

// ─── Métricas ────────────────────────────────────────────────────────────────

export interface Metrics {
  totalVendas: number; // soma bruta das vendas
  qtdVendas: number; // pedidos
  unidades: number; // vendidas − devolvidas
  ticketMedio: number | null;
  taxas: number;
  devolucoes: number;
  receitaLiquida: number;
  /** Parte da receita (líquida) cujo custo é conhecido — base de lucro/margem/ROI. */
  receitaCoberta: number;
  cmv: number | null; // null = nenhuma venda com custo
  lucroBruto: number | null;
  margemBruta: number | null;
  roiCmv: number | null;
  markupMedio: number | null;
  /** % da receita líquida coberta por custo (0–100). */
  cobertura: number | null;
  semCusto: { linhas: number; receita: number; skus: string[] };
}

const safeDiv = (a: number, b: number) => (b > 0 ? a / b : null);

export function computeMetrics(lines: SaleLine[]): Metrics {
  let gross = 0, fees = 0, ret = 0, units = 0, net = 0;
  let netCov = 0, cmv = 0, priceCov = 0, nCov = 0;
  const orders = new Set<string>();
  const semSkus = new Set<string>();
  let semLinhas = 0, semReceita = 0;

  for (const l of lines) {
    gross += l.gross;
    fees += l.fees;
    ret += l.returned;
    units += Math.max(0, l.qty - l.returnedQty);
    net += l.net;
    orders.add(l.orderKey);
    if (l.cmv === null) {
      semLinhas++;
      semReceita += l.net;
      semSkus.add(l.sku || "—");
    } else {
      nCov++;
      netCov += l.net;
      cmv += l.cmv;
      priceCov += l.gross - l.returned;
    }
  }

  const lucro = nCov > 0 ? round2(netCov - cmv) : null;
  const cmvR = nCov > 0 ? round2(cmv) : null;
  return {
    totalVendas: round2(gross),
    qtdVendas: orders.size,
    unidades: units,
    ticketMedio: safeDiv(gross, orders.size) === null ? null : round2(gross / orders.size),
    taxas: round2(fees),
    devolucoes: round2(ret),
    receitaLiquida: round2(net),
    receitaCoberta: round2(netCov),
    cmv: cmvR,
    lucroBruto: lucro,
    margemBruta: lucro === null ? null : safeDiv(lucro, netCov) === null ? null : (lucro / netCov) * 100,
    // ROI usa o CMV como base; CMV zero/ausente → sem ROI (nada de número artificial).
    roiCmv: lucro === null || cmvR === null ? null : safeDiv(lucro, cmvR) === null ? null : (lucro / cmvR) * 100,
    markupMedio: cmvR === null || cmvR <= 0 ? null : ((priceCov - cmvR) / cmvR) * 100,
    cobertura: net > 0 ? (netCov / net) * 100 : lines.length > 0 ? 0 : null,
    semCusto: { linhas: semLinhas, receita: round2(semReceita), skus: [...semSkus].sort() },
  };
}

/** Variação % (cur vs prev). null quando não há base (prev ausente ou zero). */
export function pctVariation(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

// ─── Séries, produtos e canais ───────────────────────────────────────────────

export type Granularity = "dia" | "semana" | "mes";

export function autoGranularity(from: string, to: string): Granularity {
  const d = daysBetween(from, to) + 1;
  return d <= 45 ? "dia" : d <= 190 ? "semana" : "mes";
}

function bucketOf(date: string, g: Granularity): string {
  if (g === "dia") return date;
  if (g === "mes") return date.slice(0, 7);
  // semana: segunda-feira da semana
  const dow = (new Date(toUtc(date)).getUTCDay() + 6) % 7;
  return addDays(date, -dow);
}

export interface SeriesPoint {
  key: string;
  receita: number; // receita líquida
  vendas: number; // bruto
  cmv: number | null;
  lucro: number | null;
  roi: number | null;
}

export function buildSeries(lines: SaleLine[], g: Granularity): SeriesPoint[] {
  const groups = new Map<string, SaleLine[]>();
  for (const l of lines) {
    const k = bucketOf(l.date, g);
    const arr = groups.get(k);
    if (arr) arr.push(l);
    else groups.set(k, [l]);
  }
  return [...groups.keys()].sort().map((key) => {
    const m = computeMetrics(groups.get(key) as SaleLine[]);
    return { key, receita: m.receitaLiquida, vendas: m.totalVendas, cmv: m.cmv, lucro: m.lucroBruto, roi: m.roiCmv };
  });
}

export interface ProductRow {
  sku: string;
  name: string;
  qty: number;
  receitaLiquida: number;
  custoUnit: number | null; // médio ponderado das vendas com custo
  cmv: number | null;
  lucro: number | null;
  margem: number | null;
  roi: number | null;
  share: number; // % da receita líquida total
  semCusto: boolean; // nenhuma venda com custo
  parcial: boolean; // parte das vendas sem custo
}

export function buildProducts(lines: SaleLine[]): ProductRow[] {
  const total = lines.reduce((a, l) => a + l.net, 0);
  const groups = new Map<string, SaleLine[]>();
  for (const l of lines) {
    const k = l.sku || "—";
    const arr = groups.get(k);
    if (arr) arr.push(l);
    else groups.set(k, [l]);
  }
  return [...groups.entries()].map(([sku, ls]): ProductRow => {
    const m = computeMetrics(ls);
    const coveredUnits = ls.reduce((a, l) => (l.cmv === null ? a : a + Math.max(0, l.qty - l.returnedQty)), 0);
    const nCov = ls.filter((l) => l.cmv !== null).length;
    return {
      sku,
      name: ls[ls.length - 1].name,
      qty: m.unidades,
      receitaLiquida: m.receitaLiquida,
      custoUnit: m.cmv !== null && coveredUnits > 0 ? round2(m.cmv / coveredUnits) : null,
      cmv: m.cmv,
      lucro: m.lucroBruto,
      margem: m.margemBruta,
      roi: m.roiCmv,
      share: total > 0 ? (m.receitaLiquida / total) * 100 : 0,
      semCusto: nCov === 0,
      parcial: nCov > 0 && nCov < ls.length,
    };
  });
}

export interface ChannelRow {
  channel: string;
  receitaLiquida: number;
  vendas: number;
  pedidos: number;
  share: number;
}

export function buildChannels(lines: SaleLine[]): ChannelRow[] {
  const total = lines.reduce((a, l) => a + l.net, 0);
  const groups = new Map<string, SaleLine[]>();
  for (const l of lines) {
    const arr = groups.get(l.channel);
    if (arr) arr.push(l);
    else groups.set(l.channel, [l]);
  }
  return [...groups.entries()]
    .map(([channel, ls]) => {
      const m = computeMetrics(ls);
      return { channel, receitaLiquida: m.receitaLiquida, vendas: m.totalVendas, pedidos: m.qtdVendas, share: total > 0 ? (m.receitaLiquida / total) * 100 : 0 };
    })
    .sort((a, b) => b.receitaLiquida - a.receitaLiquida);
}

// ─── Ordenação da tabela ─────────────────────────────────────────────────────

export type SortKey = "name" | "qty" | "receitaLiquida" | "custoUnit" | "cmv" | "lucro" | "margem" | "roi" | "share";

/** Ordena com valores ausentes (null) sempre no fim, em qualquer direção. */
export function sortProducts(rows: ProductRow[], key: SortKey, dir: "asc" | "desc"): ProductRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key] as number | string | null;
    const bv = b[key] as number | string | null;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (typeof av === "string" || typeof bv === "string") return String(av).localeCompare(String(bv)) * sign;
    return (av - bv) * sign;
  });
}

// ─── Exportação e importação de custos ───────────────────────────────────────

const csvCell = (v: string | number | null) => {
  if (v === null) return "";
  const s = typeof v === "number" ? String(v).replace(".", ",") : v;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV com ";" e vírgula decimal (abre direto no Excel pt-BR). Ausente = vazio, nunca 0. */
export function productsToCsv(rows: ProductRow[], headers: string[]): string {
  const lines = [headers.map(csvCell).join(";")];
  for (const r of rows) {
    lines.push(
      [
        r.sku,
        r.name,
        r.qty,
        r.receitaLiquida,
        r.custoUnit,
        r.cmv,
        r.lucro,
        r.margem === null ? null : round2(r.margem),
        r.roi === null ? null : round2(r.roi),
        round2(r.share),
      ]
        .map((v, i) => csvCell(i < 2 ? String(v) : (v as number | null)))
        .join(";"),
    );
  }
  return lines.join("\r\n");
}

const parseMoney = (raw: string): number | null => {
  const s = raw.trim().replace(/^R\$\s*/i, "");
  if (!s) return null;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * Importa custos de texto colado/CSV: "SKU;custo;vigência(opcional)" por linha
 * (separador ; ou tab; vírgula também se o custo não usar vírgula decimal).
 * Cabeçalho é ignorado. Linhas inválidas voltam em `errors` (nada é chutado).
 */
export function parseCostCsv(text: string): { entries: { sku: string; unitCost: number; from: string }[]; errors: number[] } {
  const entries: { sku: string; unitCost: number; from: string }[] = [];
  const errors: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const parts = line.split(/[;\t]/).map((p) => p.trim());
    const sku = skuKey(parts[0]);
    const cost = parseMoney(parts[1] ?? "");
    const from = (parts[2] || "").trim();
    if (i === 0 && cost === null) return; // cabeçalho
    if (!sku || cost === null || (from && !DATE_RE.test(from))) errors.push(i + 1);
    else entries.push({ sku, unitCost: cost, from });
  });
  return { entries, errors };
}

/** Mescla uma entrada nova no histórico do SKU (mesma vigência substitui). */
export function upsertCost(history: CostHistory, sku: string, entry: CostEntry): CostHistory {
  const k = skuKey(sku);
  const rest = (history[k] || []).filter((e) => e.from !== entry.from);
  return { ...history, [k]: [...rest, entry].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)) };
}
