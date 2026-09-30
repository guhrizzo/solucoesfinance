// lib/pdv.ts
// ─────────────────────────────────────────────────────────────────────────────
// PDV (frente de caixa) do Painel de Vendas — tipos e contas compartilhados
// entre a tela /vendas/pdv e as rotas /api/vendas/pdv e /api/vendas/caixa.
//
// Modelo (tudo dentro do ninho do dono, users/{ownerUid}/...):
//   • profile/pdv          → { caixaAbertoId, nextNumero } — um caixa aberto
//                            por conta e a numeração sequencial das vendas.
//   • caixas/{caixaId}     → turno: abre com troco inicial, acumula o total
//                            por forma de pagamento a cada venda e fecha com o
//                            valor conferido (esperado × conferido = diferença).
//   • pdvVendas/{vendaId}  → a venda (itens + pagamento). O id é gerado no
//                            cliente, então reenviar a mesma venda não duplica.
//   • cashflow (ou vendas) → uma ENTRADA por item, via registrarVendaAdmin —
//                            é o que o Painel de Vendas, o Dashboard e o
//                            Fluxo de Caixa já leem. Crédito parcelado entra
//                            com o valor cheio na data da venda.
// ─────────────────────────────────────────────────────────────────────────────

export type FormaPagamento = "dinheiro" | "pix" | "debito" | "credito";

export const FORMAS_PAGAMENTO: FormaPagamento[] = ["dinheiro", "pix", "debito", "credito"];

export const MAX_PARCELAS = 12;

export const UNIDADES = ["UN", "KG", "G", "L", "M", "CX", "PC"] as const;
export type Unidade = (typeof UNIDADES)[number];

export type TotaisPorForma = Record<FormaPagamento, number>;

export const zeroTotais = (): TotaisPorForma => ({ dinheiro: 0, pix: 0, debito: 0, credito: 0 });

export interface PdvItem {
  /** SKU do estoque quando o item veio de lá (dá baixa); "" = item avulso. */
  sku: string;
  descricao: string;
  quantidade: number;
  unidade: Unidade;
  precoUnitario: number;
  subtotal: number;
}

export interface PdvVenda {
  id: string;
  caixaId: string;
  numero: number;
  itens: PdvItem[];
  total: number;
  forma: FormaPagamento;
  /** Só crédito passa de 1. */
  parcelas: number;
  /** Dinheiro: valor entregue pelo cliente (o troco sai daqui). */
  valorRecebido: number;
  troco: number;
  lancarNoCaixa: boolean;
  date: string; // YYYY-MM-DD (horário local de quem vendeu)
  createdAt: number;
  operador: string;
  createdBy: string;
  createdByName: string;
}

export interface Caixa {
  id: string;
  status: "aberto" | "fechado";
  operador: string;
  trocoInicial: number;
  /** Vendido no turno, por forma de pagamento (acumulado a cada venda). */
  totais: TotaisPorForma;
  qtdVendas: number;
  totalVendas: number;
  openedAt: number;
  openedBy: string;
  openedByName: string;
  date: string; // dia da abertura (YYYY-MM-DD, local)
  // ── preenchidos no fechamento ──
  closedAt?: number;
  closedBy?: string;
  closedByName?: string;
  esperado?: TotaisPorForma;
  conferido?: TotaisPorForma;
  diferenca?: TotaisPorForma;
  diferencaTotal?: number;
  observacao?: string;
}

/** Arredonda pra centavos. */
export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Quantidade com até 3 casas (KG, L…). */
export const r3 = (n: number) => Math.round((Number(n) || 0) * 1000) / 1000;

/**
 * Valor que deve estar no caixa ao fechar, por forma: o dinheiro inclui o
 * troco inicial (a gaveta começou com ele); as outras formas são só o vendido.
 */
export function esperadoNoFechamento(c: Pick<Caixa, "trocoInicial" | "totais">): TotaisPorForma {
  const t = { ...zeroTotais(), ...(c.totais || {}) };
  return {
    dinheiro: r2(t.dinheiro + (c.trocoInicial || 0)),
    pix: r2(t.pix),
    debito: r2(t.debito),
    credito: r2(t.credito),
  };
}

export const somaTotais = (t: TotaisPorForma) => r2(FORMAS_PAGAMENTO.reduce((s, f) => s + (t[f] || 0), 0));

/** "YYYY-MM-DD" no fuso de quem está usando (não em UTC). */
export function localDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Rótulo curto da forma de pagamento pra nota do lançamento no caixa (pt-BR, fica gravado). */
export function notaPagamento(forma: FormaPagamento, parcelas: number): string {
  const nome = { dinheiro: "Dinheiro", pix: "Pix", debito: "Débito", credito: "Crédito" }[forma];
  return forma === "credito" && parcelas > 1 ? `${nome} ${parcelas}x` : nome;
}
