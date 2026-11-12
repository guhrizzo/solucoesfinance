// lib/restaurante/ficha.ts
// Ficha técnica: necessidade bruta de insumos, custo/margem do prato e
// necessidade agregada de um pedido. Puro e testado.
//
// Perda (fator de correção): `quantidade` é o peso LÍQUIDO que vai no prato;
// `perdaPct` é a fração do peso BRUTO que se perde no pré-preparo. Então
//   bruto = líquido / (1 − perda/100)
// Ex.: 80 g de batata descascada com 20% de perda → 100 g de batata comprada.

import type { Falta, Ingrediente, ItemFicha, Prato } from "./tipos";
import { r2, r3, r6 } from "./unidades";

export const PERDA_MAX = 90;

/** Quantidade bruta (a que sai do estoque) de uma linha da ficha. */
export function quantidadeBruta(item: Pick<ItemFicha, "quantidade" | "perdaPct">): number {
  const perda = Math.min(PERDA_MAX, Math.max(0, Number(item.perdaPct) || 0));
  return r3((Number(item.quantidade) || 0) / (1 - perda / 100));
}

type IngMap = Map<string, Pick<Ingrediente, "id" | "nome" | "custoMedio" | "unidadeBase">>;

export interface CustoFicha {
  /** Custo da receita inteira (todas as porções do rendimento). */
  custoTotal: number;
  /** custoTotal / rendimento. */
  custoPorcao: number;
  itens: { ingredienteId: string; nome: string; quantidadeBruta: number; custo: number }[];
  /** Linhas cujo ingrediente não existe mais (custo ignorado). */
  semIngrediente: string[];
}

/** Custo da ficha a partir do custo médio atual dos ingredientes. */
export function custoFicha(ficha: ItemFicha[], rendimento: number, ingredientes: IngMap): CustoFicha {
  const itens: CustoFicha["itens"] = [];
  const semIngrediente: string[] = [];
  let total = 0;
  for (const it of ficha) {
    const ing = ingredientes.get(it.ingredienteId);
    if (!ing) { semIngrediente.push(it.ingredienteId); continue; }
    const bruta = quantidadeBruta(it);
    const custo = bruta * (Number(ing.custoMedio) || 0);
    total += custo;
    itens.push({ ingredienteId: it.ingredienteId, nome: ing.nome, quantidadeBruta: bruta, custo: r2(custo) });
  }
  const rend = Number(rendimento) > 0 ? Number(rendimento) : 1;
  return { custoTotal: r2(total), custoPorcao: r6(total / rend), itens, semIngrediente };
}

export interface Margem {
  custo: number;
  preco: number;
  lucro: number;
  /** Lucro bruto / preço × 100 (null se preço 0). */
  margemPct: number | null;
  /** CMV: custo / preço × 100 (null se preço 0). */
  cmvPct: number | null;
}

export function margemPrato(preco: number, custoPorcao: number): Margem {
  const p = r2(preco);
  const c = r2(custoPorcao);
  return {
    custo: c,
    preco: p,
    lucro: r2(p - c),
    margemPct: p > 0 ? Math.round(((p - c) / p) * 1000) / 10 : null,
    cmvPct: p > 0 ? Math.round((c / p) * 1000) / 10 : null,
  };
}

/** Custo + margem de um prato. */
export function custoPrato(prato: Pick<Prato, "ficha" | "rendimento" | "preco">, ingredientes: IngMap) {
  const c = custoFicha(prato.ficha, prato.rendimento, ingredientes);
  return { ...c, margem: margemPrato(prato.preco, c.custoPorcao) };
}

/** Soma `extra` em `acc` (mutável). */
function somar(acc: Map<string, number>, id: string, qtd: number) {
  acc.set(id, r3((acc.get(id) ?? 0) + qtd));
}

/**
 * Necessidade bruta de insumos para `qtd` porções de uma ficha que rende
 * `rendimento` porções. Proporcional: 2 porções de uma ficha que rende 4 = metade.
 */
export function necessidadeFicha(ficha: ItemFicha[], rendimento: number, qtd: number): Map<string, number> {
  const out = new Map<string, number>();
  const rend = Number(rendimento) > 0 ? Number(rendimento) : 1;
  for (const it of ficha) somar(out, it.ingredienteId, (quantidadeBruta(it) * qtd) / rend);
  return out;
}

/** Necessidade agregada de vários itens (pedido ou conjunto de pedidos). */
export function necessidadeItens(itens: { ficha: ItemFicha[]; rendimento: number; qtd: number }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of itens) {
    for (const [id, q] of necessidadeFicha(it.ficha, it.rendimento, it.qtd)) somar(out, id, q);
  }
  return out;
}

/**
 * Compara necessidade × saldo. Devolve SÓ o que falta, em ordem alfabética.
 * Ingrediente ausente/inativo conta como saldo 0.
 */
export function verificarFaltas(
  necessidade: Map<string, number>,
  ingredientes: Map<string, Pick<Ingrediente, "nome" | "saldo" | "unidadeBase" | "ativo">>,
): Falta[] {
  const faltas: Falta[] = [];
  for (const [id, nec] of necessidade) {
    if (nec <= 0) continue;
    const ing = ingredientes.get(id);
    const disponivel = ing && ing.ativo !== false ? r3(Math.max(0, Number(ing.saldo) || 0)) : 0;
    if (nec > disponivel + 1e-9) {
      faltas.push({
        ingredienteId: id,
        nome: ing?.nome ?? "(ingrediente removido)",
        unidadeBase: ing?.unidadeBase ?? "un",
        necessario: r3(nec),
        disponivel,
        falta: r3(nec - disponivel),
      });
    }
  }
  return faltas.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

export interface ErroFicha {
  linha: number;
  erro: string;
}

/**
 * Valida a ficha de um prato ou a receita de um preparo.
 * `paraPreparo`: a receita não pode usar outro preparo nem o próprio (sem recursão).
 */
export function validarFicha(
  ficha: unknown,
  ingredientes: Map<string, Pick<Ingrediente, "id" | "nome" | "preparo" | "ativo">>,
  opts: { paraPreparo?: string } = {},
): { ok: true; ficha: ItemFicha[] } | { ok: false; erros: ErroFicha[] } {
  if (!Array.isArray(ficha)) return { ok: false, erros: [{ linha: -1, erro: "Ficha técnica inválida." }] };
  if (ficha.length > 60) return { ok: false, erros: [{ linha: -1, erro: "A ficha pode ter no máximo 60 ingredientes." }] };
  const erros: ErroFicha[] = [];
  const vistos = new Set<string>();
  const out: ItemFicha[] = [];
  ficha.forEach((raw, linha) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const id = String(it.ingredienteId ?? "");
    const quantidade = Number(it.quantidade);
    const perdaPct = it.perdaPct === undefined || it.perdaPct === null || it.perdaPct === "" ? 0 : Number(it.perdaPct);
    const ing = ingredientes.get(id);
    if (!ing) { erros.push({ linha, erro: "Ingrediente não encontrado." }); return; }
    if (vistos.has(id)) { erros.push({ linha, erro: `${ing.nome} aparece mais de uma vez.` }); return; }
    vistos.add(id);
    if (opts.paraPreparo !== undefined && (ing.preparo || id === opts.paraPreparo)) {
      erros.push({ linha, erro: `${ing.nome} é um preparo — a receita de um preparo só usa insumos crus.` });
      return;
    }
    if (!Number.isFinite(quantidade) || quantidade <= 0 || quantidade > 1e7) {
      erros.push({ linha, erro: `Quantidade inválida para ${ing.nome}.` });
      return;
    }
    if (!Number.isFinite(perdaPct) || perdaPct < 0 || perdaPct > PERDA_MAX) {
      erros.push({ linha, erro: `Perda de ${ing.nome} deve ficar entre 0 e ${PERDA_MAX}%.` });
      return;
    }
    out.push({ ingredienteId: id, quantidade: r3(quantidade), ...(perdaPct > 0 ? { perdaPct: Math.round(perdaPct * 10) / 10 } : {}) });
  });
  return erros.length ? { ok: false, erros } : { ok: true, ficha: out };
}
