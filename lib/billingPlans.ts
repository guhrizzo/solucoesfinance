// lib/billingPlans.ts
// Definição dos planos de assinatura do NexusFi + duração do trial.
//
// ⚠️ PREÇOS SÃO PLACEHOLDER — ajuste `priceCents` (em CENTAVOS, R$ 1,00 = 100)
// quando os valores comerciais forem definidos. `months` = quanto tempo de
// acesso cada pagamento concede. Mudar aqui reflete na página /assinatura, no
// checkout e na validação do webhook (o valor pago precisa bater com o plano).

export type PlanId = "mensal" | "anual";

export interface BillingPlan {
  id: PlanId;
  label: string;
  /** Preço em centavos. PLACEHOLDER — definir o valor real. */
  priceCents: number;
  /** Meses de acesso concedidos por um pagamento deste plano. */
  months: number;
  /** Texto curto pro card da página de assinatura. */
  description: string;
  /** Selo opcional ("Economize 2 meses", "Mais popular"...). */
  badge?: string;
}

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "mensal",
    label: "Mensal",
    priceCents: 100, // ⚠️ TESTE — R$ 1,00. Trocar pelo preço real antes de lançar.
    months: 1,
    description: "Acesso completo, renovação a cada 30 dias.",
  },
  {
    id: "anual",
    label: "Anual",
    priceCents: 100, // ⚠️ TESTE — R$ 1,00. Trocar pelo preço real antes de lançar.
    months: 12,
    description: "Acesso completo por 12 meses.",
    badge: "Economize 2 meses",
  },
];

/** Dias de trial concedidos a uma conta dona recém-criada. */
export const TRIAL_DAYS = 7;

export function getPlan(id: string): BillingPlan | undefined {
  return BILLING_PLANS.find((p) => p.id === id);
}

/** Centavos → "R$ 97,00". */
export function formatBRLFromCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
