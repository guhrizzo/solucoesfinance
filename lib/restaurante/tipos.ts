// lib/restaurante/tipos.ts
// Tipos do módulo Restaurante (estoque de ingredientes, ficha técnica, pedidos,
// produção e alertas). Puro: sem Firebase — usado no client, no servidor e nos
// testes (tests/restaurante).
//
// Dados em users/{ownerUid}/rest* :
//   restIngredientes  ingredientes (saldo e custo SEMPRE na unidade base)
//   restPratos        itens de cardápio + ficha técnica
//   restPedidos       pedidos (snapshot de nome/preço/ficha/custo por item)
//   restMovimentos    log imutável de estoque (entrada, baixa, estorno, ...)
//   restLotes         lotes de produção de ingredientes "preparo" (imutáveis)
//   restContadores    contador do nº do pedido (só servidor)

export type UnidadeBase = "g" | "ml" | "un";
export type Unidade = "g" | "kg" | "ml" | "L" | "un";

/** Uma linha da ficha técnica (de prato ou da receita de um preparo). */
export interface ItemFicha {
  ingredienteId: string;
  /** Quantidade LÍQUIDA usada, na unidade base do ingrediente. */
  quantidade: number;
  /** Perda no pré-preparo, em % do peso bruto (0–90). Ex.: casca da batata. */
  perdaPct?: number;
}

export type NivelAlerta = "ok" | "baixo" | "zerado";

export interface Ingrediente {
  id: string;
  nome: string;
  unidadeBase: UnidadeBase;
  /** Unidade em que a tela mostra/compra (kg, L...). Convertível pra base. */
  unidadeExibicao: Unidade;
  /** Saldo na unidade base. Pode ficar negativo só por baixa forçada. */
  saldo: number;
  /** Estoque mínimo na unidade base. 0 = sem mínimo. */
  minimo: number;
  /** Custo médio em R$ por unidade base. */
  custoMedio: number;
  /** Feito na casa (molho, massa...), produzido em lote a partir da receita. */
  preparo: boolean;
  /** Receita do preparo (insumos crus — nunca outro preparo). */
  receita?: ItemFicha[];
  /** Quanto a receita rende, na unidade base do preparo. */
  rendimento?: number;
  ativo: boolean;
  /** Último nível avisado por WhatsApp (anti-spam). */
  alertaNivel?: NivelAlerta;
  /** Já teve movimento de estoque (bloqueia exclusão). */
  temMovimentos?: boolean;
  criadoEm?: number;
  atualizadoEm?: number;
}

export interface Prato {
  id: string;
  nome: string;
  /** Preço de venda por porção (R$). */
  preco: number;
  categoria: string;
  ativo: boolean;
  ficha: ItemFicha[];
  /** Quantas porções a ficha rende (1 por padrão). */
  rendimento: number;
  /** Já entrou em algum pedido (bloqueia exclusão). */
  jaPedido?: boolean;
  criadoEm?: number;
  atualizadoEm?: number;
}

export const STATUS_PEDIDO = ["recebido", "em_preparo", "pronto", "entregue", "cancelado"] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export const ORIGENS_PEDIDO = ["balcao", "mesa", "delivery", "outro"] as const;
export type OrigemPedido = (typeof ORIGENS_PEDIDO)[number];

export interface ItemPedido {
  pratoId: string;
  /** Snapshot do nome/preço no momento do pedido. */
  nome: string;
  preco: number;
  qtd: number;
  obs: string;
  /** Custo de 1 porção no momento do pedido (pela ficha). */
  custoUnit: number;
  /** Snapshot da ficha usada na baixa. */
  ficha: ItemFicha[];
  rendimento: number;
}

/** O que a baixa tirou do estoque — base exata do estorno. */
export interface LinhaBaixa {
  ingredienteId: string;
  nome: string;
  quantidade: number;
  custoUnit: number;
}

export interface Carimbo {
  em: number;
  uid: string;
  nome: string;
}

export interface Pedido {
  id: string;
  numero: number;
  origem: OrigemPedido;
  mesa: string;
  cliente: string;
  observacao: string;
  itens: ItemPedido[];
  total: number;
  custoTotal: number;
  status: StatusPedido;
  /** Carimbo por status alcançado. */
  transicoes: Partial<Record<StatusPedido, Carimbo>>;
  baixaFeita: boolean;
  baixa?: LinhaBaixa[];
  baixaForcada?: boolean;
  motivoForcado?: string;
  /** Cancelamento após a baixa: estorno (devolve) ou perda (não devolve). */
  destinoBaixa?: "estorno" | "perda";
  motivoCancelamento?: string;
  criadoEm: number;
  atualizadoEm: number;
}

export const TIPOS_MOVIMENTO = [
  "entrada",
  "baixa_pedido",
  "baixa_forcada",
  "estorno",
  "perda_pedido",
  "producao_entrada",
  "producao_consumo",
  "ajuste",
  "perda",
] as const;
export type TipoMovimento = (typeof TIPOS_MOVIMENTO)[number];

export interface Movimento {
  id: string;
  tipo: TipoMovimento;
  ingredienteId: string;
  ingredienteNome: string;
  unidadeBase: UnidadeBase;
  /** Variação do saldo (negativo = saída). Perda de pedido já baixado: 0. */
  delta: number;
  /** Quantidade envolvida (sempre positiva) — para perda_pedido, o que se perdeu. */
  quantidade: number;
  saldoAntes: number;
  saldoDepois: number;
  custoUnit: number;
  motivo: string;
  pedidoId?: string;
  pedidoNumero?: number;
  loteId?: string;
  ator: Carimbo;
  em: number;
}

export interface Lote {
  id: string;
  ingredienteId: string;
  ingredienteNome: string;
  unidadeBase: UnidadeBase;
  quantidade: number;
  consumos: LinhaBaixa[];
  custoLote: number;
  custoUnit: number;
  forcado: boolean;
  motivo: string;
  ator: Carimbo;
  em: number;
}

/** Linha da lista de faltas: o que precisa × o que tem. */
export interface Falta {
  ingredienteId: string;
  nome: string;
  unidadeBase: UnidadeBase;
  necessario: number;
  disponivel: number;
  falta: number;
}
