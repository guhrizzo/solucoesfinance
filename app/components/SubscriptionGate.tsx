"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { Sparkles, X } from "lucide-react";
import { useSubscription } from "../hooks/useSubscription";
import Paywall from "./Paywall";

// Rotas internas onde o hook de assinatura roda (banner de trial + bloqueio).
const INTERNAL_PREFIXES = [
  "/dashboard",
  "/fluxo-caixa",
  "/contasPagar",
  "/contasReceber",
  "/costCenter",
  "/estoque",
  "/vendas",
  "/impostos",
  "/relatorios",
  "/configuracoes",
];

// Dessas, as que EXIGEM assinatura ativa. /configuracoes fica de fora pro dono
// conseguir ver o perfil / gerir a conta mesmo com o acesso expirado.
const GATED_PREFIXES = INTERNAL_PREFIXES.filter((p) => p !== "/configuracoes");

const matches = (pathname: string, prefixes: string[]) =>
  prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!matches(pathname, INTERNAL_PREFIXES)) return <>{children}</>;
  return <Chrome pathname={pathname}>{children}</Chrome>;
}

function Chrome({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const sub = useSubscription();
  const gated = matches(pathname, GATED_PREFIXES);

  // Bloqueio: só depois de confirmar que expirou (estado inicial é otimista).
  if (gated && !sub.loading && !sub.signedOut && !sub.isActive) {
    return <Paywall state={sub} blocking />;
  }

  return (
    <>
      {!sub.loading && !sub.signedOut && sub.status === "trialing" && <TrialBanner sub={sub} />}
      {children}
    </>
  );
}

function TrialBanner({ sub }: { sub: ReturnType<typeof useSubscription> }) {
  const t = useTranslations("billing.trialBanner");
  const urgente = sub.daysLeft <= 2;
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem("nexusfi-trial-banner-dismissed") === "1";
    } catch {
      return false;
    }
  });

  if (hidden && !urgente) return null;

  const strong = { strong: (c: React.ReactNode) => <strong>{c}</strong> };

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-sm"
      style={{
        background: urgente ? "rgba(239,68,68,0.12)" : "rgba(21,101,192,0.1)",
        color: urgente ? "var(--danger)" : "var(--brand-600)",
        borderBottom: "1px solid var(--db-border)",
      }}
    >
      <Sparkles size={15} className="shrink-0" />
      <span className="flex-1">
        {sub.daysLeft <= 0
          ? t.rich("endsToday", strong)
          : t.rich("endsIn", { ...strong, days: sub.daysLeft })}{" "}
        {sub.isOwner ? t("ownerCta") : t("memberNote")}
      </span>
      {sub.isOwner && (
        <a
          href="/assinatura"
          className="font-semibold underline underline-offset-2 shrink-0"
        >
          {t("subscribeNow")}
        </a>
      )}
      {!urgente && (
        <button
          onClick={() => {
            setHidden(true);
            try {
              sessionStorage.setItem("nexusfi-trial-banner-dismissed", "1");
            } catch {
              /* ignore */
            }
          }}
          aria-label={t("dismiss")}
          className="shrink-0 opacity-60 hover:opacity-100"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
