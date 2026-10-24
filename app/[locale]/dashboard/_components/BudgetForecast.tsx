"use client";

import { useCallback, useMemo, useState } from "react";
import { TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AreaLineChart, Pill } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { addDays, type BudgetSummary, type Projection } from "@/lib/dashboardInsights";
import { EmptyLine, Meter, Money, SectionCard, SectionStatus, usePct, type SourceState } from "./shared";

interface Props {
  budget: BudgetSummary;
  projection: Projection;
  today: string;
  hide: boolean;
  periodLabel: string;
  /** null = sem permissão em nenhuma fonte do orçamento. */
  budgetState: SourceState | null;
  projectionState: SourceState;
  /** O usuário vê o link do módulo de Centro de Custos? */
  canSeeCenters: boolean;
}

const axisShort = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1_000_000 ? `${Math.round(a / 100_000) / 10}M` : a >= 1000 ? `${Math.round(a / 1000)}k` : String(Math.round(a));
  return v < 0 ? `-${s}` : s;
};

export function BudgetForecast({ budget, projection, today, hide, periodLabel, budgetState, projectionState, canSeeCenters }: Props) {
  const t = useTranslations("dashboard.budgetSection");
  const tp = useTranslations("dashboard.projection");
  const locale = useLocale();
  const pct = usePct();
  const [horizon, setHorizon] = useState<number>(30);
  const sel = projection.horizontes.find((h) => h.days === horizon) ?? projection.horizontes[projection.horizontes.length - 1];
  const fmt = useCallback((n: number) => formatMoney(n, locale), [locale]);

  const cats = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" });
    return projection.diario.map((_, i) => f.format(new Date(addDays(today, i) + "T12:00:00")));
  }, [projection.diario, today, locale]);

  const groupLabel = (k: "centers" | "bills" | "taxes") => t(`group.${k}`);
  const tone = (p: number | null, over: boolean) => (over ? "neg" : (p ?? 0) >= 90 ? "warn" : "brand") as "neg" | "warn" | "brand";

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5">
      {budgetState !== null && (
        <SectionCard
          id="orcamento"
          title={t("title")}
          subtitle={t("subtitle", { period: periodLabel })}
          action={canSeeCenters ? <Link href="/costCenter" className="text-xs font-semibold" style={{ color: "var(--brand)" }}>{t("open")}</Link> : undefined}
        >
          {budgetState !== "ok" ? <SectionStatus state={budgetState} what={t("what")} /> : !budget.hasBudget ? (
            <EmptyLine>{t("empty")}</EmptyLine>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <span className="mono text-xl font-semibold" style={{ color: budget.excedido ? "var(--neg)" : "var(--text)" }}>{pct(budget.pct ?? 0, 0)} <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>{t("consumed")}</span></span>
                  {budget.excedido ? <Pill tone="neg" dot>{t("exceeded")}</Pill> : <Pill tone="pos" dot>{t("withinBudget")}</Pill>}
                </div>
                <Meter pct={budget.pct} tone={tone(budget.pct, budget.excedido)} />
                <dl className="grid grid-cols-3 gap-2 mt-2 text-xs">
                  <div><dt style={{ color: "var(--text-muted)" }}>{t("budgeted")}</dt><dd className="mono font-semibold"><Money value={budget.orcado} hide={hide} /></dd></div>
                  <div><dt style={{ color: "var(--text-muted)" }}>{t("realized")}</dt><dd className="mono font-semibold"><Money value={budget.realizado} hide={hide} /></dd></div>
                  <div><dt style={{ color: "var(--text-muted)" }}>{budget.excedido ? t("over") : t("balance")}</dt><dd className="mono font-semibold" style={{ color: budget.excedido ? "var(--neg)" : "var(--pos)" }}><Money value={Math.abs(budget.saldo)} hide={hide} /></dd></div>
                </dl>
              </div>

              <ul className="space-y-2.5">
                {budget.grupos.map((g) => (
                  <li key={g.key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: "var(--text-muted)" }}>{groupLabel(g.key)}</span>
                      <span className="mono" style={{ color: "var(--text)" }}>
                        <Money value={g.realizado} hide={hide} /> / <Money value={g.orcado} hide={hide} />
                        {g.pct !== null && <span className="ml-1.5 font-semibold">{pct(g.pct, 0)}</span>}
                      </span>
                    </div>
                    <Meter pct={g.pct} tone={tone(g.pct, g.pct !== null && g.pct > 100)} />
                  </li>
                ))}
              </ul>

              {budget.desvios.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold mb-1.5" style={{ color: "var(--text)" }}>{t("topDeviations")}</h3>
                  <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                    {budget.desvios.slice(0, 3).map((d) => (
                      <li key={d.id} className="flex items-center justify-between gap-2 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>
                        <span className="truncate" style={{ color: "var(--text)" }}>{d.name}</span>
                        <span className="mono shrink-0" style={{ color: d.over ? "var(--neg)" : "var(--text-muted)" }}>
                          {d.over ? t("overBy") : t("leftOf")} <Money value={Math.abs(d.desvio)} hide={hide} />
                          {d.pct !== null && ` · ${pct(d.pct, 0)}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-[11px] leading-snug" style={{ color: "var(--text-subtle)" }}>{t("rule")}</p>
            </div>
          )}
        </SectionCard>
      )}

      <SectionCard id="projecao" title={tp("title")} subtitle={tp("subtitle")} className={budgetState === null ? "xl:col-span-2" : ""}>
        {projectionState !== "ok" ? <SectionStatus state={projectionState} what={tp("what")} /> : (
          <div className="space-y-3">
            <div className="flex gap-1 no-print" role="group" aria-label={tp("horizon")}>
              {projection.horizontes.map((h) => (
                <button key={h.days} type="button" onClick={() => setHorizon(h.days)} aria-pressed={sel?.days === h.days}
                  className="px-3 py-1 rounded-md text-xs font-semibold cursor-pointer"
                  style={sel?.days === h.days ? { background: "var(--brand)", color: "var(--brand-on)" } : { background: "var(--sunken)", color: "var(--text-muted)" }}>
                  {tp("days", { days: h.days })}
                </button>
              ))}
            </div>
            {sel && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {([
                  { label: tp("currentBalance"), value: projection.saldoAtual, Icon: Wallet, bg: "var(--brand-weak)", fg: "var(--brand)", note: tp("currentBalanceNote") },
                  { label: tp("expectedIn"), value: sel.receber + Math.max(sel.lancamentosFuturos, 0), Icon: TrendingUp, bg: "var(--pos-weak)", fg: "var(--pos)", note: tp("expectedInNote", { days: sel.days }), sign: "+ " },
                  { label: tp("scheduledOut"), value: sel.pagar + Math.max(-sel.lancamentosFuturos, 0), Icon: TrendingDown, bg: "var(--neg-weak)", fg: "var(--neg)", note: tp("scheduledOutNote", { days: sel.days }), sign: "- " },
                ]).map((c) => (
                  <div key={c.label} className="flex items-center gap-3 p-3 rounded-xl min-w-0" style={{ background: c.bg }}>
                    <c.Icon size={18} style={{ color: c.fg }} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium" style={{ color: c.fg }}>{c.label}</p>
                      <p className="mono font-extrabold text-base truncate" style={{ color: c.fg }}>{c.sign}<Money value={c.value} hide={hide} /></p>
                      <p className="text-[11px] truncate" style={{ color: c.fg }}>{c.note}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {sel && (
              <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
                <span>{tp("projectedFinal", { days: sel.days })}</span>
                <span className="mono font-semibold" style={{ color: sel.saldo < 0 ? "var(--neg)" : "var(--pos)" }}>
                  <Money value={sel.saldo} hide={hide} />{sel.saldo < 0 && <span className="sr-only"> {tp("negative")}</span>}
                </span>
              </div>
            )}
            <AreaLineChart
              height={190}
              allowNegative
              categories={cats}
              hideValues={hide}
              formatValue={fmt}
              formatAxis={axisShort}
              ariaLabel={tp("aria")}
              series={[{ name: tp("projectedBalance"), data: projection.diario, color: "var(--brand)" }]}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <caption className="sr-only">{tp("tableCaption")}</caption>
                <thead>
                  <tr style={{ color: "var(--text-muted)" }}>
                    <th scope="col" className="text-left font-semibold pb-1.5">{tp("horizon")}</th>
                    <th scope="col" className="text-right font-semibold pb-1.5">{tp("in")}</th>
                    <th scope="col" className="text-right font-semibold pb-1.5">{tp("out")}</th>
                    <th scope="col" className="text-right font-semibold pb-1.5">{tp("balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {projection.horizontes.map((h) => (
                    <tr key={h.days} className="border-t" style={{ borderColor: "var(--border)" }}>
                      <th scope="row" className="text-left font-medium py-1.5" style={{ color: "var(--text)" }}>{tp("days", { days: h.days })}</th>
                      <td className="mono text-right py-1.5" style={{ color: "var(--pos)" }}><Money value={h.receber + Math.max(h.lancamentosFuturos, 0)} hide={hide} /></td>
                      <td className="mono text-right py-1.5" style={{ color: "var(--neg)" }}><Money value={h.pagar + Math.max(-h.lancamentosFuturos, 0)} hide={hide} /></td>
                      <td className="mono text-right py-1.5 font-semibold" style={{ color: h.saldo < 0 ? "var(--neg)" : "var(--text)" }}>
                        <Money value={h.saldo} hide={hide} />{h.saldo < 0 && <span className="sr-only"> {tp("negative")}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(projection.pagarVencido.count > 0 || projection.receberVencido.count > 0) && (
              <ul className="text-xs space-y-0.5" style={{ color: "var(--text-muted)" }}>
                {projection.pagarVencido.count > 0 && (
                  <li>{tp("overduePayIncluded", { count: projection.pagarVencido.count })} <Money value={projection.pagarVencido.total} hide={hide} /></li>
                )}
                {projection.receberVencido.count > 0 && (
                  <li>{tp("overdueRecExcluded", { count: projection.receberVencido.count })} <Money value={projection.receberVencido.total} hide={hide} /></li>
                )}
              </ul>
            )}
            <p className="text-[11px] leading-snug" style={{ color: "var(--text-subtle)" }}>{tp("rule")}</p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
