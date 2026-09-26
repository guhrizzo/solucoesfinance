"use client";

import { useLocale, useTranslations } from "next-intl";
import { CANAIS_QUEBRA, CANAL_INFO, toBRL, type Canal } from "./shared";

interface Bucket {
  dia: number;
  key: string;
  porCanal: Partial<Record<Canal, number>>;
  total: number;
}

const W = 640, H = 200, PAD_L = 44, PAD_R = 8, PAD_T = 10, PAD_B = 22;

/** Formato curto pro eixo Y ("1,2 mil"). */
const compact = (n: number, locale: string) =>
  new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);

/**
 * Vendas diárias em barras empilhadas por canal + linha tracejada da meta
 * diária (ponto de equilíbrio ÷ dias do mês). Dias abaixo da meta ficam
 * visíveis pela própria linha — sem cor extra além das de canal.
 */
export function VendasChart({ buckets, metaDiaria }: { buckets: Bucket[]; metaDiaria: number }) {
  const t = useTranslations("vendas.chart");
  const tCh = useTranslations("vendas.channels");
  const locale = useLocale();
  const label = (c: Canal) => (c === "manual" ? tCh("manual") : CANAL_INFO[c].label);

  const vazio = buckets.every((b) => b.total === 0);
  const max = Math.max(1, metaDiaria, ...buckets.map((b) => b.total)) * 1.1;
  const plotH = H - PAD_T - PAD_B;
  const plotW = W - PAD_L - PAD_R;
  const y = (v: number) => PAD_T + plotH - (v / max) * plotH;
  const slot = plotW / buckets.length;
  const bw = Math.max(3, slot - 3);
  const ticks = [0, max / 2, max];
  const diasAbaixo = metaDiaria > 0 ? buckets.filter((b) => b.total > 0 && b.total < metaDiaria).length : 0;

  return (
    <section
      className="flex min-w-0 flex-col p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)" }}
    >
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{t("title")}</h2>
          {metaDiaria > 0 && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-subtle)" }}>
              {t("dailyTarget", { value: toBRL(metaDiaria, locale) })}
              {diasAbaixo > 0 && ` · ${t("daysBelow", { count: diasAbaixo })}`}
            </p>
          )}
        </div>
        <ul className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
          {CANAIS_QUEBRA.map((c) => (
            <li key={c} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CANAL_INFO[c].solid }} />
              {label(c)}
            </li>
          ))}
          {metaDiaria > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="inline-block w-3.5 border-t-2 border-dashed" style={{ borderColor: "var(--text-muted)" }} />
              {t("targetLegend")}
            </li>
          )}
        </ul>
      </header>

      {vazio ? (
        <div className="grid h-44 place-items-center text-xs" style={{ color: "var(--text-subtle)" }}>{t("empty")}</div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={t("ariaLabel")}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
                <text x={PAD_L - 6} y={y(v) + 3} fontSize="10" textAnchor="end" fill="var(--text-subtle)">
                  {compact(v, locale)}
                </text>
              </g>
            ))}

            {buckets.map((b, i) => {
              const x = PAD_L + i * slot + (slot - bw) / 2;
              let acc = 0;
              return (
                <g key={b.key}>
                  <title>
                    {`${b.dia} · ${toBRL(b.total, locale)}`}
                  </title>
                  {/* área de hover inteira da coluna */}
                  <rect x={PAD_L + i * slot} y={PAD_T} width={slot} height={plotH} fill="transparent" />
                  {CANAIS_QUEBRA.map((c) => {
                    const v = b.porCanal[c] || 0;
                    if (v <= 0) return null;
                    const top = y(acc + v);
                    const h = y(acc) - top;
                    acc += v;
                    return <rect key={c} x={x} y={top} width={bw} height={Math.max(1, h)} fill={CANAL_INFO[c].solid} />;
                  })}
                  {(buckets.length <= 16 || i % 3 === 0) && (
                    <text x={x + bw / 2} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--text-subtle)">{b.dia}</text>
                  )}
                </g>
              );
            })}

            {metaDiaria > 0 && (
              <line
                x1={PAD_L} x2={W - PAD_R} y1={y(metaDiaria)} y2={y(metaDiaria)}
                stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="5 4"
              />
            )}
          </svg>

          <table className="sr-only">
            <caption>{t("caption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("colPeriod")}</th>
                {CANAIS_QUEBRA.map((c) => <th key={c} scope="col">{label(c)}</th>)}
              </tr>
            </thead>
            <tbody>
              {buckets.filter((b) => b.total > 0).map((b) => (
                <tr key={b.key}>
                  <th scope="row">{b.dia}</th>
                  {CANAIS_QUEBRA.map((c) => <td key={c}>{toBRL(b.porCanal[c] || 0, locale)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
