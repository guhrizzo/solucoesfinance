"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ApexOptions } from "apexcharts";

// ApexCharts mexe em `window` no import — só no cliente.
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export interface AreaSeries {
  name: string;
  data: number[];
  /** Token CSS (ex.: "var(--pos)") ou cor literal. */
  color: string;
  /** Linha tracejada sem área (meta/orçamento). */
  dashed?: boolean;
}

interface AreaLineChartProps {
  categories: string[];
  series: AreaSeries[];
  height?: number;
  /** Formata o valor no tooltip (ex.: toBRL). */
  formatValue: (v: number) => string;
  /** Rótulo curto do eixo Y (ex.: 12k). Default: inteiro. */
  formatAxis?: (v: number) => string;
  /** Esconde valores (tooltip e eixo) — mesmo toggle do <Sensitive>. */
  hideValues?: boolean;
  ariaLabel?: string;
  /** Permite valores negativos (resultado, saldo projetado) — por padrão o eixo Y começa em 0. */
  allowNegative?: boolean;
}

/** var(--x) → cor computada no elemento (Apex não entende var() e precisa da cor real pra gerar o degradê). */
function resolve(el: Element, c: string): string {
  const m = c.match(/^var\((--[^)]+)\)$/);
  return m ? getComputedStyle(el).getPropertyValue(m[1]).trim() || c : c;
}

function isDarkColor(c: string): boolean {
  const hex = c.replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return 0.299 * r + 0.587 * g + 0.114 * b < 128;
  }
  const rgb = c.match(/\d+/g);
  return rgb ? 0.299 * +rgb[0] + 0.587 * +rgb[1] + 0.114 * +rgb[2] < 128 : false;
}

/**
 * Gráfico de linha "área com degradê" (ApexCharts): curva suave monotônica,
 * brilho sob a linha (dropShadow) e faixa que esmaece pra baixo. Tokens do tema
 * resolvidos em runtime e relidos quando o tema claro/escuro muda.
 */
export function AreaLineChart({ categories, series, height = 260, formatValue, formatAxis, hideValues = false, ariaLabel, allowNegative = false }: AreaLineChartProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<{ colors: string[]; text: string; muted: string; grid: string; dark: boolean } | null>(null);

  const colorKey = series.map((s) => s.color).join("|");
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const read = () => {
      const text = resolve(el, "var(--text)");
      setTheme({
        colors: series.map((s) => resolve(el, s.color)),
        text,
        muted: resolve(el, "var(--text-subtle)"),
        grid: resolve(el, "var(--border)"),
        dark: !isDarkColor(text),
      });
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => { mo.disconnect(); mq.removeEventListener("change", read); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cores mudam só quando a lista muda
  }, [colorKey]);

  const options = useMemo<ApexOptions | null>(() => {
    if (!theme) return null;
    const solid = series.map((s, i) => (s.dashed ? -1 : i)).filter((i) => i >= 0);
    return {
      chart: {
        type: "area",
        background: "transparent",
        fontFamily: "inherit",
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: true, speed: 900 },
        // brilho: sombra borrada da própria linha, na cor da série
        dropShadow: { enabled: true, enabledOnSeries: solid, top: 3, left: 0, blur: 7, opacity: 0.45, color: theme.colors },
      },
      theme: { mode: theme.dark ? "dark" : "light" },
      colors: theme.colors,
      stroke: {
        curve: "monotoneCubic",
        width: series.map((s) => (s.dashed ? 2 : 3.5)),
        dashArray: series.map((s) => (s.dashed ? 6 : 0)),
        lineCap: "round",
      },
      fill: {
        type: series.map((s) => (s.dashed ? "solid" : "gradient")),
        opacity: series.map((s) => (s.dashed ? 0 : 1)),
        gradient: { type: "vertical", shadeIntensity: 0, opacityFrom: 0.6, opacityTo: 0.02, stops: [0, 85, 100] },
      },
      dataLabels: { enabled: false },
      markers: { size: 0, strokeWidth: 0, hover: { size: 6 } },
      legend: { show: false },
      grid: { borderColor: theme.grid, strokeDashArray: 4, padding: { left: 8, right: 8, top: 0 } },
      xaxis: {
        categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
        labels: { style: { colors: theme.muted, fontSize: "11px" } },
      },
      yaxis: {
        min: allowNegative ? undefined : 0,
        forceNiceScale: true,
        labels: {
          style: { colors: theme.muted, fontSize: "11px" },
          formatter: (v: number) => (hideValues ? "•••" : formatAxis ? formatAxis(v) : String(Math.round(v))),
        },
      },
      tooltip: {
        theme: theme.dark ? "dark" : "light",
        shared: true,
        intersect: false,
        y: { formatter: (v: number) => (hideValues ? formatValue(v).replace(/[\d.,]+/g, "").trim() + " ••••" : formatValue(v)) },
      },
    };
  }, [theme, series, categories, hideValues, formatValue, formatAxis, allowNegative]);

  return (
    <div ref={boxRef} role="img" aria-label={ariaLabel} style={{ minHeight: height }}>
      {options && (
        <Chart type="area" height={height} options={options}
          series={series.map((s) => ({ name: s.name, data: s.data }))} />
      )}
    </div>
  );
}
