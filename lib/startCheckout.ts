// lib/startCheckout.ts
// Client: dispara o checkout de um plano e redireciona pro pagamento da
// InfinitePay. Compartilhado pela página /assinatura, pelo <Paywall> e pelo
// fluxo pós-cadastro (?plano= → /assinatura?checkout=).

import { BILLING_PLANS } from "./billingPlans";

export function isPlanId(v: unknown): v is string {
  return typeof v === "string" && BILLING_PLANS.some((p) => p.id === v);
}

/**
 * Pede o link de pagamento e navega pra lá. Não retorna em caso de sucesso
 * (a página é substituída). Lança com mensagem em PT-BR se falhar.
 */
export async function startCheckout(planId: string): Promise<void> {
  const { authedFetch } = await import("./authedFetch");
  const res = await authedFetch("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: planId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) {
    throw new Error(data?.error || "Não foi possível gerar o link de pagamento.");
  }
  window.location.href = data.url;
  // dá um tempo pro browser navegar antes de qualquer render seguinte
  await new Promise((r) => setTimeout(r, 4000));
}
