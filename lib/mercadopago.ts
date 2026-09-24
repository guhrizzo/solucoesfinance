// lib/mercadopago.ts
// Cliente server-side das Assinaturas do Mercado Pago (API `preapproval`).
// SOMENTE para rotas de servidor (app/api/**). Nunca importe de "use client".
//
// Fluxo: criamos uma assinatura SEM plano associado em status `pending` e
// mandamos o cliente pro `init_point` (checkout do MP) autorizar o meio de
// pagamento. A partir daí o MP cobra sozinho a cada ciclo e avisa por webhook:
//  - subscription_preapproval          → mudou o estado da assinatura
//  - subscription_authorized_payment   → uma cobrança do ciclo foi gerada/paga
//
// NUNCA confiamos no corpo do webhook: todo evento é reconferido com um GET na
// API (token do vendedor) antes de mexer no acesso da conta.

import crypto from "node:crypto";

const BASE = "https://api.mercadopago.com";

export type PreapprovalStatus = "pending" | "authorized" | "paused" | "cancelled";

export interface Preapproval {
  id: string;
  status: PreapprovalStatus;
  external_reference: string;
  payer_email?: string;
  reason?: string;
  init_point?: string;
  next_payment_date?: string | null;
  auto_recurring?: {
    frequency: number;
    frequency_type: string;
    transaction_amount: number;
    currency_id?: string;
  };
  raw: any;
}

export interface AuthorizedPayment {
  id: string;
  preapproval_id: string;
  /** scheduled | processed | recycling | cancelled */
  status: string;
  /** Valor da cobrança em REAIS. */
  transaction_amount: number;
  external_reference?: string;
  payment: { id: string; status: string; status_detail?: string } | null;
  raw: any;
}

export function mercadopagoConfigured(): boolean {
  return !!(process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
}

async function mpFetch(path: string, init?: RequestInit): Promise<any> {
  const token = (process.env.MERCADOPAGO_ACCESS_TOKEN || "").trim();
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado.");

  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
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
    throw new Error(
      data?.message || data?.error || `Mercado Pago ${path} respondeu ${res.status}: ${text.slice(0, 300)}`
    );
  }
  return data;
}

function toPreapproval(d: any): Preapproval {
  return {
    id: String(d?.id || ""),
    status: d?.status,
    external_reference: String(d?.external_reference || ""),
    payer_email: d?.payer_email,
    reason: d?.reason,
    init_point: d?.init_point,
    next_payment_date: d?.next_payment_date ?? null,
    auto_recurring: d?.auto_recurring,
    raw: d,
  };
}

export interface CreatePreapprovalInput {
  /** ownerUid__planId__contractId__ts — volta intacto em toda notificação. */
  externalReference: string;
  payerEmail: string;
  reason: string;
  /** Valor de cada cobrança, em CENTAVOS. */
  priceCents: number;
  /** Intervalo entre cobranças, em meses (1 = mensal, 12 = anual). */
  everyMonths: number;
  backUrl: string;
}

/** Cria a assinatura pendente; o cliente autoriza no `init_point`. */
export async function createPreapproval(
  input: CreatePreapprovalInput
): Promise<{ id: string; url: string; raw: any }> {
  const data = await mpFetch("/preapproval", {
    method: "POST",
    body: JSON.stringify({
      reason: input.reason,
      external_reference: input.externalReference,
      payer_email: input.payerEmail,
      back_url: input.backUrl,
      status: "pending",
      auto_recurring: {
        frequency: input.everyMonths,
        frequency_type: "months",
        transaction_amount: input.priceCents / 100,
        currency_id: "BRL",
      },
    }),
  });

  const url = data?.init_point || "";
  if (!url || typeof url !== "string") {
    throw new Error(
      `Mercado Pago criou a assinatura mas não achei o init_point: ${JSON.stringify(data).slice(0, 300)}`
    );
  }
  return { id: String(data.id), url, raw: data };
}

export async function getPreapproval(id: string): Promise<Preapproval> {
  return toPreapproval(await mpFetch(`/preapproval/${encodeURIComponent(id)}`));
}

/** Cancela a renovação: nenhuma cobrança futura. O acesso já pago segue até o fim do período. */
export async function cancelPreapproval(id: string): Promise<Preapproval> {
  return toPreapproval(
    await mpFetch(`/preapproval/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ status: "cancelled" }),
    })
  );
}

function toAuthorizedPayment(d: any): AuthorizedPayment {
  return {
    id: String(d?.id || ""),
    preapproval_id: String(d?.preapproval_id || ""),
    status: String(d?.status || ""),
    transaction_amount: Number(d?.transaction_amount) || 0,
    external_reference: d?.external_reference,
    payment: d?.payment
      ? {
          id: String(d.payment.id ?? ""),
          status: String(d.payment.status ?? ""),
          status_detail: d.payment.status_detail,
        }
      : null,
    raw: d,
  };
}

/** Uma cobrança (fatura) do ciclo. */
export async function getAuthorizedPayment(id: string): Promise<AuthorizedPayment> {
  return toAuthorizedPayment(await mpFetch(`/authorized_payments/${encodeURIComponent(id)}`));
}

/** Cobranças de uma assinatura (usado no retorno, antes do webhook chegar). */
export async function searchAuthorizedPayments(preapprovalId: string): Promise<AuthorizedPayment[]> {
  const data = await mpFetch(
    `/authorized_payments/search?preapproval_id=${encodeURIComponent(preapprovalId)}`
  );
  const rows: any[] = Array.isArray(data?.results) ? data.results : [];
  return rows.map(toAuthorizedPayment);
}

/** Uma cobrança só conta como paga quando o pagamento associado foi aprovado. */
export function isAuthorizedPaymentPaid(p: AuthorizedPayment): boolean {
  return p.status === "processed" && p.payment?.status === "approved";
}

// ─── Assinatura do webhook (x-signature) ────────────────────────────────────
// Cabeçalho: `ts=<epoch>,v1=<hmac>`. O HMAC-SHA256 (chave = segredo do
// webhook, no painel da aplicação) é calculado sobre
//   id:<data.id em minúsculas>;request-id:<x-request-id>;ts:<ts>;
// Se o MP mudar o formato o resultado é "inválido" — por isso o webhook só
// rejeita quando MERCADOPAGO_WEBHOOK_STRICT=true (o corpo nunca é confiado
// de qualquer forma: tudo é reconferido na API).

export function verifyWebhookSignature(input: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
}): { ok: boolean; reason?: string } {
  const secret = (process.env.MERCADOPAGO_WEBHOOK_SECRET || "").trim();
  if (!secret) return { ok: false, reason: "MERCADOPAGO_WEBHOOK_SECRET ausente" };
  if (!input.signatureHeader) return { ok: false, reason: "sem x-signature" };

  const parts = Object.fromEntries(
    input.signatureHeader.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return { ok: false, reason: "x-signature malformado" };

  const manifest =
    `id:${(input.dataId || "").toLowerCase()};` +
    `request-id:${input.requestId || ""};` +
    `ts:${ts};`;
  const expected = crypto.createHmac("sha256", secret).update(manifest).digest("hex");

  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "assinatura não confere" };
  }
  return { ok: true };
}
