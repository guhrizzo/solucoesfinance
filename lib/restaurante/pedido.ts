// lib/restaurante/pedido.ts
// Regras do pedido: máquina de status, montagem dos itens a partir do
// cardápio (o servidor NUNCA usa preço/custo vindo do client), atraso e a
// agregação da aba Produção. Puro e testado.

import type { Falta, Ingrediente, ItemPedido, OrigemPedido, Pedido, Prato, StatusPedido } from "./tipos";
import { ORIGENS_PEDIDO } from "./tipos";
import { custoFicha, necessidadeItens, verificarFaltas } from "./ficha";
import { r2, r3 } from "./unidades";

/** Fluxo único: recebido → em_preparo → pronto → entregue; cancela até "pronto". */
export const TRANSICOES: Record<StatusPedido, StatusPedido[]> = {
  recebido: ["em_preparo", "cancelado"],
  em_preparo: ["pronto", "cancelado"],
  pronto: ["entregue", "cancelado"],
  entregue: [],
  cancelado: [],
};

export const STATUS_ABERTOS: StatusPedido[] = ["recebido", "em_preparo", "pronto"];

/**
 * "ok" pode avançar; "noop" já está no destino (reenvio — idempotente, não faz
 * nada); "invalida" não pode (pular, voltar ou sair de entregue/cancelado).
 */
export function validarTransicao(de: StatusPedido, para: StatusPedido): "ok" | "noop" | "invalida" {
  if (de === para) return "noop";
  return TRANSICOES[de]?.includes(para) ? "ok" : "invalida";
}

/** Próximo status do fluxo normal (botão "avançar"); null se não há. */
export function proximoStatus(s: StatusPedido): StatusPedido | null {
  return TRANSICOES[s]?.find((x) => x !== "cancelado") ?? null;
}

export const isOrigem = (o: unknown): o is OrigemPedido => (ORIGENS_PEDIDO as readonly string[]).includes(String(o));

export const MAX_ITENS_PEDIDO = 40;
export const MAX_QTD_ITEM = 99;

type IngCusto = Pick<Ingrediente, "id" | "nome" | "custoMedio" | "unidadeBase">;

/**
 * Monta os itens do pedido a partir do cardápio atual: nome, preço, ficha e
 * custo vêm do PRATO (snapshot), nunca do corpo da requisição.
 */
export function montarItens(
  entrada: unknown,
  pratos: Map<string, Prato>,
  ingredientes: Map<string, IngCusto>,
): { ok: true; itens: ItemPedido[]; total: number; custoTotal: number } | { ok: false; erro: string } {
  if (!Array.isArray(entrada) || entrada.length === 0) return { ok: false, erro: "Adicione ao menos um prato ao pedido." };
  if (entrada.length > MAX_ITENS_PEDIDO) return { ok: false, erro: `O pedido pode ter no máximo ${MAX_ITENS_PEDIDO} itens.` };
  const itens: ItemPedido[] = [];
  for (const raw of entrada) {
    const it = (raw ?? {}) as Record<string, unknown>;
    const prato = pratos.get(String(it.pratoId ?? ""));
    if (!prato) return { ok: false, erro: "Prato não encontrado no cardápio." };
    if (!prato.ativo) return { ok: false, erro: `${prato.nome} está inativo no cardápio.` };
    if (prato.ficha.length === 0) return { ok: false, erro: `${prato.nome} não tem ficha técnica.` };
    const qtd = Number(it.qtd);
    if (!Number.isInteger(qtd) || qtd < 1 || qtd > MAX_QTD_ITEM) return { ok: false, erro: `Quantidade inválida para ${prato.nome} (1 a ${MAX_QTD_ITEM}).` };
    const custo = custoFicha(prato.ficha, prato.rendimento, ingredientes);
    itens.push({
      pratoId: prato.id,
      nome: prato.nome,
      preco: r2(prato.preco),
      qtd,
      obs: String(it.obs ?? "").trim().slice(0, 140),
      custoUnit: r2(custo.custoPorcao),
      ficha: prato.ficha.map((f) => ({ ...f })),
      rendimento: prato.rendimento > 0 ? prato.rendimento : 1,
    });
  }
  return { ok: true, itens, total: totalItens(itens), custoTotal: r2(itens.reduce((s, i) => s + i.custoUnit * i.qtd, 0)) };
}

export function totalItens(itens: Pick<ItemPedido, "preco" | "qtd">[]): number {
  return r2(itens.reduce((s, i) => s + i.preco * i.qtd, 0));
}

/** Necessidade bruta de insumos de um pedido (pela ficha congelada nos itens). */
export function necessidadePedido(p: Pick<Pedido, "itens">): Map<string, number> {
  return necessidadeItens(p.itens);
}

/** Minutos-limite em cada status antes de o cartão ficar "atrasado". */
export const LIMITE_MIN: Partial<Record<StatusPedido, number>> = { recebido: 10, em_preparo: 25, pronto: 10 };

/** Desde quando o pedido está no status atual (ms). */
export function desdeStatus(p: Pick<Pedido, "status" | "transicoes" | "criadoEm">): number {
  return p.transicoes?.[p.status]?.em ?? p.criadoEm;
}

export function minutosNoStatus(p: Pick<Pedido, "status" | "transicoes" | "criadoEm">, agora: number): number {
  return Math.max(0, Math.floor((agora - desdeStatus(p)) / 60_000));
}

export function estaAtrasado(p: Pick<Pedido, "status" | "transicoes" | "criadoEm">, agora: number): boolean {
  const lim = LIMITE_MIN[p.status];
  return lim !== undefined && minutosNoStatus(p, agora) >= lim;
}

export interface LinhaProducao {
  pratoId: string;
  nome: string;
  recebido: number;
  emPreparo: number;
  total: number;
}

export interface Producao {
  pratos: LinhaProducao[];
  /** Insumos que os pedidos RECEBIDOS (ainda sem baixa) vão precisar × saldo. */
  insumos: { ingredienteId: string; nome: string; unidadeBase: Ingrediente["unidadeBase"]; necessario: number; saldo: number; falta: number }[];
  faltas: Falta[];
}

/** "O que precisa ser feito agora": pratos dos pedidos recebidos/em preparo + insumos dos ainda não baixados. */
export function agregarProducao(
  pedidos: Pick<Pedido, "status" | "itens" | "baixaFeita">[],
  ingredientes: Map<string, Pick<Ingrediente, "nome" | "saldo" | "unidadeBase" | "ativo">>,
): Producao {
  const porPrato = new Map<string, LinhaProducao>();
  const pendentes: Pick<Pedido, "itens">[] = [];
  for (const p of pedidos) {
    if (p.status !== "recebido" && p.status !== "em_preparo") continue;
    if (!p.baixaFeita) pendentes.push(p);
    for (const it of p.itens) {
      const l = porPrato.get(it.pratoId) ?? { pratoId: it.pratoId, nome: it.nome, recebido: 0, emPreparo: 0, total: 0 };
      if (p.status === "recebido") l.recebido += it.qtd; else l.emPreparo += it.qtd;
      l.total += it.qtd;
      porPrato.set(it.pratoId, l);
    }
  }
  const nec = necessidadeItens(pendentes.flatMap((p) => p.itens));
  const insumos = [...nec.entries()].map(([id, necessario]) => {
    const ing = ingredientes.get(id);
    const saldo = r3(ing?.saldo ?? 0);
    return {
      ingredienteId: id,
      nome: ing?.nome ?? "(ingrediente removido)",
      unidadeBase: ing?.unidadeBase ?? ("un" as const),
      necessario,
      saldo,
      falta: r3(Math.max(0, necessario - Math.max(0, saldo))),
    };
  }).sort((a, b) => b.falta - a.falta || a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    pratos: [...porPrato.values()].sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, "pt-BR")),
    insumos,
    faltas: verificarFaltas(nec, ingredientes),
  };
}
