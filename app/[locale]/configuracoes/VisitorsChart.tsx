"use client";

// app/configuracoes/VisitorsChart.tsx
// Gráfico de linha em SVG puro (sem lib), visitantes únicos vs. logados nos
// últimos 30 dias. Portado de grupo_liberty (Liberty Car) — ver
// docs/superpowers/specs/2026-09-15-analytics-visitantes-plataforma-design.md.

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DiaSerie } from "@/lib/analytics/overview";

const W = 720;
const H = 240;
const PAD = { top: 16, right: 12, bottom: 26, left: 32 };

function ddmm(date: string): string {
    const [, m, d] = date.split("-");
    return d && m ? `${d}/${m}` : date;
}

export function VisitorsChart({ serie }: { serie: DiaSerie[] }) {
    const t = useTranslations("configuracoes.analytics.chart");
    const [hover, setHover] = useState<number | null>(null);

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

    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;
    const maxY = Math.max(1, ...serie.map((d) => d.uniqueVisitors));

    const x = (i: number) => PAD.left + (serie.length === 1 ? plotW / 2 : (i / (serie.length - 1)) * plotW);
    const y = (v: number) => PAD.top + plotH - (v / maxY) * plotH;

    const linha = (sel: (d: DiaSerie) => number) => serie.map((d, i) => `${x(i)},${y(sel(d))}`).join(" ");

    // ~5 rótulos no eixo X
    const passo = Math.max(1, Math.ceil(serie.length / 6));

    return (
        <div className="relative">
            <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full"
                style={{ height: "auto" }}
                preserveAspectRatio="xMidYMid meet"
                role="img"
                aria-label={t("ariaLabel")}
            >
                {/* grade horizontal + rótulos Y (0, meio, topo) */}
                {[0, 0.5, 1].map((frac) => {
                    const gy = PAD.top + plotH - frac * plotH;
                    return (
                        <g key={frac}>
                            <line x1={PAD.left} x2={W - PAD.right} y1={gy} y2={gy} stroke="var(--border)" strokeWidth={1} />
                            <text x={PAD.left - 6} y={gy + 3} textAnchor="end" fontSize={9} fill="var(--text-subtle)">
                                {Math.round(frac * maxY)}
                            </text>
                        </g>
                    );
                })}

                {/* rótulos X */}
                {serie.map((d, i) =>
                    i % passo === 0 || i === serie.length - 1 ? (
                        <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--text-subtle)">
                            {ddmm(d.date)}
                        </text>
                    ) : null
                )}

                <polyline
                    points={linha((d) => d.uniqueVisitors)}
                    fill="none"
                    stroke="var(--brand)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
                <polyline
                    points={linha((d) => d.loggedVisitors)}
                    fill="none"
                    stroke="var(--pos)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />

                {hover !== null && (
                    <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--border-strong)" strokeWidth={1} />
                )}
                {hover !== null && (
                    <>
                        <circle cx={x(hover)} cy={y(serie[hover].uniqueVisitors)} r={3} fill="var(--brand)" />
                        <circle cx={x(hover)} cy={y(serie[hover].loggedVisitors)} r={3} fill="var(--pos)" />
                    </>
                )}

                {/* faixas de captura do hover */}
                {serie.map((d, i) => {
                    const bw = plotW / serie.length;
                    return (
                        <rect
                            key={d.date}
                            x={x(i) - bw / 2}
                            y={PAD.top}
                            width={bw}
                            height={plotH}
                            fill="transparent"
                            onMouseEnter={() => setHover(i)}
                            onMouseLeave={() => setHover(null)}
                        />
                    );
                })}
            </svg>

            {hover !== null && (
                <div
                    className="pointer-events-none absolute -translate-x-1/2 rounded-lg px-2.5 py-1.5 text-[11px] shadow-md"
                    style={{ left: `${(x(hover) / W) * 100}%`, top: 0, background: "var(--surface)", border: "1px solid var(--border)" }}
                >
                    <div className="font-bold" style={{ color: "var(--text)" }}>{ddmm(serie[hover].date)}</div>
                    <div style={{ color: "var(--brand)" }}>{t("tooltipVisitors", { count: serie[hover].uniqueVisitors })}</div>
                    <div style={{ color: "var(--pos)" }}>{t("tooltipLogged", { count: serie[hover].loggedVisitors })}</div>
                </div>
            )}
        </div>
    );
}
