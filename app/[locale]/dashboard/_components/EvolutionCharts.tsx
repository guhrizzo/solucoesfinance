"use client";

import { useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AreaLineChart, ColumnChart } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import type { TimelinePoint } from "@/lib/dashboardInsights";
import { EmptyLine, SectionCard } from "./shared";

interface Props {
  /** Entradas × saídas: semanas do mês (mensal) ou meses do ano (anual). */
  columns: TimelinePoint[];
  /** Resultado acumulado: dias do mês (mensal) ou meses do ano (anual). */
  evolution: TimelinePoint[];
  isAnnual: boolean;
  periodLabel: string;
  hide: boolean;
}

const axisShort = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1_000_000 ? `${Math.round(a / 100_000) / 10}M` : a >= 1000 ? `${Math.round(a / 1000)}k` : String(Math.round(a));
  return v < 0 ? `-${s}` : s;
};

export function EvolutionCharts({ columns, evolution, isAnnual, periodLabel, hide }: Props) {
  const t = useTranslations("dashboard.evolution");
  const locale = useLocale();
  const fmt = useCallback((n: number) => formatMoney(n, locale), [locale]);

  const monthNames = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { month: "short" });
    return Array.from({ length: 12 }, (_, i) => f.format(new Date(2000, i, 1)));
  }, [locale]);

  const colCats = useMemo(
    () => columns.map((p) => (isAnnual ? monthNames[p.index - 1] : t("weekShort", { n: p.index }))),
    [columns, isAnnual, monthNames, t],
  );
  const evoCats = useMemo(
    () => evolution.map((p) => (isAnnual ? monthNames[p.index - 1] : String(p.index))),
    [evolution, isAnnual, monthNames],
  );

  const hasMoves = columns.some((p) => p.entradas > 0 || p.saidas > 0);
  const last = evolution[evolution.length - 1];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5">
      <SectionCard
        id="evolucao"
        title={t("resultTitle")}
        subtitle={isAnnual ? t("resultSubtitleYear", { period: periodLabel }) : t("resultSubtitleMonth", { period: periodLabel })}
      >
        {!hasMoves ? (
          <EmptyLine>{t("empty")}</EmptyLine>
        ) : (
          <>
            <AreaLineChart
              height={240}
              allowNegative
              categories={evoCats}
              hideValues={hide}
              formatValue={fmt}
              formatAxis={axisShort}
              ariaLabel={t("resultAria", { period: periodLabel })}
              series={[{ name: t("accumulatedResult"), data: evolution.map((p) => p.acumulado), color: "var(--brand)" }]}
            />
            {/* Alternativa em texto pra leitor de tela */}
            <table className="sr-only">
              <caption>{t("resultAria", { period: periodLabel })}</caption>
              <thead><tr><th scope="col">{isAnnual ? t("month") : t("day")}</th><th scope="col">{t("accumulatedResult")}</th></tr></thead>
              <tbody>
                {evolution.map((p, i) => (<tr key={p.index}><th scope="row">{evoCats[i]}</th><td>{fmt(p.acumulado)}</td></tr>))}
              </tbody>
            </table>
            {last && <p className="text-[11px] mt-2" style={{ color: "var(--text-subtle)" }}>{t("resultNote")}</p>}
          </>
        )}
      </SectionCard>

      <SectionCard
        id="entradas-saidas"
        title={t("flowTitle")}
        subtitle={isAnnual ? t("flowSubtitleYear", { period: periodLabel }) : t("flowSubtitleMonth", { period: periodLabel })}
        action={
          <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--pos)" }} />{t("inflows")}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--neg)" }} />{t("outflows")}</span>
          </div>
        }
      >
        {!hasMoves ? (
          <EmptyLine>{t("empty")}</EmptyLine>
        ) : (
          <>
            <ColumnChart
              height={240}
              categories={colCats}
              hideValues={hide}
              formatValue={fmt}
              formatAxis={axisShort}
              ariaLabel={t("flowAria", { period: periodLabel })}
              series={[
                { name: t("inflows"), data: columns.map((p) => p.entradas), color: "var(--pos)" },
                { name: t("outflows"), data: columns.map((p) => p.saidas), color: "var(--neg)" },
              ]}
            />
            <table className="sr-only">
              <caption>{t("flowAria", { period: periodLabel })}</caption>
              <thead><tr><th scope="col">{isAnnual ? t("month") : t("week")}</th><th scope="col">{t("inflows")}</th><th scope="col">{t("outflows")}</th></tr></thead>
              <tbody>
                {columns.map((p, i) => (<tr key={p.index}><th scope="row">{colCats[i]}</th><td>{fmt(p.entradas)}</td><td>{fmt(p.saidas)}</td></tr>))}
              </tbody>
            </table>
          </>
        )}
      </SectionCard>
    </div>
  );
}
