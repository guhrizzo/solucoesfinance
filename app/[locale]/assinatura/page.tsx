"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";
import { useSubscription } from "@/app/hooks/useSubscription";
import { PageLoader } from "@/app/components/ui";
import Paywall from "@/app/components/Paywall";
import { isPlanId } from "@/lib/startCheckout";

export default function AssinaturaPage() {
  const router = useRouter();
  const { loading: authLoading } = useAuth();
  const sub = useSubscription();

  // ?checkout=<plano> → vindo da landing / do cadastro: leva direto pra tela de
  // contrato (e de lá pro pagamento). Não faz nada se a assinatura já está ativa.
  const [autoPlan] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("checkout");
  });
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (authLoading || sub.loading) return;
    if (!autoPlan || !isPlanId(autoPlan)) return;
    if (!sub.isOwner) return;
    if (sub.status === "active") return;

    fired.current = true;
    router.replace(`/assinatura/contrato?plano=${encodeURIComponent(autoPlan)}`);
  }, [authLoading, sub.loading, sub.isOwner, sub.status, autoPlan, router]);

  if (authLoading || sub.loading) return <PageLoader label="Carregando assinatura…" />;

  const redirecting =
    !!autoPlan && isPlanId(autoPlan) && sub.isOwner && sub.status !== "active";

  if (redirecting) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3"
        style={{ background: "var(--db-bg)" }}
      >
        <Loader2 size={28} className="animate-spin" style={{ color: "var(--brand-500)" }} />
        <p className="text-sm font-semibold" style={{ color: "var(--db-text-2)" }}>
          Abrindo o contrato…
        </p>
      </div>
    );
  }

  return <Paywall state={sub} />;
}
