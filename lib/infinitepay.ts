// lib/infinitepay.ts
// Cliente server-side do Checkout Integrado da InfinitePay.
// SOMENTE para rotas de servidor (app/api/**). Nunca importe de "use client".
//
// Doc: https://www.infinitepay.io/checkout-documentacao
//  - POST /links          → cria o link de pagamento (retorna a URL do checkout)
//  - POST /payment_check   → confere se um pedido foi realmente pago
//
// A API não usa API key/Authorization — a identificação é o `handle`
// (InfiniteTag sem o "$"). Por isso NUNCA confie só no webhook: todo webhook
// recebido é reconferido com `payment_check` antes de liberar acesso.

const BASE = "https://api.checkout.infinitepay.io";

export interface CheckoutItem {
  quantity: number;
  /** Preço unitário em CENTAVOS. */
  price: number;
  description: string;
}

export interface CreateLinkInput {
  orderNsu: string;
  redirectUrl: string;
  webhookUrl: string;
  items: CheckoutItem[];
  customer?: { name?: string; email?: string; phone_number?: string };
}

export interface CreateLinkResult {
  /** URL pra onde mandar o cliente pagar. */
  url: string;
  raw: any;
}

export interface PaymentCheckInput {
  orderNsu: string;
  transactionNsu: string;
  slug: string;
}

export interface PaymentCheckResult {
  success: boolean;
  paid: boolean;
  /** Valor esperado do pedido, em centavos. */
  amount: number;
  /** Valor efetivamente pago, em centavos (pode incluir juros de parcelamento). */
  paid_amount: number;
  installments: number;
  capture_method: "pix" | "credit_card" | string;
  raw: any;
}

export function infinitepayHandle(): string {
  // Aceita com ou sem "$" na env e normaliza.
  return (process.env.INFINITEPAY_HANDLE || "").replace(/^\$/, "").trim();
}

export function infinitepayConfigured(): boolean {
  return !!infinitepayHandle();
}

async function postJson(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
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
      data?.message || data?.error || `InfinitePay ${path} respondeu ${res.status}: ${text.slice(0, 300)}`
    );
  }
  return data;
}

/**
 * Cria o link de pagamento. A doc pública não fixa o nome do campo da URL na
 * resposta, então tentamos as variações conhecidas (`url`, `checkout_url`,
 * `payment_url`, aninhados em `data`).
 */
export async function createCheckoutLink(input: CreateLinkInput): Promise<CreateLinkResult> {
  const handle = infinitepayHandle();
  if (!handle) throw new Error("INFINITEPAY_HANDLE não configurado.");

  const payload = {
    handle,
    order_nsu: input.orderNsu,
    redirect_url: input.redirectUrl,
    webhook_url: input.webhookUrl,
    items: input.items,
    ...(input.customer ? { customer: input.customer } : {}),
  };

  const data = await postJson("/links", payload);
  const url =
    data?.url ||
    data?.checkout_url ||
    data?.payment_url ||
    data?.link ||
    data?.data?.url ||
    data?.data?.checkout_url ||
    "";

  if (!url || typeof url !== "string") {
    throw new Error(
      `InfinitePay criou o link mas não achei a URL na resposta: ${JSON.stringify(data).slice(0, 300)}`
    );
  }
  return { url, raw: data };
}

/** Confere se um pedido foi pago de verdade (fonte da verdade — não o webhook). */
export async function verifyPayment(input: PaymentCheckInput): Promise<PaymentCheckResult> {
  const handle = infinitepayHandle();
  if (!handle) throw new Error("INFINITEPAY_HANDLE não configurado.");

  const data = await postJson("/payment_check", {
    handle,
    order_nsu: input.orderNsu,
    transaction_nsu: input.transactionNsu,
    slug: input.slug,
  });

  return {
    success: !!data?.success,
    paid: !!data?.paid,
    amount: Number(data?.amount) || 0,
    paid_amount: Number(data?.paid_amount) || 0,
    installments: Number(data?.installments) || 0,
    capture_method: data?.capture_method || "",
    raw: data,
  };
}

// ─── order_nsu: carrega ownerUid + plano (+ contrato) entre o checkout e o webhook ──
// A InfinitePay devolve o `order_nsu` intacto no redirect e no webhook, então
// é onde guardamos de quem é a assinatura, qual plano foi comprado e qual
// contrato foi aceito.
//
// Formato:  ownerUid__planId__<ts base36>                 (legado, sem contrato)
//           ownerUid__planId__contractId__<ts base36>      (com contrato)

const NSU_SEP = "__";

export function buildOrderNsu(ownerUid: string, planId: string, contractId?: string): string {
  const parts = [ownerUid, planId];
  if (contractId) parts.push(contractId);
  parts.push(Date.now().toString(36));
  return parts.join(NSU_SEP);
}

export function parseOrderNsu(
  nsu: string
): { ownerUid: string; planId: string; contractId: string | null } | null {
  const parts = (nsu || "").split(NSU_SEP);
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  // 3 segmentos → [owner, plan, ts]; 4+ → [owner, plan, contractId, ts].
  const contractId = parts.length >= 4 ? parts[2] : null;
  return { ownerUid: parts[0], planId: parts[1], contractId };
}
