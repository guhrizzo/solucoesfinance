// Motor de sugestão da conciliação do extrato Banco Inter: para cada transação
// do extrato sugere VINCULAR a um lançamento já existente no Fluxo de Caixa ou
// CRIAR um novo (com categoria sugerida). Módulo puro, sem I/O.
import type { InterTx } from "./inter";
import { CASHFLOW_CATEGORIES } from "./cashflowCategories";

export type CashEntryLite = {
  id: string;
  type: "entrada" | "saida";
  amount: number;
  date: string; // YYYY-MM-DD
  description: string;
  category?: string;
  interTxId?: string;
};

export type Suggestion =
  | { kind: "vincular"; cashflowId: string }
  | { kind: "criar"; category: string };

const JANELA_DIAS = 3;

/** Dias desde a época a partir de YYYY-MM-DD, em UTC (sem deriva de fuso). */
function dayNum(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

const cents = (v: number) => Math.round(v * 100);

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palavras (>=3 letras) da descrição, sem acento. */
function tokens(s: string): Set<string> {
  return new Set(norm(s).split(/[^a-z0-9]+/).filter(w => w.length >= 3));
}

/** Quantas palavras as duas descrições têm em comum — só serve de desempate. */
function overlap(a: string, b: string): number {
  const tb = tokens(b);
  let n = 0;
  for (const w of tokens(a)) if (tb.has(w)) n++;
  return n;
}

// Palavra-chave → categoria. Sempre valores da lista oficial.
const REGRAS: Record<"entrada" | "saida", [RegExp, string][]> = {
  entrada: [
    [/rendimento|remuneracao/, "Rendimentos financeiros"],
    [/resgate/, "Resgate de investimento"],
    [/estorno|reembolso|devolucao/, "Estorno / Reembolso"],
    [/cashback/, "Cashback / Bonificações"],
  ],
  saida: [
    [/tarifa|pacote de servicos|anuidade/, "Taxas bancárias"],
    [/\biof\b/, "IOF / Tributos financeiros"],
    [/\bdas\b|simples nacional/, "Impostos Simples Nacional (DAS)"],
    [/juros|multa/, "Juros / Multas pagos"],
    [/aplicacao/, "Aplicação financeira"],
    [/energia|agua|internet/, "Energia / Água / Internet"],
    [/aluguel/, "Aluguel"],
  ],
};

function categoriaSugerida(tx: InterTx): string {
  const texto = norm(`${tx.description} ${tx.counterparty ?? ""}`);
  const lista = CASHFLOW_CATEGORIES[tx.type];
  for (const [re, cat] of REGRAS[tx.type]) {
    if (re.test(texto) && lista.includes(cat)) return cat;
  }
  return tx.type === "entrada" ? "Outros recebimentos" : "Outros gastos";
}

/**
 * Sugestão por transação (chave = txKey). Guloso por proximidade de data:
 * todos os pares compatíveis (mesmo tipo, mesmo valor em centavos, data ±3 dias,
 * lançamento sem interTxId) são ordenados por distância em dias e a descrição só
 * desempata; cada lançamento é consumido uma única vez.
 */
export function suggestAll(txs: InterTx[], entries: CashEntryLite[]): Map<string, Suggestion> {
  const pares: { ti: number; ei: number; dist: number; sim: number }[] = [];
  txs.forEach((tx, ti) => {
    const c = cents(tx.amount);
    const dt = dayNum(tx.date);
    entries.forEach((e, ei) => {
      if (e.interTxId || e.type !== tx.type || cents(e.amount) !== c) return;
      const dist = Math.abs(dayNum(e.date) - dt);
      if (dist > JANELA_DIAS) return;
      pares.push({ ti, ei, dist, sim: overlap(tx.description, e.description) });
    });
  });
  pares.sort((a, b) => a.dist - b.dist || b.sim - a.sim || a.ti - b.ti || a.ei - b.ei);

  const out = new Map<string, Suggestion>();
  const txUsada = new Set<number>();
  const entUsada = new Set<number>();
  for (const p of pares) {
    if (txUsada.has(p.ti) || entUsada.has(p.ei)) continue;
    txUsada.add(p.ti);
    entUsada.add(p.ei);
    out.set(txs[p.ti].txKey, { kind: "vincular", cashflowId: entries[p.ei].id });
  }
  txs.forEach((tx, ti) => {
    if (!txUsada.has(ti)) out.set(tx.txKey, { kind: "criar", category: categoriaSugerida(tx) });
  });
  return out;
}
