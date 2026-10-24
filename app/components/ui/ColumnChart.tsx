"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ApexOptions } from "apexcharts";

// ApexCharts mexe em `window` no import — só no cliente.
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export interface ColumnSeries {
  name: string;
  data: number[];
  /** Token CSS (ex.: "var(--pos)") ou cor literal. */
  color: string;
}

interface ColumnChartProps {
  categories: string[];
  series: ColumnSeries[];
  height?: number;
  formatValue: (v: number) => string;
  formatAxis?: (v: number) => string;
  hideValues?: boolean;
  ariaLabel?: string;
}

/** var(--x) → cor computada no elemento (Apex não entende var()). */
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
 * Colunas agrupadas (ApexCharts) — par do AreaLineChart: mesmos tokens do tema
 * resolvidos em runtime, relidos quando o tema claro/escuro muda. Pensado pra
 * poucas séries (2) e legível em tela estreita.
 */
export function ColumnChart({ categories, series, height = 260, formatValue, formatAxis, hideValues = false, ariaLabel }: ColumnChartProps) {
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
    return {
      chart: {
        type: "bar",
        background: "transparent",
        fontFamily: "inherit",
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: true, speed: 600 },
      },
      theme: { mode: theme.dark ? "dark" : "light" },
      colors: theme.colors,
      plotOptions: { bar: { columnWidth: categories.length > 8 ? "70%" : "55%", borderRadius: 3, borderRadiusApplication: "end" } },
      stroke: { show: true, width: 2, colors: ["transparent"] },
      dataLabels: { enabled: false },
      legend: { show: false },
      grid: { borderColor: theme.grid, strokeDashArray: 4, padding: { left: 8, right: 8, top: 0 } },
      xaxis: {
        categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        tooltip: { enabled: false },
        labels: { style: { colors: theme.muted, fontSize: "11px" }, rotate: 0, hideOverlappingLabels: true },
      },
      yaxis: {
        min: 0,
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
  }, [theme, categories, hideValues, formatValue, formatAxis]);

  return (
    <div ref={boxRef} role="img" aria-label={ariaLabel} style={{ minHeight: height }}>
      {options && (
        <Chart type="bar" height={height} options={options}
          series={series.map((s) => ({ name: s.name, data: s.data }))} />
      )}
    </div>
  );
}
