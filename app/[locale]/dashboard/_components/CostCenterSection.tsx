"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Pill } from "@/app/components/ui";
import type { CenterHighlights } from "@/lib/dashboardInsights";
import { Delta, EmptyLine, Meter, Money, SectionCard, SectionStatus, usePct, type SourceState } from "./shared";

interface Props {
  data: CenterHighlights;
  hide: boolean;
  periodLabel: string;
  state: SourceState | null;
}

export function CostCenterSection({ data, hide, periodLabel, state }: Props) {
  const t = useTranslations("dashboard.centersSection");
  const pct = usePct();
  if (state === null) return null;

  return (
    <SectionCard
      id="centros-custo"
      title={t("title")}
      subtitle={t("subtitle", { period: periodLabel })}
      action={<Link href="/costCenter" className="text-xs font-semibold" style={{ color: "var(--brand)" }}>{t("open")}</Link>}
    >
      {state !== "ok" ? <SectionStatus state={state} what={t("what")} /> : data.top.length === 0 ? (
        <EmptyLine>{t("empty")}</EmptyLine>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("totalSpent")}</p>
              <p className="mono text-lg font-semibold"><Money value={data.total} hide={hide} /></p>
            </div>
            <div className="text-xs flex flex-col gap-0.5">
              <Delta value={data.variacaoTotal} goodWhen="down" />
              <span style={{ color: "var(--text-subtle)" }}>{t("vsEquivalent")}</span>
            </div>
            {data.estourados > 0 && <Pill tone="neg" dot>{t("overCount", { count: data.estourados })}</Pill>}
          </div>

          <ul className="space-y-3">
            {data.top.map((c) => (
              <li key={c.name}>
                <div className="flex items-center justify-between gap-2 text-xs mb-1">
                  <span className="font-semibold truncate" style={{ color: "var(--text)" }}>{c.name}</span>
                  <span className="mono shrink-0" style={{ color: "var(--text)" }}><Money value={c.realizado} hide={hide} /></span>
                </div>
                {c.pct !== null ? (
                  <>
                    <Meter pct={c.pct} tone={c.over ? "neg" : c.pct >= 90 ? "warn" : "brand"} />
                    <div className="flex items-center justify-between gap-2 text-[11px] mt-1" style={{ color: "var(--text-muted)" }}>
                      <span>
                        {t("usage", { pct: pct(c.pct, 0) })} · {t("budgeted")} <Money value={c.orcado} hide={hide} />
                        {c.over && <span className="font-semibold" style={{ color: "var(--neg)" }}> · {t("exceeded")}</span>}
                      </span>
                      <Delta value={c.variacao} goodWhen="down" />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--text-subtle)" }}>
                    <span>{t("noBudget")}</span>
                    <Delta value={c.variacao} goodWhen="down" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
