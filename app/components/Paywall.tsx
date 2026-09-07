"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

import { Loader2, Check, ShieldCheck, LogOut, Sparkles } from "lucide-react";
import {
  PLAN_TIERS,
  BILLING_PERIODS,
  getPlan,
  planFor,
  annualSavingsCents,
  type BillingPeriod,
} from "@/lib/billingPlans";
import { formatMoneyFromCents, formatDate } from "@/lib/format";
import type { SubscriptionState } from "@/lib/billing";

// Tela de assinatura / paywall. Usada tanto pelo <SubscriptionGate> (quando o
// acesso está bloqueado numa rota interna) quanto pela página /assinatura.

interface Props {
  state: SubscriptionState & { isOwner: boolean };
  /** true = bloqueio (rota interna sem acesso). false = visita voluntária a /assinatura. */
  blocking?: boolean;
  /** Erro pré-existente a exibir (ex.: falha no checkout automático). */
  initialError?: string | null;
}

export default function Paywall({ state, blocking = false, initialError = null }: Props) {
  const router = useRouter();
  const t = useTranslations("billing.paywall");
  const tPlans = useTranslations("plans");
  const locale = useLocale();
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [period, setPeriod] = useState<BillingPeriod>("mensal");

  // Antes do pagamento, a pessoa passa pela tela de contrato.
  const assinar = (planId: string) => {
    setError(null);
    setLoadingPlan(planId);
    router.push(`/assinatura/contrato?plano=${encodeURIComponent(planId)}`);
  };

  const logout = async () => {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  };

  const titulo = state.comped
    ? t("titleComped")
    : state.status === "past_due"
      ? blocking
        ? t("titleExpired")
        : t("titleRenew")
      : state.status === "trialing"
        ? t("titleTrial", { days: state.daysLeft })
        : t("titleActive");

  const planTierId = state.plan ? getPlan(state.plan)?.tier : undefined;
  const planLabel = planTierId ? tPlans(`tier.${planTierId}.label`) : (state.plan ?? "");
  const subtitulo = state.comped
    ? t("subComped")
    : state.status === "past_due"
      ? state.isOwner
        ? t("subExpiredOwner")
        : t("subExpiredMember")
      : state.status === "trialing"
        ? state.isOwner
          ? t("subTrialOwner")
          : t("subTrialMember")
        : t("subActive", { plan: planLabel, date: formatDate(state.accessUntil, locale) });

  const mostrarPlanos = state.isOwner && state.status !== "active" && !state.comped;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-12"
      style={{ background: "var(--db-bg)" }}
    >
      <div className="w-full max-w-3xl">
        <div className="mb-6 text-lg font-extrabold tracking-tight" style={{ color: "var(--db-text)" }}>
          Nexus<span style={{ color: "var(--brand-500)" }}>Fi</span>
        </div>

        <div
          className="rounded-2xl p-7 mb-5"
          style={{
            background: "var(--db-card)",
            border: "1px solid var(--db-border)",
            boxShadow: "var(--db-shadow-lg)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={16} style={{ color: "var(--brand-500)" }} />
            <h1 className="text-xl font-bold" style={{ color: "var(--db-text)" }}>
              {titulo}
            </h1>
          </div>
          <p className="text-sm" style={{ color: "var(--db-text-3)" }}>
            {subtitulo}
          </p>

          {error && (
            <div
              className="mt-4 text-sm rounded-lg px-3 py-2"
              style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}
            >
              {error}
            </div>
          )}

          {mostrarPlanos && (
            <>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-bold" style={{ color: "var(--db-text)" }}>{t("choosePayment")}</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--db-text-3)" }}>{t("choosePaymentHint")}</p>
                </div>
                <div className="inline-flex rounded-xl p-1" style={{ background: "var(--db-card-alt)", border: "1px solid var(--db-border)" }} role="group" aria-label={t("billingPeriod")}>
                  {BILLING_PERIODS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPeriod(p.id)}
                      aria-pressed={period === p.id}
                      className="relative rounded-lg px-4 py-2 text-xs font-bold transition-all cursor-pointer"
                      style={{
                        background: period === p.id ? "var(--db-card)" : "transparent",
                        color: period === p.id ? "var(--brand-500)" : "var(--db-text-3)",
                        boxShadow: period === p.id ? "var(--db-shadow-sm)" : "none",
                      }}
                    >
                      {tPlans(`period.${p.id}.label`)}
                      {p.id === "anual" && <span className="ml-1.5 text-[10px]" style={{ color: "var(--pos, #12854a)" }}>{t("annualBadge")}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid items-stretch gap-4 mt-4 sm:grid-cols-2">
                {PLAN_TIERS.map((tier) => {
                  const plan = planFor(tier.id, period);
                  const savings = annualSavingsCents(tier.id);
                  const tierLabel = tPlans(`tier.${tier.id}.label`);
                  const tierFeatures = tPlans.raw(`tier.${tier.id}.features`) as string[];
                  return (
                    <div
                      key={tier.id}
                      className="rounded-xl p-5 flex flex-col"
                      style={{
                        background: "var(--db-card-alt)",
                        border: `1px solid ${tier.highlight ? "var(--brand-500)" : "var(--db-border)"}`,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--db-text-2)" }}>
                          {tierLabel}
                        </span>
                        {tier.highlight && (
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(21,101,192,0.12)", color: "var(--brand-500)" }}
                          >
                            {t("mostComplete")}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-2xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
                        {formatMoneyFromCents(plan.priceCents, locale)}
                        <span className="text-sm font-semibold" style={{ color: "var(--db-text-3)" }}>
                          {period === "anual" ? t("perYear") : t("perMonth")}
                        </span>
                      </p>
                      <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--db-text-3)" }}>
                        {tPlans(`tier.${tier.id}.blurb`)}
                      </p>
                      <div className="mt-4 flex flex-col gap-2.5">
                        {tierFeatures.slice(0, 4).map((feature) => (
                          <div key={feature} className="flex items-start gap-2 text-xs" style={{ color: "var(--db-text-2)" }}>
                            <Check size={14} className="mt-0.5 shrink-0" style={{ color: "var(--brand-500)" }} />
                            <span>{feature}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-5 flex-1">
                        {period === "anual" && savings > 0 && (
                          <p className="text-xs font-semibold" style={{ color: "var(--pos, #12854a)" }}>
                            {t("annualSavings", { value: formatMoneyFromCents(savings, locale) })}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => assinar(plan.id)}
                        disabled={loadingPlan !== null}
                        className="mt-4 inline-flex items-center justify-center gap-2 font-semibold text-sm px-4 py-2.5 rounded-xl cursor-pointer transition-all disabled:opacity-60"
                        style={{
                          background: "linear-gradient(135deg, var(--brand-500), var(--brand-600))",
                          color: "#fff",
                        }}
                      >
                        {loadingPlan === plan.id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <Check size={15} />
                        )}
                        {state.status === "past_due" ? t("subscribe") : t("subscribeNow")}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <p className="flex items-center gap-1.5 mt-6 text-xs" style={{ color: "var(--db-text-4)" }}>
            <ShieldCheck size={12} /> {t("processedBy")}
          </p>
        </div>

        <button
          onClick={logout}
          className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          style={{ color: "var(--db-text-3)" }}
        >
          <LogOut size={12} /> {t("logout")}
        </button>
      </div>


    </div>
  );
}
