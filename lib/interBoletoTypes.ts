// Banco Inter: tipos e regras puras dos boletos (sem I/O).
import { randomBytes } from "node:crypto";
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
  /** Havia mais de uma entrada do extrato lançada à mão no mesmo valor/janela: conferir duplicata no caixa. */
  revisarCaixa?: boolean;
};

const SEU_NUMERO_MAX = 15;
const ID_LEN = 12;
const ALFABETO = "0123456789abcdefghijklmnopqrstuvwxyz";

/** Id de 12 caracteres [0-9a-z] (crypto, base36 sem viés). */
export function newBoletoId(): string {
  let out = "";
  while (out.length < ID_LEN) {
    for (const b of randomBytes(ID_LEN * 2)) {
      // 252 = 7 * 36: descarta o resto para não enviesar o módulo.
      if (b < 252 && out.length < ID_LEN) out += ALFABETO[b % 36];
    }
  }
  return out;
}

/** "seuNumero" enviado ao Inter (máx. 15 caracteres) = id do boleto. */
export function seuNumeroDe(id: string): string {
  if (id.length > SEU_NUMERO_MAX) {
    throw new Error(`seuNumero excede ${SEU_NUMERO_MAX} caracteres`);
  }
  return id;
}

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
