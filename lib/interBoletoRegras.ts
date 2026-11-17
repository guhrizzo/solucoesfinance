// Banco Inter: tipos e regras puras dos boletos (sem I/O e sem node:*).
// Fica separado de interBoletoTypes.ts para o client (aba Boletos) importar
// grupoDe/resumo sem puxar node:crypto para o bundle do navegador.
import type { PagadorEndereco } from "./pagadorEndereco";

export type BoletoSituacao =
  | "EM_PROCESSAMENTO"
  | "A_RECEBER"
  | "ATRASADO"
  | "RECEBIDO"
  | "MARCADO_RECEBIDO"
  | "CANCELADO"
  | "EXPIRADO"
  | "FALHA_EMISSAO"
  | "PROTESTO";

export type BoletoGrupo = "aguardando" | "vencido" | "pago" | "outros";

export type BoletoDoc = {
  id: string;
  receivableId?: string;
  payer: {
    nome: string;
    doc: string;
    email?: string;
    telefone?: string;
    endereco: PagadorEndereco;
  };
  amount: number;
  /** YYYY-MM-DD */
  dueDate: string;
  fineRate?: number;
  interestRate?: number;
  codigoSolicitacao?: string;
  situacao: BoletoSituacao;
  linhaDigitavel?: string;
  codigoBarras?: string;
  nossoNumero?: string;
  pixCopiaECola?: string;
  valorRecebido?: number;
  origemRecebimento?: "BOLETO" | "PIX";
  paidAt?: string;
  cashflowId?: string;
  interTxKey?: string;
  createdAt: string;
  createdBy: string;
  cancelledBy?: string;
  /** Boleto sem código descartado à força pelo dono (uid) e quando (ISO). */
  descartadoManualmentePor?: string;
  descartadoManualmenteEm?: string;
  /** null = erro anterior já resolvido. */
  lastError?: string | null;
  /** O banco confirmou o pagamento de um boleto que aqui estava cancelado/expirado/com falha. */
  pagoAposCancelamento?: boolean;
  /**
   * Conferir duplicata no caixa: havia mais de uma entrada do extrato lançada à mão no
   * mesmo valor/janela, ou uma entrada à mão que o boleto não pôde adotar (baixada nesta
   * conta sem item do extrato, ou do extrato mas baixada em outra conta).
   */
  revisarCaixa?: boolean;
  /** Chave de idempotência do envio (modal de emissão): repetir o pedido devolve este boleto. */
  idemKey?: string;
};

export function grupoDe(
  b: Pick<BoletoDoc, "situacao" | "dueDate">,
  hoje: string,
): BoletoGrupo {
  switch (b.situacao) {
    case "EM_PROCESSAMENTO":
      return "aguardando";
    case "A_RECEBER":
      return b.dueDate < hoje ? "vencido" : "aguardando";
    case "ATRASADO":
      return "vencido";
    case "RECEBIDO":
    case "MARCADO_RECEBIDO":
      return "pago";
    default:
      return "outros";
  }
}

type Soma = { qtd: number; total: number };

export function resumo(
  bs: BoletoDoc[],
  hoje: string,
): { aguardando: Soma; vencido: Soma; pago: Soma; aReceber: Soma } {
  const cent = { aguardando: 0, vencido: 0, pago: 0 };
  const qtd = { aguardando: 0, vencido: 0, pago: 0 };
  for (const b of bs) {
    const g = grupoDe(b, hoje);
    if (g === "outros") continue;
    cent[g] += Math.round(b.amount * 100);
    qtd[g] += 1;
  }
  const reais = (c: number) => c / 100;
  return {
    aguardando: { qtd: qtd.aguardando, total: reais(cent.aguardando) },
    vencido: { qtd: qtd.vencido, total: reais(cent.vencido) },
    pago: { qtd: qtd.pago, total: reais(cent.pago) },
    aReceber: {
      qtd: qtd.aguardando + qtd.vencido,
      total: reais(cent.aguardando + cent.vencido),
    },
  };
}

const TERMINAIS: ReadonlySet<BoletoSituacao> = new Set([
  "RECEBIDO",
  "MARCADO_RECEBIDO",
  "CANCELADO",
  "EXPIRADO",
  "FALHA_EMISSAO",
]);

/** Pode a situação `nova` ser aplicada sobre `atual`? Estados terminais não mudam. */
export function podeAplicar(atual: BoletoSituacao, nova: BoletoSituacao): boolean {
  if (atual === nova) return false;
  return !TERMINAIS.has(atual);
}
