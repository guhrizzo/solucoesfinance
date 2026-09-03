"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useSubscription } from "../hooks/useSubscription";
import { PageLoader } from "../components/ui";
import Paywall from "../components/Paywall";
import { isPlanId, startCheckout } from "@/lib/startCheckout";

export default function AssinaturaPage() {
  const { loading: authLoading } = useAuth();
  const sub = useSubscription();

  // ?checkout=<plano> → dispara o pagamento direto (vindo da landing / do
  // cadastro). Não faz nada se a assinatura já está ativa.
  const [autoPlan] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("checkout");
  });
  const [autoError, setAutoError] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (authLoading || sub.loading) return;
    if (!autoPlan || !isPlanId(autoPlan)) return;
    if (!sub.isOwner) return;
    if (sub.status === "active") return;

    fired.current = true;
    startCheckout(autoPlan).catch((e) => {
      setAutoError(e instanceof Error ? e.message : "Erro ao iniciar o pagamento.");
    });
  }, [authLoading, sub.loading, sub.isOwner, sub.status, autoPlan]);

  if (authLoading || sub.loading) return <PageLoader label="Carregando assinatura…" />;

  const redirecting =
    !!autoPlan && isPlanId(autoPlan) && sub.isOwner && sub.status !== "active" && !autoError;

  if (redirecting) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3"
        style={{ background: "var(--db-bg)" }}
      >
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--brand-500)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--db-text-2)" }}>
          Redirecionando para o pagamento seguro…
        </p>
      </div>
    );
  }

  return <Paywall state={sub} initialError={autoError} />;
}
