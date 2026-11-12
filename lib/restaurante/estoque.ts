// lib/restaurante/estoque.ts
// Planos de movimentação de estoque (baixa por pedido, estorno, entrada de
// compra, ajuste/perda, lote de produção) e nível de alerta. Puro e testado —
// as transações de lib/restaurante/service.ts só leem os saldos, chamam estas
// funções e gravam o resultado.

import type { Falta, Ingrediente, LinhaBaixa, NivelAlerta, UnidadeBase } from "./tipos";
import { necessidadeFicha, verificarFaltas } from "./ficha";
import { r2, r3, r6 } from "./unidades";

type IngEstoque = Pick<Ingrediente, "id" | "nome" | "saldo" | "unidadeBase" | "custoMedio" | "ativo" | "minimo">;

/** Uma linha a gravar: novo saldo do ingrediente + dados do movimento. */
export interface LinhaMov {
  ingredienteId: string;
  nome: string;
  unidadeBase: UnidadeBase;
  delta: number;
  quantidade: number;
  saldoAntes: number;
  saldoDepois: number;
  custoUnit: number;
  /** Só muda em entrada/produção; senão repete o atual. */
  custoMedioDepois: number;
}

/**
 * Custo médio ponderado após uma entrada. Saldo ≤ 0 (inclusive negativo por
 * baixa forçada) não carrega custo antigo: o custo passa a ser o da entrada.
 */
export function custoMedioPonderado(saldo: number, custoAtual: number, qtdEntrada: number, custoUnitEntrada: number): number {
  const s = Number(saldo) || 0;
  const q = Number(qtdEntrada) || 0;
  if (q <= 0) return r6(custoAtual);
  if (s <= 0) return r6(custoUnitEntrada);
  return r6((s * (Number(custoAtual) || 0) + q * (Number(custoUnitEntrada) || 0)) / (s + q));
}

/** "zerado" (≤ 0), "baixo" (mínimo > 0 e saldo ≤ mínimo) ou "ok". */
export function nivelAlerta(saldo: number, minimo: number): NivelAlerta {
  if ((Number(saldo) || 0) <= 0) return "zerado";
  if ((Number(minimo) || 0) > 0 && saldo <= minimo) return "baixo";
  return "ok";
}

const PESO: Record<NivelAlerta, number> = { ok: 0, baixo: 1, zerado: 2 };

/**
 * Avisar o dono? Só quando PIORA (ok→baixo, ok→zerado, baixo→zerado). Enquanto
 * continuar baixo não repete; ao voltar a "ok" o estado reseta e um novo
 * cruzamento avisa de novo.
 */
export function deveAvisar(anterior: NivelAlerta | undefined, novo: NivelAlerta): boolean {
  return PESO[novo] > PESO[anterior ?? "ok"];
}

export type PlanoBaixa =
  | { ok: true; linhas: LinhaMov[]; baixa: LinhaBaixa[]; faltas: Falta[]; forcada: boolean }
  | { ok: false; faltas: Falta[] };

/**
 * Baixa de uma necessidade (pedido ou consumo de lote). Sem `forcar`, recusa
 * se faltar qualquer insumo (devolve a lista exata). Com `forcar`, baixa
 * mesmo assim — o saldo pode ficar negativo.
 */
export function planejarBaixa(
  necessidade: Map<string, number>,
  ingredientes: Map<string, IngEstoque>,
  opts: { forcar?: boolean } = {},
): PlanoBaixa {
  const faltas = verificarFaltas(necessidade, ingredientes);
  // Ingrediente que sumiu não pode ser baixado nem forçado.
  const inexistentes = [...necessidade.keys()].filter((id) => !ingredientes.has(id));
  if (inexistentes.length > 0 || (faltas.length > 0 && !opts.forcar)) return { ok: false, faltas };

  const linhas: LinhaMov[] = [];
  const baixa: LinhaBaixa[] = [];
  for (const [id, qtd] of necessidade) {
    if (qtd <= 0) continue;
    const ing = ingredientes.get(id)!;
    const antes = r3(ing.saldo);
    const depois = r3(antes - qtd);
    const custo = r6(ing.custoMedio);
    linhas.push({
      ingredienteId: id, nome: ing.nome, unidadeBase: ing.unidadeBase,
      delta: r3(-qtd), quantidade: r3(qtd), saldoAntes: antes, saldoDepois: depois,
      custoUnit: custo, custoMedioDepois: custo,
    });
    baixa.push({ ingredienteId: id, nome: ing.nome, quantidade: r3(qtd), custoUnit: custo });
  }
  return { ok: true, linhas, baixa, faltas, forcada: faltas.length > 0 };
}

/**
 * Cancelamento de pedido já baixado. `perda: false` devolve exatamente o que
 * a baixa tirou (estorno). `perda: true` mantém o estoque baixado e só registra
 * a perda (delta 0) — prato já feito e descartado.
 * Ingrediente que não existe mais é ignorado (devolvido em `ignorados`).
 */
export function planejarEstorno(
  baixa: LinhaBaixa[],
  ingredientes: Map<string, IngEstoque>,
  opts: { perda?: boolean } = {},
): { linhas: LinhaMov[]; ignorados: string[] } {
  const linhas: LinhaMov[] = [];
  const ignorados: string[] = [];
  // Mesmo ingrediente em 2 linhas: acumula em cima do saldo já devolvido.
  const saldo = new Map<string, number>();
  for (const b of baixa) {
    const ing = ingredientes.get(b.ingredienteId);
    if (!ing) { ignorados.push(b.ingredienteId); continue; }
    const antes = r3(saldo.get(b.ingredienteId) ?? ing.saldo);
    const delta = opts.perda ? 0 : r3(b.quantidade);
    const depois = r3(antes + delta);
    saldo.set(b.ingredienteId, depois);
    linhas.push({
      ingredienteId: b.ingredienteId, nome: ing.nome, unidadeBase: ing.unidadeBase,
      delta, quantidade: r3(b.quantidade), saldoAntes: antes, saldoDepois: depois,
      custoUnit: r6(b.custoUnit), custoMedioDepois: r6(ing.custoMedio),
    });
  }
  return { linhas, ignorados };
}

/** Entrada de compra: soma ao saldo e recalcula o custo médio ponderado. */
export function planejarEntrada(ing: IngEstoque, qtdBase: number, custoTotal: number): LinhaMov {
  const q = r3(qtdBase);
  const custoUnit = q > 0 ? r6((Number(custoTotal) || 0) / q) : 0;
  const antes = r3(ing.saldo);
  return {
    ingredienteId: ing.id, nome: ing.nome, unidadeBase: ing.unidadeBase,
    delta: q, quantidade: q, saldoAntes: antes, saldoDepois: r3(antes + q),
    custoUnit, custoMedioDepois: custoMedioPonderado(antes, ing.custoMedio, q, custoUnit),
  };
}

/** Ajuste de inventário (contagem física → novo saldo) ou perda/desperdício (sai `qtd`). */
export function planejarAjuste(ing: IngEstoque, opts: { novoSaldo: number } | { perda: number }): LinhaMov {
  const antes = r3(ing.saldo);
  const depois = "novoSaldo" in opts ? r3(opts.novoSaldo) : r3(antes - opts.perda);
  const delta = r3(depois - antes);
  return {
    ingredienteId: ing.id, nome: ing.nome, unidadeBase: ing.unidadeBase,
    delta, quantidade: r3(Math.abs(delta)), saldoAntes: antes, saldoDepois: depois,
    custoUnit: r6(ing.custoMedio), custoMedioDepois: r6(ing.custoMedio),
  };
}

export type PlanoLote =
  | {
      ok: true;
      consumo: PlanoBaixa & { ok: true };
      entrada: LinhaMov;
      custoLote: number;
      custoUnit: number;
    }
  | { ok: false; erro: string; faltas: Falta[] };

/**
 * Lote de produção de um preparo: consome os insumos da receita na proporção
 * `quantidade / rendimento` e soma `quantidade` ao saldo do preparo, com o
 * custo do lote entrando no custo médio ponderado.
 */
export function planejarLote(
  preparo: IngEstoque & Pick<Ingrediente, "preparo" | "receita" | "rendimento">,
  quantidade: number,
  ingredientes: Map<string, IngEstoque>,
  opts: { forcar?: boolean } = {},
): PlanoLote {
  if (!preparo.preparo) return { ok: false, erro: "Este ingrediente não é um preparo.", faltas: [] };
  const receita = preparo.receita ?? [];
  const rend = Number(preparo.rendimento) || 0;
  if (receita.length === 0 || rend <= 0) return { ok: false, erro: "Cadastre a receita e o rendimento do preparo antes de produzir.", faltas: [] };
  if (receita.some((r) => r.ingredienteId === preparo.id)) return { ok: false, erro: "A receita não pode usar o próprio preparo.", faltas: [] };
  const q = r3(quantidade);
  if (!(q > 0)) return { ok: false, erro: "Informe a quantidade produzida.", faltas: [] };

  const necessidade = necessidadeFicha(receita, rend, q);
  const consumo = planejarBaixa(necessidade, ingredientes, opts);
  if (!consumo.ok) return { ok: false, erro: "Faltam insumos para este lote.", faltas: consumo.faltas };

  const custoLote = consumo.baixa.reduce((s, b) => s + b.quantidade * b.custoUnit, 0);
  const entrada = planejarEntrada(preparo, q, custoLote);
  return { ok: true, consumo, entrada, custoLote: r2(custoLote), custoUnit: entrada.custoUnit };
}
