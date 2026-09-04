"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

// true só no client — sem setState em effect (lint: react-hooks/set-state-in-effect).
const emptySubscribe = () => () => {};
import { Loader2, Check, ShieldCheck, LogOut, Sparkles, ChevronDown, X } from "lucide-react";
import {
  PLAN_TIERS,
  BILLING_PERIODS,
  getPlan,
  planFor,
  monthlyEquivalentCents,
  annualSavingsCents,
  formatBRLFromCents,
  type BillingPeriod,
} from "@/lib/billingPlans";
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
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [period, setPeriod] = useState<BillingPeriod>("anual");
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const periodLabel = BILLING_PERIODS.find((p) => p.id === period)?.label ?? "Anual";

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
    ? "Acesso cortesia"
    : state.status === "past_due"
      ? blocking
        ? "Seu acesso expirou"
        : "Renovar assinatura"
      : state.status === "trialing"
        ? `Teste grátis — ${state.daysLeft} ${state.daysLeft === 1 ? "dia restante" : "dias restantes"}`
        : "Sua assinatura está ativa";

  const subtitulo = state.comped
    ? "Sua conta tem acesso completo e ilimitado, sem cobrança. Nada a pagar."
    : state.status === "past_due"
      ? state.isOwner
        ? "Escolha um plano pra continuar usando o NexusFi. Pagamento via Pix ou cartão em até 12x."
        : "A assinatura desta conta está pendente. Fale com o titular pra regularizar o pagamento."
      : state.status === "trialing"
        ? state.isOwner
          ? "Assine agora e não perca o acesso quando o teste acabar."
          : "Conta em período de teste. O titular pode assinar a qualquer momento."
        : `Plano ${state.plan ? (getPlan(state.plan)?.label ?? state.plan) : ""} · acesso até ${new Date(state.accessUntil).toLocaleDateString("pt-BR")}.`;

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
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setPeriodModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer transition-colors"
                  style={{ background: "var(--db-card-alt)", border: "1px solid var(--db-border)", color: "var(--db-text)" }}
                >
                  Cobrança: <span style={{ color: "var(--brand-500)" }}>{periodLabel}</span>
                  {period === "anual" && (
                    <span
                      className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                      style={{ background: "rgba(21,101,192,0.12)", color: "var(--brand-500)" }}
                    >
                      2 meses de desconto
                    </span>
                  )}
                  <ChevronDown size={13} style={{ color: "var(--db-text-3)" }} />
                </button>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mt-4">
                {PLAN_TIERS.map((tier) => {
                  const plan = planFor(tier.id, period);
                  const savings = annualSavingsCents(tier.id);
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
                          {tier.label}
                        </span>
                        {tier.highlight && (
                          <span
                            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: "rgba(21,101,192,0.12)", color: "var(--brand-500)" }}
                          >
                            Mais completo
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-2xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
                        {formatBRLFromCents(plan.priceCents)}
                        <span className="text-sm font-semibold" style={{ color: "var(--db-text-3)" }}>
                          {period === "anual" ? "/ano" : "/mês"}
                        </span>
                      </p>
                      <p className="text-xs mt-1" style={{ color: "var(--db-text-3)" }}>
                        {period === "anual"
                          ? `equivale a ${formatBRLFromCents(monthlyEquivalentCents(plan))}/mês`
                          : tier.blurb}
                      </p>
                      {period === "anual" && savings > 0 && (
                        <p className="text-xs mt-0.5 font-semibold" style={{ color: "var(--pos, #12854a)" }}>
                          Economize {formatBRLFromCents(savings)} por ano
                        </p>
                      )}
                      <div className="flex-1" />
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
                        {state.status === "past_due" ? "Assinar" : "Assinar agora"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <p className="flex items-center gap-1.5 mt-6 text-xs" style={{ color: "var(--db-text-4)" }}>
            <ShieldCheck size={12} /> Pagamento processado pela InfinitePay.
          </p>
        </div>

        <button
          onClick={logout}
          className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          style={{ color: "var(--db-text-3)" }}
        >
          <LogOut size={12} /> Sair da conta
        </button>
      </div>

      {mounted &&
        periodModalOpen &&
        createPortal(
        <div
          className="fixed inset-0 z-[999] flex items-center justify-center p-4"
          style={{ background: "var(--db-overlay, rgba(10,22,40,0.55))" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPeriodModalOpen(false);
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{
              background: "var(--db-card)",
              border: "1px solid var(--db-border)",
              boxShadow: "var(--db-shadow-lg)",
            }}
          >
            <div className="flex items-start justify-between mb-1">
              <h3 className="text-base font-bold" style={{ color: "var(--db-text)" }}>
                Período de cobrança
              </h3>
              <button
                type="button"
                onClick={() => setPeriodModalOpen(false)}
                className="cursor-pointer"
                style={{ color: "var(--db-text-3)" }}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm mb-5" style={{ color: "var(--db-text-3)" }}>
              Mensal ou anual — você escolhe como prefere pagar.
            </p>
            <div className="space-y-2.5">
              {BILLING_PERIODS.map((p) => {
                const active = p.id === period;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPeriod(p.id);
                      setPeriodModalOpen(false);
                    }}
                    className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-left transition-colors cursor-pointer"
                    style={{
                      background: active ? "rgba(21,101,192,0.10)" : "var(--db-card-alt)",
                      border: `1px solid ${active ? "var(--brand-500)" : "var(--db-border)"}`,
                    }}
                  >
                    <span>
                      <span className="block font-semibold text-sm" style={{ color: "var(--db-text)" }}>
                        {p.label}
                      </span>
                      {p.note && (
                        <span className="block text-xs font-medium" style={{ color: "var(--pos, #12854a)" }}>
                          {p.note}
                        </span>
                      )}
                    </span>
                    <span
                      className="flex h-5 w-5 items-center justify-center rounded-full"
                      style={{
                        border: `1px solid ${active ? "var(--brand-500)" : "var(--db-border-alt)"}`,
                        background: active ? "var(--brand-500)" : "transparent",
                      }}
                    >
                      {active && <Check size={12} color="#fff" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>,
          document.body,
        )}
    </div>
  );
}
