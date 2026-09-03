"use client";

import { useState } from "react";
import { Loader2, Check, ShieldCheck, LogOut, Sparkles } from "lucide-react";
import { BILLING_PLANS, formatBRLFromCents } from "@/lib/billingPlans";
import { startCheckout } from "@/lib/startCheckout";
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
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  const assinar = async (planId: string) => {
    setError(null);
    setLoadingPlan(planId);
    try {
      await startCheckout(planId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao iniciar o pagamento.");
      setLoadingPlan(null);
    }
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
        : `Plano ${state.plan ?? ""} · acesso até ${new Date(state.accessUntil).toLocaleDateString("pt-BR")}.`;

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
            <div className="grid sm:grid-cols-2 gap-4 mt-6">
              {BILLING_PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-xl p-5 flex flex-col"
                  style={{ background: "var(--db-card-alt)", border: "1px solid var(--db-border)" }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--db-text-2)" }}>
                      {plan.label}
                    </span>
                    {plan.badge && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: "rgba(21,101,192,0.12)", color: "var(--brand-500)" }}
                      >
                        {plan.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-2xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
                    {formatBRLFromCents(plan.priceCents)}
                  </p>
                  <p className="text-xs mt-1 mb-4 flex-1" style={{ color: "var(--db-text-3)" }}>
                    {plan.description}
                  </p>
                  <button
                    onClick={() => assinar(plan.id)}
                    disabled={loadingPlan !== null}
                    className="inline-flex items-center justify-center gap-2 font-semibold text-sm px-4 py-2.5 rounded-xl cursor-pointer transition-all disabled:opacity-60"
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
              ))}
            </div>
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
    </div>
  );
}
