// lib/rh/alocacao.ts
// Alocação do colaborador em centros de custo (por percentual, com vigência),
// rateio do custo mensal e detecção de centro duplicado. Funções puras.

import { vigenciaEm, type Vigencia } from "./vigencia";

export interface ItemAlocacao {
  centroId: string;
  pct: number;
}

export interface DadosAlocacao {
  itens: (ItemAlocacao & { centroNome?: string })[];
}

/** Centros sugeridos na primeira abertura (nunca criados sem confirmação). */
export const CENTROS_SUGERIDOS = ["Comercial", "Operação", "Administrativo", "Financeiro"] as const;

/** A soma dos percentuais precisa fechar 100% (tolerância de 1 centésimo). */
export function validarItens(itens: unknown): string | null {
  if (!Array.isArray(itens) || itens.length === 0) return "Informe ao menos um centro de custo.";
  if (itens.length > 20) return "Máximo de 20 centros por colaborador.";
  const ids = new Set<string>();
  let soma = 0;
  for (const it of itens) {
    const centroId = String((it as ItemAlocacao)?.centroId ?? "");
    const pct = Number((it as ItemAlocacao)?.pct);
    if (!centroId || centroId.includes("/")) return "Centro de custo inválido.";
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return "Cada percentual deve estar entre 0 e 100.";
    if (ids.has(centroId)) return "O mesmo centro de custo aparece mais de uma vez.";
    ids.add(centroId);
    soma += pct;
  }
  if (Math.abs(soma - 100) > 0.01) return `A soma dos percentuais deve ser 100% (hoje: ${Math.round(soma * 100) / 100}%).`;
  return null;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface Rateio {
  itens: { centroId: string; valor: number }[];
  /** Parte do custo em dias sem alocação vigente. */
  naoAlocado: number;
}

/**
 * Reparte o custo do mês entre os centros dia a dia: cada dia ativo vale
 * 1/diasAtivos do total e segue a alocação vigente naquele dia. Dia sem
 * alocação vira "não alocado". A soma dos centavos sempre fecha com o total.
 */
export function ratear(total: number, dias: string[], alocacoes: Vigencia<DadosAlocacao>[]): Rateio {
  if (dias.length === 0 || total <= 0) return { itens: [], naoAlocado: 0 };
  const peso = new Map<string, number>();
  let semAloc = 0;
  for (const d of dias) {
    const v = vigenciaEm(alocacoes, d);
    if (!v) { semAloc += 1; continue; }
    for (const it of v.dados.itens) peso.set(it.centroId, (peso.get(it.centroId) ?? 0) + it.pct / 100);
  }
  const n = dias.length;
  const partes: { centroId: string | null; valor: number }[] = [...peso.entries()].map(([centroId, w]) => ({
    centroId,
    valor: r2((total * w) / n),
  }));
  if (semAloc > 0) partes.push({ centroId: null, valor: r2((total * semAloc) / n) });

  const diff = r2(total - partes.reduce((s, p) => s + p.valor, 0));
  if (diff !== 0 && partes.length > 0) {
    const maior = partes.reduce((a, b) => (b.valor > a.valor ? b : a));
    maior.valor = r2(maior.valor + diff);
  }
  return {
    itens: partes.filter((p) => p.centroId !== null && p.valor > 0).map((p) => ({ centroId: p.centroId as string, valor: p.valor })),
    naoAlocado: partes.find((p) => p.centroId === null)?.valor ?? 0,
  };
}

// ── Duplicidade de centro de custo ─────────────────────────────────────────

export function normalizaNome(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function distancia(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Centros com nome igual ou parecido (sem acento/caixa; contido; ou até 2 letras de diferença). */
export function centrosSimilares<T extends { id: string; nome: string }>(nome: string, existentes: T[]): T[] {
  const alvo = normalizaNome(nome);
  if (!alvo) return [];
  return existentes.filter((c) => {
    const n = normalizaNome(c.nome);
    if (!n) return false;
    if (n === alvo) return true;
    if (Math.min(n.length, alvo.length) >= 4 && (n.includes(alvo) || alvo.includes(n))) return true;
    return Math.min(n.length, alvo.length) >= 5 && distancia(n, alvo) <= 2;
  });
}
