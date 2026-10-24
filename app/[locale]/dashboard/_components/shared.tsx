"use client";

import type { ReactNode } from "react";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Loader2, Minus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Sensitive } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";

/** Estado de carregamento de uma fonte de dados do Firestore. */
export type SourceState = "loading" | "error" | "ok";

/** Valor monetário formatado no locale ativo, embaralhado quando o usuário oculta os valores. */
export function Money({ value, hide, signed = false }: { value: number; hide: boolean; signed?: boolean }) {
  const locale = useLocale();
  const text = (signed && value > 0 ? "+" : "") + formatMoney(value, locale);
  return <Sensitive hidden={hide}>{text}</Sensitive>;
}

export function usePct() {
  const locale = useLocale();
  return (v: number, digits = 1) =>
    `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v)}%`;
}

/**
 * Variação vs. período anterior equivalente: ícone + sinal + texto (nunca só cor).
 * `goodWhen`: "up" (receita, resultado) ou "down" (despesa).
 */
export function Delta({ value, goodWhen = "up" }: { value: number | null; goodWhen?: "up" | "down" }) {
  const t = useTranslations("dashboard.common");
  const pct = usePct();
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-subtle)" }}>
        <Minus size={12} aria-hidden="true" /> {t("noBaseline")}
      </span>
    );
  }
  const flat = Math.abs(value) < 0.05;
  const up = value > 0;
  const good = flat ? null : goodWhen === "up" ? up : !up;
  const color = good === null ? "var(--text-subtle)" : good ? "var(--pos)" : "var(--neg)";
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color }}>
      {flat ? <Minus size={12} aria-hidden="true" /> : up ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}
      {(up && !flat ? "+" : "") + pct(value)}
      <span className="sr-only">{up ? t("increase") : t("decrease")}</span>
    </span>
  );
}

/** Cartão de seção do dashboard: título, subtítulo, ação à direita. */
export function SectionCard({
  id, title, subtitle, action, children, className = "",
}: { id?: string; title: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={`dash-card p-4 md:p-5 scroll-mt-24 ${className}`}>
      <header className="flex items-start justify-between gap-3 mb-3 md:mb-4">
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className="font-bold text-sm md:text-base" style={{ color: "var(--text)" }}>{title}</h2>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
        </div>
        {action && <div className="shrink-0 no-print">{action}</div>}
      </header>
      {children}
    </section>
  );
}

/** Carregando / erro de uma seção — sem valores fictícios. */
export function SectionStatus({ state, what }: { state: Exclude<SourceState, "ok">; what?: string }) {
  const t = useTranslations("dashboard.states");
  if (state === "loading") {
    return (
      <div role="status" className="flex items-center justify-center gap-2 py-8 text-xs" style={{ color: "var(--text-subtle)" }}>
        <Loader2 size={14} className="animate-spin" aria-hidden="true" /> {t("loading")}
      </div>
    );
  }
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl p-3 text-xs" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>
      <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
      <span>{what ? t("errorWhat", { what }) : t("error")}</span>
    </div>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-center py-6 text-xs" style={{ color: "var(--text-subtle)" }}>{children}</p>;
}

/** Barra de progresso com percentual em texto ao lado (status não depende só da cor). */
export function Meter({ pct, tone }: { pct: number | null; tone: "pos" | "warn" | "neg" | "brand" }) {
  const w = Math.min(Math.max(pct ?? 0, 0), 100);
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--sunken)" }} aria-hidden="true">
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: `var(--${tone})` }} />
    </div>
  );
}
