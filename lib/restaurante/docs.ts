// lib/restaurante/docs.ts
// Normaliza documentos do Firestore (rest*) em objetos tipados com defaults
// seguros. Usado pelo servidor (Admin SDK) e pela tela (onSnapshot). Puro.

import type { Ingrediente, ItemFicha, ItemPedido, Lote, Movimento, Pedido, Prato, StatusPedido } from "./tipos";
import { STATUS_PEDIDO } from "./tipos";
import { isUnidade, isUnidadeBase } from "./unidades";

type Raw = Record<string, unknown> | undefined;

const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v: unknown) => (typeof v === "string" ? v : "");

function ficha(v: unknown): ItemFicha[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (x ?? {}) as Record<string, unknown>)
    .filter((x) => typeof x.ingredienteId === "string")
    .map((x) => ({
      ingredienteId: String(x.ingredienteId),
      quantidade: num(x.quantidade),
      ...(num(x.perdaPct) > 0 ? { perdaPct: num(x.perdaPct) } : {}),
    }));
}

export function toIngrediente(id: string, d: Raw): Ingrediente {
  const x = d ?? {};
  const base = isUnidadeBase(x.unidadeBase) ? x.unidadeBase : "un";
  const exib = isUnidade(x.unidadeExibicao) ? x.unidadeExibicao : base;
  return {
    id,
    nome: str(x.nome),
    unidadeBase: base,
    unidadeExibicao: exib,
    saldo: num(x.saldo),
    minimo: num(x.minimo),
    custoMedio: num(x.custoMedio),
    preparo: x.preparo === true,
    receita: ficha(x.receita),
    rendimento: num(x.rendimento),
    ativo: x.ativo !== false,
    alertaNivel: x.alertaNivel === "baixo" || x.alertaNivel === "zerado" ? x.alertaNivel : "ok",
    temMovimentos: x.temMovimentos === true,
    criadoEm: num(x.criadoEm),
    atualizadoEm: num(x.atualizadoEm),
  };
}

export function toPrato(id: string, d: Raw): Prato {
  const x = d ?? {};
  return {
    id,
    nome: str(x.nome),
    preco: num(x.preco),
    categoria: str(x.categoria),
    ativo: x.ativo === true,
    ficha: ficha(x.ficha),
    rendimento: num(x.rendimento, 1) > 0 ? num(x.rendimento, 1) : 1,
    jaPedido: x.jaPedido === true,
    criadoEm: num(x.criadoEm),
    atualizadoEm: num(x.atualizadoEm),
  };
}

const isStatus = (s: unknown): s is StatusPedido => (STATUS_PEDIDO as readonly string[]).includes(String(s));

export function toPedido(id: string, d: Raw): Pedido {
  const x = d ?? {};
  const itens: ItemPedido[] = Array.isArray(x.itens)
    ? x.itens.map((r) => {
        const i = (r ?? {}) as Record<string, unknown>;
        return {
          pratoId: str(i.pratoId),
          nome: str(i.nome),
          preco: num(i.preco),
          qtd: num(i.qtd, 1),
          obs: str(i.obs),
          custoUnit: num(i.custoUnit),
          ficha: ficha(i.ficha),
          rendimento: num(i.rendimento, 1) > 0 ? num(i.rendimento, 1) : 1,
        };
      })
    : [];
  return {
    id,
    numero: num(x.numero),
    origem: (["balcao", "mesa", "delivery", "outro"].includes(String(x.origem)) ? x.origem : "balcao") as Pedido["origem"],
    mesa: str(x.mesa),
    cliente: str(x.cliente),
    observacao: str(x.observacao),
    itens,
    total: num(x.total),
    custoTotal: num(x.custoTotal),
    status: isStatus(x.status) ? x.status : "recebido",
    transicoes: (x.transicoes && typeof x.transicoes === "object" ? x.transicoes : {}) as Pedido["transicoes"],
    baixaFeita: x.baixaFeita === true,
    baixa: Array.isArray(x.baixa) ? (x.baixa as Pedido["baixa"]) : [],
    baixaForcada: x.baixaForcada === true,
    motivoForcado: str(x.motivoForcado),
    destinoBaixa: x.destinoBaixa === "estorno" || x.destinoBaixa === "perda" ? x.destinoBaixa : undefined,
    motivoCancelamento: str(x.motivoCancelamento),
    criadoEm: num(x.criadoEm),
    atualizadoEm: num(x.atualizadoEm),
  };
}

export function toMovimento(id: string, d: Raw): Movimento {
  const x = (d ?? {}) as Record<string, unknown>;
  return { id, ...(x as Omit<Movimento, "id">) };
}

export function toLote(id: string, d: Raw): Lote {
  const x = (d ?? {}) as Record<string, unknown>;
  return { id, ...(x as Omit<Lote, "id">) };
}
