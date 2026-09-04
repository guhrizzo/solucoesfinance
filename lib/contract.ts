// lib/contract.ts
// Contrato de prestação de serviços aceito pelo cliente ANTES do pagamento de
// um plano (ver docs/superpowers/specs/2026-09-03-contrato-checkout-assinatura-design.md).
//
// O documento mora em `users/{ownerUid}/contracts/{contractId}` e é escrito
// SOMENTE pelo servidor (Admin SDK): a conta lê pra baixar/conferir, mas nunca
// escreve pelo client (firestore.rules trava, no mesmo espírito de
// `profile/billing`).
//
// Aqui ficam: tipos, rótulos, validação de CNPJ/CPF (com dígito verificador,
// porque é documento legal), máscaras, limites de campo e a canonicalização
// usada pra gerar o hash SHA-256 que identifica a versão aceita.

import type { PlanId } from "./billingPlans";

// ─── Regime tributário (só registro cadastral — não muda cláusula nem preço) ──

export type TaxRegime = "mei" | "simples_nacional" | "lucro_presumido" | "lucro_real";

export const TAX_REGIMES: TaxRegime[] = [
  "mei",
  "simples_nacional",
  "lucro_presumido",
  "lucro_real",
];

export const REGIME_LABEL: Record<TaxRegime, string> = {
  mei: "MEI — Microempreendedor Individual",
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
};

export function isTaxRegime(v: unknown): v is TaxRegime {
  return typeof v === "string" && (TAX_REGIMES as string[]).includes(v);
}

// ─── Versão do texto do contrato ─────────────────────────────────────────────
// Incremente sempre que o texto de lib/contractText.ts mudar de forma
// relevante. Fica gravado no ContractDoc e no hash — contratos antigos
// continuam identificando a versão que a pessoa realmente aceitou.
export const CONTRACT_VERSION = 1;

// ─── Limites de tamanho dos campos do formulário ─────────────────────────────
export const CONTRACT_LIMITS = {
  razaoSocial: 160,
  endereco: 240,
  nome: 120,
} as const;

// ─── Tipos do documento ─────────────────────────────────────────────────────

export type ContractStatus = "pending_payment" | "signed" | "void";

export interface ContractContratante {
  razaoSocial: string;
  /** Guardado já mascarado: "00.000.000/0000-00". */
  cnpj: string;
  regimeTributario: TaxRegime;
  /** Endereço em linha única, texto livre. */
  endereco: string;
}

export interface ContractSignatario {
  nome: string;
  /** Guardado já mascarado: "000.000.000-00". */
  cpf: string;
  email: string;
}

export interface ContractDoc {
  contractId: string;
  ownerUid: string;
  /** scope.uid de quem preencheu (pode ser o dono ou — futuramente — um preposto). */
  signatarioUid: string;

  contractVersion: number;
  planId: PlanId;
  /** Snapshots no momento do aceite (o plano pode mudar de preço depois). */
  planLabel: string;
  priceCents: number;

  contratante: ContractContratante;
  signatario: ContractSignatario;

  /** SHA-256 hex do payload canônico (ver canonicalContractPayload). */
  hash: string;
  acceptedAt: number;
  ip: string | null;
  userAgent: string | null;

  status: ContractStatus;

  orderNsu: string | null;
  transactionNsu: string | null;
  paidAt: number | null;
  periodEnd: number | null;

  emailedAt: number | null;
  emailError: string | null;

  createdAt: number;
  updatedAt: number;
}

// ─── Máscaras ───────────────────────────────────────────────────────────────

/** "00.000.000/0000-00" progressivo enquanto digita. */
export function maskCnpj(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** "000.000.000-00" progressivo enquanto digita. */
export function maskCpf(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

// ─── Validação com dígito verificador ───────────────────────────────────────

export function isValidCnpj(value: string): boolean {
  const c = value.replace(/\D/g, "");
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;

  const calc = (base: string, weights: number[]): number => {
    const sum = base
      .split("")
      .reduce((acc, digit, i) => acc + Number(digit) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(c.slice(0, 12), w1);
  const d2 = calc(c.slice(0, 12) + d1, w2);
  return c.slice(12) === `${d1}${d2}`;
}

export function isValidCpf(value: string): boolean {
  const c = value.replace(/\D/g, "");
  if (c.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(c)) return false;

  const calc = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Canonicalização + hash ─────────────────────────────────────────────────
// O payload canônico é um subconjunto determinístico do contrato, com as chaves
// em ordem fixa. Serializado, ele gera o hash SHA-256 que prova que o PDF
// enviado por e-mail corresponde exatamente ao que a pessoa aceitou.

export interface ContractHashInput {
  contractVersion: number;
  planId: PlanId;
  priceCents: number;
  contratante: ContractContratante;
  signatario: ContractSignatario;
  acceptedAt: number;
}

// O hash em si (SHA-256 do JSON canônico) é calculado server-side na rota
// app/api/billing/contract (runtime nodejs) — não fica aqui pra não arrastar
// `node:crypto` pro bundle do client, que também importa este módulo.

/** JSON estável (chaves ordenadas) do payload que entra no hash. */
export function canonicalContractPayload(input: ContractHashInput): string {
  const ordered = {
    acceptedAt: input.acceptedAt,
    contractVersion: input.contractVersion,
    contratante: {
      cnpj: input.contratante.cnpj,
      endereco: input.contratante.endereco,
      razaoSocial: input.contratante.razaoSocial,
      regimeTributario: input.contratante.regimeTributario,
    },
    planId: input.planId,
    priceCents: input.priceCents,
    signatario: {
      cpf: input.signatario.cpf,
      email: input.signatario.email,
      nome: input.signatario.nome,
    },
  };
  return JSON.stringify(ordered);
}
