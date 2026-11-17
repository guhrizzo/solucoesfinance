// Banco Inter: casamento do boleto pago com o item do extrato (puro, sem I/O).
// Regra de dedup do desenho: o lançamento criado pelo boleto é a fonte; o item do
// extrato só é VINCULADO quando não há nenhuma dúvida. Mais de um candidato, ou
// outro lançamento disputando o mesmo valor/janela → nada é vinculado sozinho.

type ValorData = { amount: number; date: string };

const JANELA_DIAS = 3;

const cents = (v: number) => Math.round(v * 100);

/** Dias desde a época a partir de YYYY-MM-DD, em UTC (sem deriva de fuso). */
function dayNum(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function bate(alvo: ValorData, x: ValorData): boolean {
  if (!Number.isFinite(x.amount) || typeof x.date !== "string") return false;
  if (cents(x.amount) !== cents(alvo.amount)) return false;
  const dif = Math.abs(dayNum(x.date) - dayNum(alvo.date));
  return Number.isFinite(dif) && dif <= JANELA_DIAS;
}

/**
 * Único candidato com o mesmo valor (em centavos) e data a até ±3 dias do alvo,
 * desde que nenhum concorrente (exceto o próprio alvo, por identidade) também
 * caia no mesmo valor/janela. Qualquer ambiguidade → null.
 */
export function candidatoUnico<T extends { amount: number; date: string }>(
  alvo: { amount: number; date: string },
  candidatos: T[],
  concorrentes: { amount: number; date: string }[],
): T | null {
  const achados = candidatos.filter((c) => bate(alvo, c));
  if (achados.length !== 1) return null;
  if (concorrentes.some((c) => c !== alvo && bate(alvo, c))) return null;
  return achados[0];
}
