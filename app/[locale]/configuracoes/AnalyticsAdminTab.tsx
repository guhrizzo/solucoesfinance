"use client";

// app/configuracoes/AnalyticsAdminTab.tsx
// Aba visível SÓ pros adm supremos (lib/compAccounts): quantas pessoas
// acessam a plataforma — visitantes/pageviews de hoje e do mês, gráfico dos
// últimos 30 dias e páginas mais acessadas. Portado de grupo_liberty
// (Liberty Car) — ver
// docs/superpowers/specs/2026-09-15-analytics-visitantes-plataforma-design.md.

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Users, UserCheck, Eye, CalendarClock, AlertTriangle, ShieldAlert, BarChart3 } from "lucide-react";
import { Card, KpiTile, Table, EmptyState } from "@/app/components/ui";
import { authedFetch } from "@/lib/authedFetch";
import { formatNumber } from "@/lib/format";
import type { AnalyticsOverview } from "@/lib/analytics/overview";
import { VisitorsChart } from "./VisitorsChart";

export default function AnalyticsAdminTab() {
    const t = useTranslations("configuracoes.analytics");
    const locale = useLocale();
    const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
    const [denied, setDenied] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await authedFetch("/api/analytics");
                if (cancelled) return;
                if (!res.ok) { setDenied(true); return; }
                const data = await res.json();
                setOverview(data);
            } catch {
                if (!cancelled) setDenied(true);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (denied) {
        return <EmptyState icon={ShieldAlert} title={t("deniedTitle")} description={t("deniedDesc")} />;
    }

    if (!overview) {
        return <p className="text-xs px-1" style={{ color: "var(--text-subtle)" }}>…</p>;
    }

    const { hoje, mes, serie30, topPaginas, erro } = overview;
    const anonHoje = Math.max(0, hoje.uniqueVisitors - hoje.loggedVisitors);
    const anonMes = Math.max(0, mes.uniqueVisitors - mes.loggedVisitors);
    const fmt = (n: number) => formatNumber(n, locale, { maximumFractionDigits: 0 });

    return (
        <div className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("subtitle")}</p>

            {erro && (
                <div
                    className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
                    style={{ background: "var(--warn-weak)", border: "1px solid var(--warn-weak)", color: "var(--warn)" }}
                >
                    <AlertTriangle size={16} />
                    {t("loadError")}
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <KpiTile
                    label={t("kpi.visitorsToday")}
                    value={fmt(hoje.uniqueVisitors)}
                    delta={t("kpi.loggedAnon", { logged: fmt(hoje.loggedVisitors), anon: fmt(anonHoje) })}
                    icon={Users}
                />
                <KpiTile
                    label={t("kpi.visitorsMonth", { month: mes.label })}
                    value={fmt(mes.uniqueVisitors)}
                    delta={t("kpi.loggedAnon", { logged: fmt(mes.loggedVisitors), anon: fmt(anonMes) })}
                    icon={CalendarClock}
                />
                <KpiTile
                    label={t("kpi.pageviewsToday")}
                    value={fmt(hoje.pageviews)}
                    delta={t("kpi.pageviewsTodayHint")}
                    icon={Eye}
                />
                <KpiTile
                    label={t("kpi.pageviewsMonth", { month: mes.label })}
                    value={fmt(mes.pageviews)}
                    delta={t("kpi.pageviewsMonthHint")}
                    icon={UserCheck}
                />
            </div>

            <Card padding="md">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>{t("chart.title")}</h3>
                    <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: "var(--brand)" }} /> {t("chart.legendTotal")}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full" style={{ background: "var(--pos)" }} /> {t("chart.legendLogged")}
                        </span>
                    </div>
                </div>
                <div className="mt-4">
                    <VisitorsChart serie={serie30} />
                </div>
                <p className="mt-3 text-[11px]" style={{ color: "var(--text-subtle)" }}>{t("chart.footnote")}</p>
            </Card>

            <Card padding="md">
                <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>{t("pages.title")}</h3>
                <div className="mt-4">
                    <Table
                        columns={[
                            { key: "rank", header: "#", width: "40px" },
                            { key: "path", header: t("pages.colPage") },
                            { key: "views", header: t("pages.colViews"), align: "right", width: "120px" },
                        ]}
                        rows={topPaginas}
                        rowKey={(p) => p.path}
                        renderCell={(p, key) => {
                            if (key === "rank") return topPaginas.indexOf(p) + 1;
                            if (key === "path") return <span className="font-mono text-xs">{p.path}</span>;
                            if (key === "views") return <span className="font-bold">{fmt(p.views)}</span>;
                            return null;
                        }}
                        empty={
                            <EmptyState
                                icon={BarChart3}
                                title={t("pages.emptyTitle")}
                                description={t("pages.emptyDesc")}
                            />
                        }
                    />
                </div>
            </Card>
        </div>
    );
}
