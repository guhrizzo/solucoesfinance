"use client";

// app/configuracoes/VisitorsChart.tsx
// Gráfico de linha (ApexCharts via <AreaLineChart>), visitantes únicos vs.
// logados nos últimos 30 dias. Portado de grupo_liberty (Liberty Car) — ver
// docs/superpowers/specs/2026-09-15-analytics-visitantes-plataforma-design.md.

import { useTranslations } from "next-intl";
import type { DiaSerie } from "@/lib/analytics/overview";
import { AreaLineChart } from "@/app/components/ui";

function ddmm(date: string): string {
    const [, m, d] = date.split("-");
    return d && m ? `${d}/${m}` : date;
}

export function VisitorsChart({ serie }: { serie: DiaSerie[] }) {
    const t = useTranslations("configuracoes.analytics.chart");

    const temDados = serie.length > 0 && serie.some((d) => d.pageviews > 0);
    if (!temDados) {
        return (
            <div
                className="flex h-48 items-center justify-center rounded-xl text-sm"
                style={{ border: "1px dashed var(--border-strong)", color: "var(--text-subtle)" }}
            >
                {t("noData")}
            </div>
        );
    }

    return (
        <AreaLineChart
            height={260}
            ariaLabel={t("ariaLabel")}
            categories={serie.map((d) => ddmm(d.date))}
            formatValue={(v) => String(Math.round(v))}
            series={[
                { name: t("legendTotal"), data: serie.map((d) => d.uniqueVisitors), color: "var(--brand)" },
                { name: t("legendLogged"), data: serie.map((d) => d.loggedVisitors), color: "var(--pos)" },
            ]}
        />
    );
}
