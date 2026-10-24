"use client";

import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Pill, type PillTone } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { DEFAULT_ALERT_THRESHOLDS as TH, type AlertSeverity, type DashAlert } from "@/lib/dashboardInsights";
import { Money, SectionCard, usePct } from "./shared";

interface Props {
  alerts: DashAlert[];
  hide: boolean;
  periodLabel: string;
  /** Critérios usados (mostrados na nota de rodapé). */
  marginTargetPct: number | null;
}

const SEV: Record<AlertSeverity, { tone: PillTone; Icon: typeof Info; accent: string }> = {
  critical: { tone: "neg", Icon: AlertOctagon, accent: "var(--neg)" },
  warning: { tone: "warn", Icon: AlertTriangle, accent: "var(--warn)" },
  info: { tone: "info", Icon: Info, accent: "var(--brand)" },
};

/** Parâmetros que são dinheiro — formatados (ou mascarados) antes de entrar na frase. */
const MONEY_PARAMS = new Set(["total", "over", "acc"]);

export function AlertCenter({ alerts, hide, periodLabel, marginTargetPct }: Props) {
  const t = useTranslations("dashboard.alertsSection");
  const locale = useLocale();
  const pct = usePct();

  const params = (a: DashAlert) => {
    const out: Record<string, string | number> = {};
    for (const [k, v] of Object.entries(a.params)) out[k] = MONEY_PARAMS.has(k) ? (hide ? "R$ ••••" : formatMoney(v, locale)) : v;
    return out;
  };
  const scopeText = (a: DashAlert) =>
    a.scope === "today" ? t("scope.today")
    : a.scope === "next" ? t("scope.next", { days: a.params.days ?? 7 })
    : periodLabel;

  return (
    <SectionCard id="alertas" title={t("title")} subtitle={t("subtitle")}>
      {alerts.length === 0 ? (
        <div className="flex items-center gap-2 text-sm py-4" style={{ color: "var(--text-muted)" }}>
          <CheckCircle2 size={16} style={{ color: "var(--pos)" }} aria-hidden="true" /> {t("none")}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {alerts.map((a) => {
            const s = SEV[a.severity];
            return (
              <li key={a.code} className="rounded-xl p-3 md:p-3.5" style={{ border: "1px solid var(--border)", borderLeft: `4px solid ${s.accent}` }}>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Pill tone={s.tone}><s.Icon size={11} aria-hidden="true" />{t(`severity.${a.severity}`)}</Pill>
                  <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>{t(`items.${a.code}.title`, params(a))}</h3>
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t(`items.${a.code}.reason`, params(a))}</p>
                <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">
                  <div className="flex gap-1"><dt style={{ color: "var(--text-subtle)" }}>{t("indicator")}:</dt>
                    <dd className="mono font-semibold" style={{ color: "var(--text)" }}>
                      {a.indicatorKind === "money" ? <Money value={a.indicator} hide={hide} />
                        : a.indicatorKind === "percent" ? pct(a.indicator, 1)
                        : a.indicator}
                    </dd>
                  </div>
                  <div className="flex gap-1"><dt style={{ color: "var(--text-subtle)" }}>{t("period")}:</dt><dd style={{ color: "var(--text)" }}>{scopeText(a)}</dd></div>
                  <div className="flex gap-1 ml-auto no-print">
                    <Link href={a.href} className="font-semibold" style={{ color: "var(--brand)" }}>{t(`items.${a.code}.action`)} →</Link>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-[11px] leading-snug mt-3" style={{ color: "var(--text-subtle)" }}>
        {t("criteria", { budget: TH.budgetNearPct, drop: TH.revenueDropPct, rise: TH.expenseRisePct, recon: TH.reconPendingWarnPct })} {marginTargetPct === null ? t("noMarginTarget") : t("marginTarget", { pct: marginTargetPct })} {t("noDivergence")}
      </p>
    </SectionCard>
  );
}
