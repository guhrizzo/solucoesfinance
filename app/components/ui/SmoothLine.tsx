"use client";

import { useId } from "react";

export type Pt = readonly [x: number, y: number];

/**
 * Curva suave pelos pontos — interpolação monotônica (Fritsch–Carlson, a mesma
 * do `curveMonotoneX` do d3). Diferente de uma Bézier "ingênua", nunca passa do
 * pico/vale dos pontos, então a linha não afunda abaixo do zero nem inventa
 * máximo que não existe.
 */
export function smoothPath(pts: readonly Pt[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
  if (n === 2) return `M${pts[0][0]},${pts[0][1]}L${pts[1][0]},${pts[1][1]}`;

  const dx: number[] = [];
  const m: number[] = []; // inclinação de cada segmento
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push(dx[i] === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  // tangente em cada ponto: 0 em pico/vale, média harmônica ponderada no resto
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t.push(0);
    else {
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      t.push((w1 + w2) / (w1 / m[i - 1] + w2 / m[i]));
    }
  }
  t.push(m[n - 2]);

  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${pts[i][0] + h},${pts[i][1] + h * t[i]} ${pts[i + 1][0] - h},${pts[i + 1][1] - h * t[i + 1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
  }
  return d;
}

interface SmoothLineProps {
  points: readonly Pt[];
  /** Cor da linha (aceita var(--token)). */
  color: string;
  /** Y da base do gráfico — até onde o degradê desce. Sem ele, não há área. */
  baseY?: number;
  strokeWidth?: number;
  /** Linha tracejada (meta/orçamento): sem área nem brilho. */
  dashed?: boolean;
  /** Opacidade do topo do degradê (default 0.32). */
  areaOpacity?: number;
  /** Atraso da animação de entrada, em segundos. */
  delay?: number;
}

/**
 * Série de gráfico de linha no estilo "área com degradê": curva suave, faixa
 * que esmaece de cima pra baixo e um brilho suave sob a linha. SVG puro — vai
 * dentro do <svg> do gráfico. Animação em globals.css (`.smooth-line*`).
 */
export function SmoothLine({ points, color, baseY, strokeWidth = 2.5, dashed = false, areaOpacity = 0.32, delay = 0 }: SmoothLineProps) {
  const gid = `sl${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  if (points.length === 0) return null;

  const line = smoothPath(points);
  const showArea = !dashed && baseY !== undefined && points.length > 1;
  const area = showArea
    ? `${line}L${points[points.length - 1][0]},${baseY}L${points[0][0]},${baseY}Z`
    : "";
  const top = Math.min(...points.map((p) => p[1]));
  const anim = { animationDelay: `${delay}s` };

  if (dashed) {
    return (
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray="5 4"
        strokeLinejoin="round" strokeLinecap="round" className="smooth-line-fade" style={{ animationDelay: `${delay + 0.2}s` }} />
    );
  }

  return (
    <g>
      <defs>
        {showArea && (
          <linearGradient id={`${gid}a`} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={baseY}>
            <stop offset="0%" stopColor={color} stopOpacity={areaOpacity} />
            <stop offset="60%" stopColor={color} stopOpacity={areaOpacity * 0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        )}
        <filter id={`${gid}g`} x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation="3" />
        </filter>
      </defs>
      {showArea && <path d={area} fill={`url(#${gid}a)`} stroke="none" className="smooth-line-area" style={{ animationDelay: `${delay + 0.35}s` }} />}
      {/* brilho: a mesma curva, mais grossa e borrada, por baixo da linha */}
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth * 2.4} strokeOpacity={0.45}
        strokeLinejoin="round" strokeLinecap="round" filter={`url(#${gid}g)`}
        pathLength={1} className="smooth-line-draw" style={anim} />
      <path d={line} fill="none" stroke={color} strokeWidth={strokeWidth}
        strokeLinejoin="round" strokeLinecap="round"
        pathLength={1} className="smooth-line-draw" style={anim} />
    </g>
  );
}
