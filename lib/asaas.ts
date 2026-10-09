// lib/asaas.ts
// Cliente server-side da API v3 do Asaas (boleto + cartão recorrente).
// SOMENTE para rotas de servidor (app/api/**). Nunca importe de "use client".
//
// Modelo: cada assinatura do NexusFi vira uma `subscription` do Asaas com
// `billingType` BOLETO ou CREDIT_CARD. O cliente paga a 1ª cobrança na fatura
// hospedada do Asaas (`invoiceUrl`) — nenhum dado de cartão passa por nós.
//  - CREDIT_CARD: o Asaas guarda o cartão na 1ª cobrança e cobra sozinho nos
//    ciclos seguintes (recorrência).
//  - BOLETO: o Asaas emite (e envia por e-mail) um boleto novo a cada ciclo.
//
// NUNCA confiamos no corpo do webhook: todo evento é reconferido com um GET
// na API (chave da conta) antes de mexer no acesso.

import crypto from "node:crypto";

const PROD_BASE = "https://api.asaas.com/v3";
const SANDBOX_BASE = "https://api-sandbox.asaas.com/v3";

export type AsaasBillingType = "BOLETO" | "CREDIT_CARD";
export type AsaasCycle = "MONTHLY" | "YEARLY";

export function asaasApiKey(): string {
  // Tolera aspas e "\$" colados do .env na hora de configurar o painel da Vercel.
  return (process.env.ASAAS_API_KEY || "").trim().replace(/^["']|["']$/g, "").replace(/^\\(?=\$)/, "");
}

export function asaasConfigured(): boolean {
  return !!asaasApiKey();
}

/** Chaves de sandbox começam com `$aact_hmlg_`; ASAAS_BASE_URL força outro host. */
function baseUrl(): string {
  const forced = (process.env.ASAAS_BASE_URL || "").trim().replace(/\/$/, "");
  if (forced) return forced;
  const sandbox =
    process.env.ASAAS_ENV === "sandbox" || asaasApiKey().startsWith("$aact_hmlg_");
  return sandbox ? SANDBOX_BASE : PROD_BASE;
}

async function asaasFetch(path: string, init?: RequestInit): Promise<any> {
  const key = asaasApiKey();
  if (!key) throw new Error("ASAAS_API_KEY não configurada.");

  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      access_token: key,
      "Content-Type": "application/json",
      Accept: "application/json",
      // O Asaas exige User-Agent nas chamadas de contas novas.
      "User-Agent": "NexusFi",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { _raw: text };
  }
  if (!res.ok) {
    const msg = Array.isArray(data?.errors)
      ? data.errors.map((e: any) => e?.description).filter(Boolean).join(" · ")
      : "";
    throw new Error(msg || `Asaas ${path} respondeu ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

// ─── Clientes ───────────────────────────────────────────────────────────────

export interface AsaasCustomerInput {
  name: string;
  email: string;
  /** CPF ou CNPJ (só dígitos ou mascarado — o Asaas aceita ambos). */
  cpfCnpj: string;
  externalReference?: string;
}

export async function createCustomer(input: AsaasCustomerInput): Promise<{ id: string }> {
  const data = await asaasFetch("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      cpfCnpj: input.cpfCnpj.replace(/\D/g, ""),
      externalReference: input.externalReference,
      // Quem manda os e-mails de cobrança é o próprio Asaas (boleto/fatura).
      notificationDisabled: false,
    }),
  });
  if (!data?.id) throw new Error("Asaas criou o cliente mas não devolveu o id.");
  return { id: String(data.id) };
}

// ─── Assinaturas ────────────────────────────────────────────────────────────

export type AsaasSubscriptionStatus = "ACTIVE" | "INACTIVE" | "EXPIRED";

export interface AsaasSubscription {
  id: string;
  status: AsaasSubscriptionStatus;
  externalReference: string;
  billingType: string;
  cycle: string;
  /** Valor de cada cobrança, em REAIS. */
  value: number;
  nextDueDate: string | null;
  deleted: boolean;
  raw: any;
}

function toSubscription(d: any): AsaasSubscription {
  return {
    id: String(d?.id || ""),
    status: d?.status,
    externalReference: String(d?.externalReference || ""),
    billingType: String(d?.billingType || ""),
    cycle: String(d?.cycle || ""),
    value: Number(d?.value) || 0,
    nextDueDate: d?.nextDueDate ?? null,
    deleted: !!d?.deleted,
    raw: d,
  };
}

export interface CreateSubscriptionInput {
  customerId: string;
  billingType: AsaasBillingType;
  /** Valor de cada cobrança, em CENTAVOS. */
  priceCents: number;
  cycle: AsaasCycle;
  /** YYYY-MM-DD — vencimento da 1ª cobrança. */
  nextDueDate: string;
  description: string;
  /** ownerUid__planId__contractId__ts — volta intacto em toda notificação. */
  externalReference: string;
  /** Para onde o Asaas redireciona o cliente depois de pagar (mesmo domínio da conta). */
  successUrl: string;
}

export async function createSubscription(input: CreateSubscriptionInput): Promise<AsaasSubscription> {
  const data = await asaasFetch("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customerId,
      billingType: input.billingType,
      value: input.priceCents / 100,
      nextDueDate: input.nextDueDate,
      cycle: input.cycle,
      description: input.description,
      externalReference: input.externalReference,
      callback: { successUrl: input.successUrl, autoRedirect: true },
    }),
  });
  if (!data?.id) {
    throw new Error(`Asaas criou a assinatura mas não devolveu o id: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return toSubscription(data);
}

export async function getSubscription(id: string): Promise<AsaasSubscription> {
  return toSubscription(await asaasFetch(`/subscriptions/${encodeURIComponent(id)}`));
}

/** Cancela a renovação: nenhuma cobrança futura. O acesso já pago segue até o fim do período. */
export async function cancelSubscription(id: string): Promise<void> {
  await asaasFetch(`/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ─── Cobranças ──────────────────────────────────────────────────────────────

export interface AsaasPayment {
  id: string;
  /** Id da assinatura que originou a cobrança (null = cobrança avulsa). */
  subscription: string | null;
  /** PENDING | RECEIVED | CONFIRMED | OVERDUE | REFUNDED | RECEIVED_IN_CASH | ... */
  status: string;
  billingType: string;
  /** Valor da cobrança em REAIS (bruto, sem descontar taxa). */
  value: number;
  externalReference: string;
  /** Fatura hospedada: o cliente escolhe/paga (cartão, boleto) aqui. */
  invoiceUrl: string | null;
  /** PDF do boleto (só em cobranças BOLETO). */
  bankSlipUrl: string | null;
  dueDate: string | null;
  raw: any;
}

function toPayment(d: any): AsaasPayment {
  return {
    id: String(d?.id || ""),
    subscription: d?.subscription ? String(d.subscription) : null,
    status: String(d?.status || ""),
    billingType: String(d?.billingType || ""),
    value: Number(d?.value) || 0,
    externalReference: String(d?.externalReference || ""),
    invoiceUrl: d?.invoiceUrl ?? null,
    bankSlipUrl: d?.bankSlipUrl ?? null,
    dueDate: d?.dueDate ?? null,
    raw: d,
  };
}

export async function getPayment(id: string): Promise<AsaasPayment> {
  return toPayment(await asaasFetch(`/payments/${encodeURIComponent(id)}`));
}

/** Cobranças geradas por uma assinatura (a mais recente primeiro). */
export async function listSubscriptionPayments(subscriptionId: string): Promise<AsaasPayment[]> {
  const data = await asaasFetch(
    `/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=100`
  );
  const rows: any[] = Array.isArray(data?.data) ? data.data : [];
  return rows.map(toPayment);
}

/** Cartão confirma na hora (CONFIRMED); boleto/Pix compensa como RECEIVED. */
export function isPaymentPaid(p: Pick<AsaasPayment, "status">): boolean {
  return p.status === "RECEIVED" || p.status === "CONFIRMED" || p.status === "RECEIVED_IN_CASH";
}

// ─── Webhook ────────────────────────────────────────────────────────────────
// Ao cadastrar o webhook no painel (Integrações → Webhooks) define-se um
// "token de autenticação"; o Asaas o reenvia no header `asaas-access-token`.

export function verifyWebhookToken(headerValue: string | null): { ok: boolean; reason?: string } {
  const secret = (process.env.ASAAS_WEBHOOK_TOKEN || "").trim();
  if (!secret) return { ok: false, reason: "ASAAS_WEBHOOK_TOKEN ausente" };
  if (!headerValue) return { ok: false, reason: "sem asaas-access-token" };
  const a = Buffer.from(secret);
  const b = Buffer.from(headerValue);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "token não confere" };
  }
  return { ok: true };
}

// ─── Utilidades ─────────────────────────────────────────────────────────────

/** "YYYY-MM-DD" de hoje no fuso de Brasília (o Asaas valida o vencimento nesse fuso). */
export function todayBR(nowMs = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}
