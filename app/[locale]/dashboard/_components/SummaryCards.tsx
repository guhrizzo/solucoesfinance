"use client";

import type { ReactNode } from "react";
import { AlertOctagon, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CalendarRange, ClipboardList, HandCoins, Info, ReceiptText, Scale, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { Pill } from "@/app/components/ui";
import type { BudgetSummary, DashAlert, DueSummary, ResultOverview } from "@/lib/dashboardInsights";
import { Delta, Meter, Money, usePct, type SourceState } from "./shared";

interface Props {
  overview: ResultOverview;
  due: DueSummary;
  budget: BudgetSummary;
  alerts: DashAlert[];
  hide: boolean;
  isAnnual: boolean;
  periodLabel: string;
  periodEnded: boolean;
  /** Estado das fontes que alimentam cada card; null = módulo sem permissão (card oculto). */
  state: { receivables: SourceState | null; payables: SourceState | null; budget: SourceState | null };
  onOpenDefault: () => void;
}

function Tile({ label, icon: Icon, children }: { label: ReactNode; icon: typeof Wallet; children: ReactNode }) {
  return (
    <div className="dash-card p-3.5 md:p-4 flex flex-col gap-1.5 min-w-0">
      <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        <Icon size={14} aria-hidden="true" /> {label}
      </span>
      {children}
    </div>
  );
}

const valueCls = "mono text-lg md:text-xl font-semibold tracking-tight truncate";

function Unavailable({ state }: { state: SourceState }) {
  const t = useTranslations("dashboard.states");
  return <span className="text-xs" style={{ color: state === "error" ? "var(--neg)" : "var(--text-subtle)" }}>{state === "error" ? t("unavailable") : t("loading")}</span>;
}

export function SummaryCards({ overview, due, budget, alerts, hide, isAnnual, periodLabel, periodEnded, state, onOpenDefault }: Props) {
  const t = useTranslations("dashboard.cards");
  const pct = usePct();
  const { periodo, acumulado, ano } = overview;

  const acc = acumulado.resultado;
  const surplus = acc >= 0;
  const accTone = acc > 0 ? "var(--pos)" : acc < 0 ? "var(--neg)" : "var(--text)";
  const count = (sev: DashAlert["severity"]) => alerts.filter((a) => a.severity === sev).length;
  const nCrit = count("critical"), nWarn = count("warning"), nInfo = count("info");
  const outside = periodo.foraDoResultado.entradas + periodo.foraDoResultado.saidas;

  return (
    <div className="space-y-3 md:space-y-4">
      {/* Linha de prioridade: saldo, resultado acumulado e alertas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <div className="dash-card p-4 md:p-5 flex flex-col gap-2 min-w-0">
          <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            <Wallet size={14} aria-hidden="true" /> {t("balance")}
          </span>
          <span className="mono text-2xl md:text-3xl font-semibold tracking-tight truncate" style={{ color: overview.saldoAtual < 0 ? "var(--neg)" : "var(--text)" }}>
            <Money value={overview.saldoAtual} hide={hide} />
          </span>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {overview.saldoAtual < 0 ? <Pill tone="neg" dot>{t("balanceNegative")}</Pill> : t("balanceNote")}
          </p>
          {periodEnded && (
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
              {t("balanceAtEnd", { period: periodLabel })}: <Money value={overview.saldoFimPeriodo} hide={hide} />
            </p>
          )}
        </div>

        <div className="dash-card p-4 md:p-5 flex flex-col gap-2 min-w-0">
          <span className="flex items-center justify-between gap-2 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1.5"><Scale size={14} aria-hidden="true" /> {surplus ? t("surplus") : t("deficit")} · {isAnnual ? t("ofYear") : t("accumulatedYear")}</span>
            <Pill tone={acc === 0 ? "muted" : surplus ? "pos" : "neg"} dot>{acc === 0 ? t("breakEven") : surplus ? t("surplusShort") : t("deficitShort")}</Pill>
          </span>
          <span className="mono text-2xl md:text-3xl font-semibold tracking-tight truncate" style={{ color: accTone }}>
            <Money value={acc} hide={hide} signed />
          </span>
          <dl className="text-xs grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5" style={{ color: "var(--text-muted)" }}>
            {!isAnnual && (
              <>
                <dt>{t("resultOfPeriod", { period: periodLabel })}</dt>
                <dd className="mono text-right" style={{ color: "var(--text)" }}><Money value={periodo.resultado} hide={hide} signed /></dd>
                <dt className="col-span-2"><Delta value={overview.variacao.resultado} /> <span style={{ color: "var(--text-subtle)" }}>{t("vsEquivalent")}</span></dt>
              </>
            )}
            {isAnnual && (
              <dt className="col-span-2"><Delta value={overview.variacao.acumulado} /> <span style={{ color: "var(--text-subtle)" }}>{t("vsEquivalentYear")}</span></dt>
            )}
            <dt>{t("revenue")}</dt>
            <dd className="mono text-right"><Money value={acumulado.receita} hide={hide} /></dd>
            <dt>{t("expenses")}</dt>
            <dd className="mono text-right"><Money value={acumulado.despesa} hide={hide} /></dd>
          </dl>
          <p className="text-[11px] leading-snug" style={{ color: "var(--text-subtle)" }}>
            {t("notBalance")}
            {outside > 0 && ` ${t("outsideResult")}`}
          </p>
        </div>

        <a href="#alertas" className="dash-card p-4 md:p-5 flex flex-col gap-2 min-w-0 no-underline transition-colors hover:bg-[var(--sunken)]" aria-label={t("alertsLink")}>
          <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
            <AlertOctagon size={14} aria-hidden="true" /> {t("alerts")}
          </span>
          {alerts.length === 0 ? (
            <>
              <span className="text-lg font-semibold" style={{ color: "var(--text)" }}>{t("noAlerts")}</span>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("noAlertsNote")}</p>
            </>
          ) : (
            <>
              <span className="mono text-2xl md:text-3xl font-semibold" style={{ color: nCrit ? "var(--neg)" : "var(--text)" }}>{alerts.length}</span>
              <div className="flex flex-wrap gap-1.5">
                {nCrit > 0 && <Pill tone="neg"><AlertOctagon size={11} aria-hidden="true" />{t("critical", { count: nCrit })}</Pill>}
                {nWarn > 0 && <Pill tone="warn"><AlertTriangle size={11} aria-hidden="true" />{t("warning", { count: nWarn })}</Pill>}
                {nInfo > 0 && <Pill tone="info"><Info size={11} aria-hidden="true" />{t("info", { count: nInfo })}</Pill>}
              </div>
            </>
          )}
        </a>
      </div>

      {/* Linha compacta */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Tile label={t("inflows")} icon={ArrowDownToLine}>
          <span className={valueCls} style={{ color: "var(--pos)" }}><Money value={periodo.entradas} hide={hide} /></span>
          <Delta value={overview.variacao.entradas} goodWhen="up" />
        </Tile>
        <Tile label={t("outflows")} icon={ArrowUpFromLine}>
          <span className={valueCls} style={{ color: "var(--neg)" }}><Money value={periodo.saidas} hide={hide} /></span>
          <Delta value={overview.variacao.saidas} goodWhen="down" />
        </Tile>

        {state.receivables && (
          <Tile label={t("receivable")} icon={HandCoins}>
            {state.receivables === "ok" ? (
              <>
                <span className={valueCls}><Money value={due.receber.totalAberto.total} hide={hide} /></span>
                <span className="text-xs" style={{ color: due.receber.vencidas.count ? "var(--warn)" : "var(--text-subtle)" }}>
                  {due.receber.vencidas.count
                    ? <>{t("overdueN", { count: due.receber.vencidas.count })} · <Money value={due.receber.vencidas.total} hide={hide} /></>
                    : t("noneOverdue")}
                </span>
              </>
            ) : <Unavailable state={state.receivables} />}
          </Tile>
        )}

        {state.payables && (
          <Tile label={t("payable")} icon={ReceiptText}>
            {state.payables === "ok" ? (
              <>
                <span className={valueCls}><Money value={due.pagar.totalAberto.total} hide={hide} /></span>
                <span className="text-xs" style={{ color: due.pagar.vencidas.count ? "var(--neg)" : "var(--text-subtle)" }}>
                  {due.pagar.vencidas.count
                    ? <>{t("overdueN", { count: due.pagar.vencidas.count })} · <Money value={due.pagar.vencidas.total} hide={hide} /></>
                    : t("noneOverdue")}
                </span>
                <button type="button" onClick={onOpenDefault} className="text-xs font-semibold text-left cursor-pointer no-print" style={{ color: "var(--brand)" }}>
                  {t("seeDefault")}
                </button>
              </>
            ) : <Unavailable state={state.payables} />}
          </Tile>
        )}

        {state.budget && (
          <Tile label={t("budget")} icon={ClipboardList}>
            {state.budget === "ok" ? (
              budget.hasBudget ? (
                <>
                  <span className={valueCls} style={{ color: budget.excedido ? "var(--neg)" : "var(--text)" }}>{pct(budget.pct ?? 0, 0)}</span>
                  <Meter pct={budget.pct} tone={budget.excedido ? "neg" : (budget.pct ?? 0) >= 90 ? "warn" : "brand"} />
                  <span className="text-xs" style={{ color: budget.excedido ? "var(--neg)" : "var(--text-muted)" }}>
                    {budget.excedido ? t("budgetOver") : t("budgetLeft")}: <Money value={Math.abs(budget.saldo)} hide={hide} />
                  </span>
                </>
              ) : <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("noBudget")}</span>
            ) : <Unavailable state={state.budget} />}
          </Tile>
        )}

        <Tile label={t("annualResult")} icon={CalendarRange}>
          <span className={valueCls} style={{ color: ano.resultado > 0 ? "var(--pos)" : ano.resultado < 0 ? "var(--neg)" : "var(--text)" }}>
            <Money value={ano.resultado} hide={hide} signed />
          </span>
          <Delta value={overview.variacao.ano} />
        </Tile>
      </div>
    </div>
  );
}
