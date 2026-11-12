// lib/restaurante/validate.ts
// Validação/normalização das entradas das rotas (ingrediente e prato). Os
// formulários mandam quantidades e custo na UNIDADE DE EXIBIÇÃO (kg, L...);
// aqui tudo é convertido para a unidade base antes de gravar. Puro e testado.

import type { Ingrediente, ItemFicha, Unidade, UnidadeBase } from "./tipos";
import { validarFicha, type ErroFicha } from "./ficha";
import { compativel, custoParaBase, isUnidade, isUnidadeBase, paraBase, r2 } from "./unidades";

export type Resultado<T> = { ok: true; dados: T } | { ok: false; erro: string; erros?: ErroFicha[] };

const LIMITE_QTD = 1e9;

function numero(v: unknown, campo: string, { min = 0, max = LIMITE_QTD, obrigatorio = false } = {}): number | string {
  if (v === undefined || v === null || v === "") return obrigatorio ? `Informe ${campo}.` : 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return `${campo[0].toUpperCase()}${campo.slice(1)} inválido.`;
  return n;
}

export interface IngredienteDados {
  nome: string;
  unidadeBase: UnidadeBase;
  unidadeExibicao: Unidade;
  minimo: number;
  custoMedio: number;
  preparo: boolean;
  receita: ItemFicha[];
  rendimento: number;
  ativo: boolean;
  /** Só na criação. */
  saldoInicial: number;
}

/**
 * `atual`: ingrediente existente (edição) — a unidade base não muda depois de
 * criada. `catalogo`: todos os ingredientes (para validar a receita do preparo).
 */
export function validarIngrediente(
  body: Record<string, unknown>,
  catalogo: Map<string, Pick<Ingrediente, "id" | "nome" | "preparo" | "ativo">>,
  atual?: Pick<Ingrediente, "id" | "unidadeBase">,
): Resultado<IngredienteDados> {
  const nome = String(body.nome ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  if (nome.length < 2) return { ok: false, erro: "Informe o nome do ingrediente." };

  const base = atual ? atual.unidadeBase : body.unidadeBase;
  if (!isUnidadeBase(base)) return { ok: false, erro: "Unidade base inválida (g, ml ou un)." };
  const exib = body.unidadeExibicao ?? base;
  if (!isUnidade(exib) || !compativel(exib, base)) return { ok: false, erro: "Unidade de exibição incompatível com a unidade base." };

  const minimo = numero(body.minimo, "estoque mínimo");
  if (typeof minimo === "string") return { ok: false, erro: minimo };
  const custo = numero(body.custo, "custo", { max: 1e7 });
  if (typeof custo === "string") return { ok: false, erro: custo };
  const saldo = atual ? 0 : numero(body.saldoInicial, "saldo inicial");
  if (typeof saldo === "string") return { ok: false, erro: saldo };

  const preparo = body.preparo === true;
  let receita: ItemFicha[] = [];
  let rendimento = 0;
  if (preparo) {
    const r = validarFicha(body.receita ?? [], catalogo, { paraPreparo: atual?.id ?? "" });
    if (!r.ok) return { ok: false, erro: "Revise a receita do preparo.", erros: r.erros };
    receita = r.ficha;
    const rend = numero(body.rendimento, "rendimento");
    if (typeof rend === "string") return { ok: false, erro: rend };
    rendimento = paraBase(rend, exib, base) ?? 0;
    if (receita.length > 0 && rendimento <= 0) return { ok: false, erro: "Informe quanto a receita do preparo rende." };
  }

  return {
    ok: true,
    dados: {
      nome,
      unidadeBase: base,
      unidadeExibicao: exib,
      minimo: paraBase(minimo, exib, base) ?? 0,
      custoMedio: custoParaBase(custo, exib),
      preparo,
      receita,
      rendimento,
      ativo: body.ativo !== false,
      saldoInicial: paraBase(saldo, exib, base) ?? 0,
    },
  };
}

export interface PratoDados {
  nome: string;
  preco: number;
  categoria: string;
  ativo: boolean;
  ficha: ItemFicha[];
  rendimento: number;
}

export function validarPrato(
  body: Record<string, unknown>,
  catalogo: Map<string, Pick<Ingrediente, "id" | "nome" | "preparo" | "ativo">>,
): Resultado<PratoDados> {
  const nome = String(body.nome ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (nome.length < 2) return { ok: false, erro: "Informe o nome do prato." };
  const preco = numero(body.preco, "preço", { max: 1e6, obrigatorio: true });
  if (typeof preco === "string") return { ok: false, erro: preco };
  const rendimento = numero(body.rendimento ?? 1, "rendimento", { max: 10_000 });
  if (typeof rendimento === "string" || rendimento <= 0) return { ok: false, erro: "Rendimento inválido (porções)." };
  const categoria = String(body.categoria ?? "").trim().slice(0, 40);
  const f = validarFicha(body.ficha ?? [], catalogo);
  if (!f.ok) return { ok: false, erro: "Revise a ficha técnica.", erros: f.erros };
  const ativo = body.ativo === true;
  if (ativo && f.ficha.length === 0) return { ok: false, erro: "Um prato não pode ser ativado com a ficha técnica vazia." };
  return { ok: true, dados: { nome, preco: r2(preco), categoria, ativo, ficha: f.ficha, rendimento } };
}

/** Quantidade de movimento (entrada, perda, ajuste, lote) na unidade informada → base. */
export function quantidadeBase(
  valor: unknown,
  unidade: unknown,
  base: UnidadeBase,
  { permitirZero = false } = {},
): number | string {
  const u = isUnidade(unidade) ? unidade : base;
  if (!compativel(u, base)) return "Unidade incompatível com o ingrediente.";
  const n = Number(valor);
  if (valor === "" || valor === null || valor === undefined || !Number.isFinite(n) || n < 0 || (!permitirZero && n === 0) || n > LIMITE_QTD) {
    return "Quantidade inválida.";
  }
  return paraBase(n, u, base) ?? 0;
}
