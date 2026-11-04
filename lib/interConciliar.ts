// Regras puras da fila "A conciliar" (extrato Banco Inter → Fluxo de Caixa).
// Sem I/O: a gravação fica em app/components/InterConciliar.tsx, que usa o
// mesmo caminho de criação de lançamento do formulário do Fluxo de Caixa.
import type { InterPendente } from "./interTypes";
import type { CashEntryLite } from "./interMatch";

export type ConciliarAction = "criar" | "vincular" | "ignorar" | "desfazer";

const MES_RE = /^(\d{4})-(\d{2})(?:-\d{2})?$/;

/** "YYYY-MM" de uma data "YYYY-MM-DD" (ou já "YYYY-MM"); null se inválida. */
export function monthOf(dateISO: string): string | null {
  const m = MES_RE.exec((dateISO ?? "").trim());
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return `${m[1]}-${m[2]}`;
}

/**
 * Pode executar a ação nesta data? Mês fechado bloqueia `criar` e `vincular`
 * (o item continua pendente até reabrir o mês); `ignorar` e `desfazer` só
 * mexem na fila e são sempre permitidos. Data inválida também bloqueia
 * criar/vincular — melhor não gravar no caixa do que gravar no mês errado.
 */
export function canResolve(action: ConciliarAction, dateISO: string, closedMonths: Set<string>): boolean {
  if (action === "ignorar" || action === "desfazer") return true;
  const mes = monthOf(dateISO);
  if (!mes) return false;
  return !closedMonths.has(mes);
}

/**
 * Lançamento do Fluxo de Caixa a partir do item do extrato: mesmo tipo, valor
 * e data; descrição só com `trim()` (o formulário do Fluxo de Caixa não limita
 * tamanho, e a baixa automática compara a descrição inteira com o título da
 * conta); `interTxId` = txKey da transação (nunca o id do doc da fila).
 */
export function buildCashEntry(p: InterPendente, category: string): Omit<CashEntryLite, "id"> & { interTxId: string } {
  return {
    type: p.type,
    amount: p.amount,
    date: p.date,
    description: (p.description ?? "").trim(),
    category,
    interTxId: p.txKey,
  };
}

/**
 * Meses "fechados" do caixa — mesma regra do "Fechamento de Caixa por
 * Período" de Relatórios (visão anual): o mês tem lançamentos e TODOS estão
 * marcados como conciliados (`reconciled`).
 */
export function closedMonthsFrom(entries: { date?: string; reconciled?: boolean }[]): Set<string> {
  const porMes = new Map<string, { total: number; ok: number }>();
  for (const e of entries) {
    const mes = monthOf(e.date ?? "");
    if (!mes) continue;
    const g = porMes.get(mes) ?? { total: 0, ok: 0 };
    g.total++;
    if (e.reconciled) g.ok++;
    porMes.set(mes, g);
  }
  const out = new Set<string>();
  for (const [mes, g] of porMes) if (g.total > 0 && g.ok === g.total) out.add(mes);
  return out;
}

/**
 * Reserva ("claim") de um item pendente durante o `criar`: antes de qualquer
 * baixa automática o cliente grava `resolvedBy` = authUid e `resolvedAt` = um
 * token (timestamp) no item, mantendo `status: "pendente"` — as regras só
 * deixam o cliente mexer em status/cashflowId/resolvedAt/resolvedBy/suggestion,
 * então a reserva usa esses campos. A reserva vale por CLAIM_TTL_MS (cobre o
 * tempo de escolha no SettlePickModal); depois disso expira sozinha, para que
 * uma aba fechada no meio não trave o item para sempre.
 */
export const CLAIM_TTL_MS = 15 * 60 * 1000;

/**
 * true se o item está reservado por OUTRA execução (outro membro, outra aba ou
 * outra ação) e a reserva ainda não expirou. `myToken` = o `resolvedAt` que
 * esta execução gravou ao reservar (a reserva própria não bloqueia).
 */
export function isClaimedByOther(
  item: { status?: string; resolvedAt?: number; resolvedBy?: string },
  now: number,
  me: string,
  myToken?: number
): boolean {
  if (item.status !== "pendente") return false;
  const at = Number(item.resolvedAt);
  if (!item.resolvedBy || !Number.isFinite(at) || at <= 0) return false;
  if (now - at >= CLAIM_TTL_MS) return false;
  return !(item.resolvedBy === me && myToken !== undefined && at === myToken);
}

function dayNum(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

const cents = (v: number) => Math.round(Number(v) * 100);

/**
 * Lançamentos que o usuário pode escolher em "Vincular a outro…": mesmo tipo,
 * mesmo valor (centavos), data dentro de ±`janelaDias` e ainda sem `interTxId`.
 * Ordenados pela distância de data.
 */
export function linkCandidates<T extends CashEntryLite>(p: InterPendente, entries: T[], janelaDias = 10): T[] {
  const c = cents(p.amount);
  const dt = dayNum(p.date);
  return entries
    .filter(e => !e.interTxId && e.type === p.type && cents(e.amount) === c && monthOf(e.date ?? "")
      && Math.abs(dayNum(e.date) - dt) <= janelaDias)
    .sort((a, b) => Math.abs(dayNum(a.date) - dt) - Math.abs(dayNum(b.date) - dt) || a.id.localeCompare(b.id));
}
