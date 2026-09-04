// lib/billingPlans.ts
// Definição dos planos de assinatura do NexusFi + duração do trial.
//
// São 4 planos: Básico e Pro, cada um cobrado Mensal ou Anual. A UI mostra
// 2 cards por vez (Básico + Pro do período escolhido) e o cliente troca o
// período (Mensal | Anual) por um modal — ver app/page.tsx e Paywall.tsx.
//
// `priceCents` é em CENTAVOS (R$ 1,00 = 100). `months` = quanto tempo de acesso
// cada pagamento concede. Mudar aqui reflete na landing, no /assinatura, no
// checkout e na validação do webhook (o valor pago precisa bater com o plano).

export type PlanTier = "basico" | "pro";
export type BillingPeriod = "mensal" | "anual";
export type PlanId = `${PlanTier}-${BillingPeriod}`;

export interface BillingPlan {
  id: PlanId;
  tier: PlanTier;
  period: BillingPeriod;
  /** Nome curto do nível: "Básico" | "Pro". */
  tierLabel: string;
  /** Nome completo com o período: "Básico anual" — usado no contrato/checkout. */
  label: string;
  /** Preço em centavos. */
  priceCents: number;
  /** Meses de acesso concedidos por um pagamento deste plano. */
  months: number;
  /** Texto curto pro card. */
  description: string;
  /** Selo opcional ("Mais popular"…). O selo de economia do anual é calculado. */
  badge?: string;
}

// ─── Níveis (Básico / Pro) ──────────────────────────────────────────────────

export const PLAN_TIERS: {
  id: PlanTier;
  label: string;
  blurb: string;
  /** Recursos listados no card. */
  features: string[];
  /** Prefixo do bloco de recursos (Pro herda tudo do Básico). */
  featuresLead?: string;
  highlight?: boolean;
}[] = [
  {
    id: "basico",
    label: "Básico",
    blurb: "O controle financeiro essencial da sua empresa, organizado num só lugar.",
    features: [
      "Fluxo de caixa em tempo real",
      "Contas a pagar e a receber",
      "Relatórios automáticos (DRE)",
      "Centro de custos ilimitado",
      "Multiusuário com permissões",
      "Suporte por e-mail",
    ],
  },
  {
    id: "pro",
    label: "Pro",
    blurb: "Tudo do Básico, com integrações de marketplace e automação por IA.",
    featuresLead: "Tudo do Básico, e mais:",
    highlight: true,
    features: [
      "Integração com Mercado Livre e Shopee",
      "Automação por IA: conciliação do fluxo de caixa, DRE e contas a pagar/receber",
      "Controle de estoque de produtos",
      "Painel de vendas",
      "Suporte prioritário",
    ],
  },
];

// ─── Períodos de cobrança ───────────────────────────────────────────────────

export const BILLING_PERIODS: {
  id: BillingPeriod;
  label: string;
  /** Nota curta exibida no seletor. */
  note?: string;
}[] = [
  { id: "mensal", label: "Mensal" },
  { id: "anual", label: "Anual", note: "2 meses de desconto" },
];

// ─── Os 4 planos ────────────────────────────────────────────────────────────

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: "basico-mensal",
    tier: "basico",
    period: "mensal",
    tierLabel: "Básico",
    label: "Básico mensal",
    priceCents: 4990,
    months: 1,
    description: "Acesso completo ao Básico, renovação a cada 30 dias.",
  },
  {
    id: "basico-anual",
    tier: "basico",
    period: "anual",
    tierLabel: "Básico",
    label: "Básico anual",
    priceCents: 53890,
    months: 12,
    description: "Acesso ao Básico por 12 meses, com desconto no valor à vista.",
  },
  {
    id: "pro-mensal",
    tier: "pro",
    period: "mensal",
    tierLabel: "Pro",
    label: "Pro mensal",
    priceCents: 6990,
    months: 1,
    description: "Acesso completo ao Pro, renovação a cada 30 dias.",
  },
  {
    id: "pro-anual",
    tier: "pro",
    period: "anual",
    tierLabel: "Pro",
    label: "Pro anual",
    priceCents: 75990,
    months: 12,
    description: "Acesso ao Pro por 12 meses, com desconto no valor à vista.",
  },
];

/** Dias de trial concedidos a uma conta dona recém-criada. */
export const TRIAL_DAYS = 7;

export function getPlan(id: string): BillingPlan | undefined {
  return BILLING_PLANS.find((p) => p.id === id);
}

/** Os 2 planos (Básico, Pro) de um período, na ordem Básico → Pro. */
export function plansForPeriod(period: BillingPeriod): BillingPlan[] {
  return BILLING_PLANS.filter((p) => p.period === period).sort(
    (a, b) => a.priceCents - b.priceCents,
  );
}

/** O plano de um nível num período. */
export function planFor(tier: PlanTier, period: BillingPeriod): BillingPlan {
  return getPlan(`${tier}-${period}`)!;
}

/** Valor equivalente por mês (anual ÷ 12), em centavos. */
export function monthlyEquivalentCents(plan: BillingPlan): number {
  return Math.round(plan.priceCents / plan.months);
}

/** Quanto o anual economiza em relação a 12× o mensal do mesmo nível (centavos). */
export function annualSavingsCents(tier: PlanTier): number {
  const mensal = planFor(tier, "mensal");
  const anual = planFor(tier, "anual");
  return Math.max(0, mensal.priceCents * 12 - anual.priceCents);
}

/** Centavos → "R$ 97,00". */
export function formatBRLFromCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
