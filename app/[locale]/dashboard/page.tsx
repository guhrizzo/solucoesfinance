"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  AlertCircle, ChevronRight, ChevronLeft, Eye, EyeOff, Printer, X, ExternalLink, RefreshCw,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import OnboardingModal, { type OnboardingAnswers } from "@/app/components/OnboardingModal";
import CreatePasswordGate from "@/app/components/CreatePasswordGate";
import Navbar from "@/app/components/Navbar";
import { PageLoader, Sensitive, Modal } from "@/app/components/ui";
import AccessDenied from "@/app/components/AccessDenied";
import { usePeriod } from "@/app/hooks/usePeriod";
import { formatMoney, formatDateTime } from "@/lib/format";
import { categoryLabel } from "@/lib/cashflowCategories";
import {
  buildAlerts, buildBudget, buildCenterHighlights, buildDefaultRate, buildDueSummary, buildPayables,
  buildProjection, buildReceivables, buildResultOverview, buildTimeline, checkReconciliation,
  DEFAULT_ALERT_THRESHOLDS, daysBetween, inRange, periodRange, todayISO,
  type DashBill, type DashCostCenter, type DashExpense, type DashPeriod, type DashReceivable, type DashTax, type DashTx,
} from "@/lib/dashboardInsights";
import { SummaryCards } from "./_components/SummaryCards";
import { EvolutionCharts } from "./_components/EvolutionCharts";
import { BudgetForecast } from "./_components/BudgetForecast";
import { DueSection } from "./_components/DueSection";
import { CostCenterSection } from "./_components/CostCenterSection";
import { AlertCenter } from "./_components/AlertCenter";
import { SectionStatus, type SourceState } from "./_components/shared";
import "./dashboard.css";

// Fontes de dados do Firestore que alimentam o dashboard. "off" = o usuário
// (membro de equipe) não tem permissão no módulo de origem: nem assinamos a
// coleção, e a seção correspondente some.
type Src = "cashflow" | "bills" | "receivables" | "taxes" | "expenses" | "costCenters";
type SrcState = SourceState | "off";
const INITIAL_SRC: Record<Src, SrcState> = {
  cashflow: "loading", bills: "loading", receivables: "loading", taxes: "loading", expenses: "loading", costCenters: "loading",
};

// ─── Detalhamento da Inadimplência ─────────────────────────────────────────────
// O modal que abre pelo card "A pagar" abre as obrigações do negócio ainda não
// pagas linha a linha — Contas a Pagar, Impostos e despesas de Centro de
// Custos — agrupadas por origem dentro de duas seções (Vencidas / A vencer).
// Contas a Receber fica de fora de propósito: é dinheiro que o cliente deve pra
// você, não uma obrigação vencida do seu negócio. Mesmo padrão do modal do KPI
// "Orçamento" do Fluxo de Caixa (ver app/components/CashFlow.tsx, "Detalhamento
// do Orçamento").

type DefaultOrigin = "bill" | "tax" | "expense";
const DEFAULT_ORIGIN_HREF: Record<DefaultOrigin, string> = {
  bill: "/contasPagar",
  tax: "/impostos",
  expense: "/costCenter",
};
// Ordem fixa de exibição dos grupos no modal — reflete o fluxo Pagar →
// Impostos → Centro de Custos usado no resto do app.
const DEFAULT_ORIGIN_ORDER: DefaultOrigin[] = ["bill", "tax", "expense"];

interface DefaultLine {
  key: string;
  label: string;
  sub: string;
  amount: number;
  overdue: boolean;
  href: string;
  origin: DefaultOrigin;
  originLabel: string;
}
interface DefaultOriginGroup {
  origin: DefaultOrigin;
  originLabel: string;
  total: number;
  items: DefaultLine[];
}

function groupDefaultLines(rows: DefaultLine[]): DefaultOriginGroup[] {
  const m = new Map<DefaultOrigin, DefaultLine[]>();
  for (const r of rows) {
    const arr = m.get(r.origin) ?? [];
    arr.push(r);
    m.set(r.origin, arr);
  }
  return DEFAULT_ORIGIN_ORDER.filter(o => m.has(o)).map(origin => {
    const items = m.get(origin)!;
    return {
      origin,
      originLabel: items[0]?.originLabel ?? origin,
      items: items.sort((a, b) => a.sub.localeCompare(b.sub)),
      total: items.reduce((s, i) => s + i.amount, 0),
    };
  });
}

function DefaultStatusBadge({ overdue }: { overdue: boolean }) {
  const t = useTranslations("dashboard.defaultModal");
  return (
    <span
      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
      style={overdue ? { background: "var(--neg-weak)", color: "var(--neg)" } : { background: "var(--warn-weak)", color: "var(--warn)" }}
    >
      {overdue ? t("statusOverdue") : t("statusOpen")}
    </span>
  );
}

function DefaultLineRow({ line, hideValues }: { line: DefaultLine; hideValues: boolean }) {
  const locale = useLocale();
  return (
    <a
      href={line.href}
      className="flex items-center gap-2.5 px-4 py-2.5 border-b last:border-b-0 transition-colors hover:bg-[var(--sunken)]"
      style={{ borderColor: "var(--db-border)" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate" style={{ color: "var(--db-text)" }}>{line.label}</p>
          <DefaultStatusBadge overdue={line.overdue} />
        </div>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--db-text-3)" }}>{line.sub}</p>
      </div>
      <span className="text-sm font-semibold mono shrink-0" style={{ color: line.overdue ? "var(--neg)" : "var(--db-text)" }}>
        <Sensitive hidden={hideValues}>{formatMoney(line.amount, locale)}</Sensitive>
      </span>
      <ExternalLink size={12} className="shrink-0" style={{ color: "var(--db-text-3)" }} />
    </a>
  );
}

function DefaultCategoryBlock({ group, hideValues }: { group: DefaultOriginGroup; hideValues: boolean }) {
  const locale = useLocale();
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--db-border)" }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ background: "var(--db-bg-alt)", borderBottom: "1px solid var(--db-border)" }}>
        <span className="text-xs font-bold" style={{ color: "var(--db-text-2)" }}>{group.originLabel} · {group.items.length}</span>
        <span className="text-xs font-bold mono" style={{ color: "var(--db-text-2)" }}>
          <Sensitive hidden={hideValues}>{formatMoney(group.total, locale)}</Sensitive>
        </span>
      </div>
      {group.items.map(it => <DefaultLineRow key={it.key} line={it} hideValues={hideValues} />)}
    </div>
  );
}

function DefaultSection({ title, hint, total, color, hideValues, children }: {
  title: string; hint: string; total: number; color: string; hideValues: boolean; children: React.ReactNode;
}) {
  const locale = useLocale();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>{title}</span>
        <span className="text-sm font-bold mono" style={{ color }}>
          <Sensitive hidden={hideValues}>{formatMoney(total, locale)}</Sensitive>
        </span>
      </div>
      <p className="text-[11px] -mt-1.5" style={{ color: "var(--db-text-3)" }}>{hint}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const tNav = useTranslations("nav");
  const tCat = useTranslations("categories");
  const toBRL = useCallback((n: number) => formatMoney(n, locale), [locale]);

  const [showOnboarding, setShowOnboarding] = useState(false);
  // Gate bloqueante pra contas que entraram só pelo Google e nunca definiram senha.
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const [user, setUser] = useState<{ displayName: string | null; email: string | null; uid: string } | null>(null);
  const [loading, setLoading] = useState(true);
  // true quando o usuário logado é um membro de equipe sem "Dashboard"
  // liberado — ver lib/accountScope.ts.
  const [blocked, setBlocked] = useState(false);
  const [hideValues, setHideValues] = useState(false);
  // Recorte Mensal/Anual — mesmo padrão do toggle da tela de Relatórios (mês
  // ou ano do refDate global).
  const [filterPeriod, setFilterPeriod] = useState<"mes" | "ano">("mes");
  // Modal de detalhamento da Inadimplência — mesmo padrão do modal do KPI
  // "Orçamento" no Fluxo de Caixa.
  const [defaultModalOpen, setDefaultModalOpen] = useState(false);

  // Firestore Data States
  const [txs, setTxs] = useState<DashTx[]>([]);
  const [bills, setBills] = useState<DashBill[]>([]);
  const [receivables, setReceivables] = useState<DashReceivable[]>([]);
  const [taxes, setTaxes] = useState<DashTax[]>([]);
  const [expenses, setExpenses] = useState<DashExpense[]>([]);
  const [costCenters, setCostCenters] = useState<DashCostCenter[]>([]);
  const [srcState, setSrcState] = useState<Record<Src, SrcState>>(INITIAL_SRC);
  const markSrc = useCallback((s: Src, v: SrcState) => setSrcState((prev) => (prev[s] === v ? prev : { ...prev, [s]: v })), []);

  const activePath = "/dashboard";

  // ── Logout ─────────────────────────────────────────────────────────────────
  async function handleLogout() {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  // Mês de referência — é o mês global compartilhado (usePeriod), o mesmo que
  // a Navbar e as demais telas usam. Ver app/hooks/usePeriod.tsx.
  const { refDate, label: monthLabel, isCurrentMonth, goPrevMonth, goNextMonth, setMonth } = usePeriod();
  const isAnnual = filterPeriod === "ano";
  // Rótulo do período mostrado nos títulos: mês formatado (usePeriod) ou
  // "Ano de {year}" quando o toggle está em Anual.
  const periodLabel = isAnnual ? t("periodLabel.year", { year: refDate.getFullYear() }) : monthLabel;

  // No modo Anual o stepper precisa andar ano a ano (não mês a mês) — senão
  // o rótulo "Ano de {year}" só muda depois de 12 cliques. `setMonth` pula
  // pro mesmo mês no ano anterior/seguinte, mantendo o refDate global
  // coerente pro resto do app (Navbar, telas mensais).
  const isCurrentYear = refDate.getFullYear() === new Date().getFullYear();
  const isCurrentPeriod = isAnnual ? isCurrentYear : isCurrentMonth;
  const goPrevPeriod = useCallback(() => {
    if (isAnnual) setMonth(new Date(refDate.getFullYear() - 1, refDate.getMonth(), 1));
    else goPrevMonth();
  }, [isAnnual, refDate, setMonth, goPrevMonth]);
  const goNextPeriod = useCallback(() => {
    if (isAnnual) setMonth(new Date(refDate.getFullYear() + 1, refDate.getMonth(), 1));
    else goNextMonth();
  }, [isAnnual, refDate, setMonth, goNextMonth]);

  // ── Impressão do relatório do mês ──
  const [printedAt, setPrintedAt] = useState("");
  const handlePrint = () => {
    setPrintedAt(formatDateTime(new Date(), locale));
    // deixa o React pintar o cabeçalho de impressão antes de abrir o diálogo
    setTimeout(() => window.print(), 60);
  };

  // Inicialização e Listeners em tempo real do Firestore
  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    const unsubs: Array<() => void> = [];

    (async () => {
      try {
        const [{ getFirebase }, { onAuthStateChanged }, { collection, query, where, orderBy, onSnapshot, doc, getDoc }] = await Promise.all([
          import("@/lib/firebase"),
          import("firebase/auth"),
          import("firebase/firestore"),
        ]);
        const { auth, db } = await getFirebase();

        unsubAuth = onAuthStateChanged(auth, async (u) => {
          if (!u) {
            window.location.href = "/login";
            return;
          }

          // Resolve de quem são os dados que este login deve ver: o próprio
          // uid (dono) ou o do dono da conta (membro convidado) — ver
          // lib/accountScope.ts. Membro sem "dashboard" liberado nem chega
          // a assinar as coleções abaixo. `user.uid` continua sendo a
          // identidade real de quem logou (Navbar, PIN, etc.) — só os dados
          // do negócio (fluxo de caixa, contas, onboarding) usam `ownerUid`.
          const { resolveAccountScope, hasPermission } = await import("@/lib/accountScope");
          const scope = await resolveAccountScope(db, u.uid);
          if (!hasPermission(scope, "dashboard")) {
            setBlocked(true);
            setLoading(false);
            return;
          }
          const ownerUid = scope.ownerUid;

          setUser({ displayName: u.displayName, email: u.email, uid: u.uid });
          setNeedsPasswordSetup(!u.providerData.some((p) => p.providerId === "password"));

          getDoc(doc(db, "users", ownerUid, "profile", "onboarding"))
            .then((snap) => {
              const completed = snap.exists() && snap.data()?.completed;
              setShowOnboarding(!completed && scope.isOwner); // só o dono conclui o onboarding do negócio
              if (completed && typeof window !== "undefined") {
                localStorage.setItem(`onboarding_ramo_${ownerUid}`, JSON.stringify(snap.data()?.answers?.ramo || []));
              }
            })
            .catch((err) => console.error("Erro ao carregar onboarding:", err));

          // Cada módulo de origem só é lido se o usuário tiver permissão nele
          // — a seção do dashboard que depende dele some quando não tem.
          const allow = {
            bills: hasPermission(scope, "contasPagar"),
            taxes: hasPermission(scope, "impostos"),
            receivables: hasPermission(scope, "contasReceber"),
            centers: hasPermission(scope, "centroCustos"),
          };
          setSrcState((prev) => ({
            ...prev,
            bills: allow.bills ? "loading" : "off",
            taxes: allow.taxes ? "loading" : "off",
            receivables: allow.receivables ? "loading" : "off",
            expenses: allow.centers ? "loading" : "off",
            costCenters: allow.centers ? "loading" : "off",
          }));

          const listen = <T,>(src: Src, q: Parameters<typeof onSnapshot>[0], set: (rows: T[]) => void) => {
            unsubs.push(onSnapshot(q as never, (snap: { docs: Array<{ id: string; data: () => object }> }) => {
              set(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
              markSrc(src, "ok");
            }, (err: unknown) => {
              console.error(`Erro ao ler ${src}:`, err);
              markSrc(src, "error");
            }) as () => void);
          };

          // Lançamentos de Fluxo de Caixa — base de saldo e resultado.
          unsubs.push(onSnapshot(query(collection(db, "users", ownerUid, "cashflow"), orderBy("date", "desc")), (snap) => {
            setTxs(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DashTx));
            markSrc("cashflow", "ok");
            setLoading(false);
          }, (err) => {
            console.error("Erro Txs:", err);
            markSrc("cashflow", "error");
            setLoading(false);
          }));

          if (allow.bills) listen<DashBill>("bills", collection(db, "users", ownerUid, "bills"), setBills);
          if (allow.receivables) listen<DashReceivable>("receivables", collection(db, "users", ownerUid, "receivables"), setReceivables);
          if (allow.taxes) listen<DashTax>("taxes", collection(db, "users", ownerUid, "taxes"), setTaxes);
          if (allow.centers) {
            // Coleções raiz filtradas por dono, igual app/[locale]/costCenter.
            listen<DashExpense>("expenses", query(collection(db, "expenses"), where("userId", "==", ownerUid)), setExpenses);
            listen<DashCostCenter>("costCenters", query(collection(db, "costCenters"), where("userId", "==", ownerUid)), setCostCenters);
          }
        });
      } catch (err) {
        console.error("Erro ao inicializar listeners:", err);
        markSrc("cashflow", "error");
        setLoading(false);
      }
    })();

    return () => {
      unsubAuth?.();
      unsubs.forEach((u) => u());
    };
  }, [markSrc]);

  // Estado agregado de um conjunto de fontes: null = nenhuma liberada pro usuário.
  const stateOf = useCallback((srcs: Src[]): SourceState | null => {
    const active = srcs.filter((s) => srcState[s] !== "off");
    if (active.length === 0) return null;
    if (active.some((s) => srcState[s] === "error")) return "error";
    if (active.some((s) => srcState[s] === "loading")) return "loading";
    return "ok";
  }, [srcState]);

  const payablesState = stateOf(["bills", "taxes", "expenses"]);
  const receivablesState = stateOf(["receivables"]);
  const budgetState = stateOf(["costCenters", "expenses", "bills", "taxes"]);
  const centersState = stateOf(["costCenters", "expenses"]);
  const projectionState = stateOf(["bills", "taxes", "expenses", "receivables"]) ?? "ok";

  // ── Cálculos (todos em lib/dashboardInsights.ts) ───────────────────────────
  const today = todayISO();
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const period = useMemo<DashPeriod>(() => ({ mode: isAnnual ? "ano" : "mes", year, month }), [isAnnual, year, month]);

  const overview = useMemo(() => buildResultOverview(txs, period, today), [txs, period, today]);
  const columns = useMemo(() => buildTimeline(txs, period, today, isAnnual ? "month" : "week"), [txs, period, today, isAnnual]);
  const evolution = useMemo(() => buildTimeline(txs, period, today, isAnnual ? "month" : "day"), [txs, period, today, isAnnual]);

  const payables = useMemo(() => buildPayables(bills, taxes, expenses), [bills, taxes, expenses]);
  const receivableItems = useMemo(() => buildReceivables(receivables), [receivables]);
  const due = useMemo(() => buildDueSummary(payables, receivableItems, today), [payables, receivableItems, today]);
  const projection = useMemo(() => buildProjection(txs, payables, receivableItems, today), [txs, payables, receivableItems, today]);
  const budget = useMemo(() => buildBudget(period, today, { costCenters, expenses, bills, taxes }), [period, today, costCenters, expenses, bills, taxes]);
  const centers = useMemo(() => buildCenterHighlights(period, today, { costCenters, expenses }), [period, today, costCenters, expenses]);
  const recon = useMemo(() => checkReconciliation(txs, period, today), [txs, period, today]);

  const alerts = useMemo(() => buildAlerts({
    overview, due,
    // Dado parcial/carregando não gera alerta: sem fonte confiável, sem alerta.
    projection: projectionState === "ok" ? projection : { ...projection, horizontes: [] },
    budget, recon,
    access: { payables: payablesState === "ok", receivables: receivablesState === "ok", budget: budgetState === "ok", cashflow: true },
  }), [overview, due, projection, projectionState, budget, recon, payablesState, receivablesState, budgetState]);

  const periodEnded = periodRange(period).end < today;
  const defaultRate = useMemo(() => buildDefaultRate(payables, period, today), [payables, period, today]);

  // Detalhamento da Inadimplência — alimenta o modal do card "A pagar": as
  // obrigações em aberto (saldo, descontadas as baixas parciais) com vencimento
  // no período selecionado — Contas a Pagar, Impostos e despesas de Centro de
  // Custos —, separadas em Vencidas / A vencer e agrupadas por origem.
  const defaultDetalhe = useMemo(() => {
    const range = periodRange(period);
    const lines: DefaultLine[] = payables
      .filter((i) => i.open > 0.005 && inRange(i.dueDate, range))
      .map((i): DefaultLine => {
        const diff = daysBetween(today, i.dueDate);
        const overdue = diff < 0;
        const sub = overdue
          ? t("defaultModal.overdueBy", { days: Math.abs(diff) })
          : t("defaultModal.dueIn", { date: new Date(i.dueDate + "T12:00:00").toLocaleDateString(locale, { day: "2-digit", month: "short" }).replace(/\./g, "") });
        const origin = i.kind as DefaultOrigin;
        const fallbackLabel = origin === "expense" ? (categoryLabel(i.category ?? "", tCat) || "") : "";
        return {
          key: i.key,
          label: i.label || fallbackLabel || t("defaultModal.fallbackLabel"),
          sub, amount: i.open, overdue,
          href: DEFAULT_ORIGIN_HREF[origin],
          origin,
          originLabel: t(`defaultModal.origin.${origin}`),
        };
      });
    const vencidas = lines.filter((l) => l.overdue);
    const aVencer = lines.filter((l) => !l.overdue);
    const vencidasTotal = vencidas.reduce((s, l) => s + l.amount, 0);
    const aVencerTotal = aVencer.reduce((s, l) => s + l.amount, 0);
    return {
      vencidasGroups: groupDefaultLines(vencidas),
      aVencerGroups: groupDefaultLines(aVencer),
      vencidasTotal,
      aVencerTotal,
      total: vencidasTotal + aVencerTotal,
    };
  }, [payables, period, today, locale, t, tCat]);

  if (blocked) return <AccessDenied category={tNav("items.dashboard")} />;

  if (loading) return <PageLoader />;

  const cashflowFailed = srcState.cashflow === "error";

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--db-bg)" }}>


      {/* Senha primeiro, ramo do negócio depois — nunca os dois sobrepostos */}
      <CreatePasswordGate
        open={needsPasswordSetup}
        email={user?.email ?? null}
        suggestedName={user?.displayName ?? null}
        onComplete={() => setNeedsPasswordSetup(false)}
      />

      <OnboardingModal
        open={showOnboarding && !needsPasswordSetup}
        onClose={() => setShowOnboarding(false)}
        onComplete={async (answers: OnboardingAnswers) => {
          if (!user) return;
          try {
            const { getFirebase } = await import("@/lib/firebase");
            const { doc, setDoc } = await import("firebase/firestore");
            const { db } = await getFirebase();
            await setDoc(doc(db, "users", user.uid, "profile", "onboarding"), {
              completed: true,
              answers,
              completedAt: Date.now(),
            });
            if (typeof window !== "undefined") {
              localStorage.setItem(`onboarding_ramo_${user.uid}`, JSON.stringify(answers.ramo || []));
            }
          } catch (err) {
            console.error("Erro ao salvar onboarding:", err);
          }
        }}
      />

      <Navbar
        user={user}
        activePath={activePath}
        onLogout={handleLogout}
      />

      {/* Detalhamento da Inadimplência — mesmo padrão do modal do KPI
          "Orçamento" no Fluxo de Caixa (CashFlow.tsx). */}
      <Modal open={defaultModalOpen} onClose={() => setDefaultModalOpen(false)} size="md" mobileSheet>
        <div style={{ maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
          <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: "1px solid var(--db-border)" }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--warn-weak)" }}>
                <AlertCircle size={16} style={{ color: "var(--warn)" }} />
              </div>
              <div className="min-w-0">
                <p className="font-heading text-base font-bold truncate" style={{ color: "var(--db-text)" }}>{t("defaultModal.title")}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--db-text-2)" }}>
                  {t("defaultModal.subtitle")} · {t("defaultModal.rate", { pct: defaultRate.rate.toFixed(1) })}
                </p>
              </div>
            </div>
            <button onClick={() => setDefaultModalOpen(false)} aria-label={t("defaultModal.close")} className="p-1.5 rounded-lg cursor-pointer shrink-0"
              style={{ background: "var(--db-bg-alt)", color: "var(--db-text-2)" }}>
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {defaultDetalhe.total === 0 ? (
              <p className="text-sm text-center py-10" style={{ color: "var(--db-text-2)" }}>
                {t("defaultModal.empty")}
              </p>
            ) : (
              <>
                {defaultDetalhe.vencidasGroups.length > 0 && (
                  <DefaultSection
                    title={t("defaultModal.overdueSection")}
                    hint={t("defaultModal.overdueHint")}
                    total={defaultDetalhe.vencidasTotal}
                    color="var(--neg)"
                    hideValues={hideValues}
                  >
                    {defaultDetalhe.vencidasGroups.map(g => <DefaultCategoryBlock key={g.origin} group={g} hideValues={hideValues} />)}
                  </DefaultSection>
                )}

                {defaultDetalhe.aVencerGroups.length > 0 && (
                  <DefaultSection
                    title={t("defaultModal.openSection")}
                    hint={t("defaultModal.openHint")}
                    total={defaultDetalhe.aVencerTotal}
                    color="var(--warn)"
                    hideValues={hideValues}
                  >
                    {defaultDetalhe.aVencerGroups.map(g => <DefaultCategoryBlock key={g.origin} group={g} hideValues={hideValues} />)}
                  </DefaultSection>
                )}
              </>
            )}
          </div>
          <div className="px-5 py-4 shrink-0 flex items-center justify-between" style={{ borderTop: "1px solid var(--db-border)" }}>
            <span className="text-sm font-semibold" style={{ color: "var(--db-text-2)" }}>{t("defaultModal.total")}</span>
            <span className="font-heading text-lg font-bold mono" style={{ color: "var(--warn)" }}>
              <Sensitive hidden={hideValues}>{toBRL(defaultDetalhe.total)}</Sensitive>
            </span>
          </div>
        </div>
      </Modal>

      <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 overflow-auto pb-20 lg:pb-8">

        {/* ── Cabeçalho que só aparece na impressão / PDF ── */}
        <div className="print-only" style={{ marginBottom: 20, borderBottom: "2px solid var(--text)", paddingBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div>
              <p style={{ fontSize: 20, fontWeight: 800, color: "var(--text)" }}>{t("printReportTitle", { period: periodLabel })}</p>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{user?.displayName || user?.email || ""}</p>
            </div>
            {printedAt && <p style={{ fontSize: 11, color: "var(--text-subtle)", whiteSpace: "nowrap" }}>{t("generatedAt", { datetime: printedAt })}</p>}
          </div>
        </div>

        {/* ── Cabeçalho e filtros — cada período mostra o seu próprio resultado ── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-base md:text-lg font-extrabold leading-tight" style={{ color: "var(--db-text)" }}>
              {t("resultOf", { period: periodLabel })}
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--db-text-2)" }}>
              {t("resultSubtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 no-print flex-wrap">
            <div className="flex rounded-lg p-1" style={{ background: "var(--cf-input)" }}>
              {([{ id: "mes" as const, label: t("period.monthly") }, { id: "ano" as const, label: t("period.annual") }]).map(p => (
                <button
                  key={p.id}
                  onClick={() => setFilterPeriod(p.id)}
                  aria-pressed={filterPeriod === p.id}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer"
                  style={filterPeriod === p.id
                    ? { background: "var(--db-card)", color: "var(--primary)", boxShadow: "var(--db-shadow-sm)" }
                    : { background: "transparent", color: "var(--db-text-2)" }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center rounded-xl border overflow-hidden" style={{ borderColor: "var(--db-border)", background: "var(--db-card)" }}>
              <button
                onClick={goPrevPeriod}
                aria-label={t("prevMonth")}
                className="p-2 transition-colors hover:bg-[var(--sunken)] cursor-pointer"
                style={{ color: "var(--brand)" }}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 text-xs font-bold mono select-none" style={{ color: "var(--db-text)" }}>{periodLabel}</span>
              <button
                onClick={goNextPeriod}
                disabled={isCurrentPeriod}
                aria-label={t("nextMonth")}
                className="p-2 transition-colors hover:bg-[var(--sunken)] cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ color: "var(--brand)" }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <button
              onClick={() => setHideValues((v) => !v)}
              aria-pressed={hideValues}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors hover:bg-[var(--sunken)] cursor-pointer"
              style={{ borderColor: "var(--db-border)", color: "var(--brand)", background: "var(--db-card)" }}
            >
              {hideValues ? <EyeOff size={14} /> : <Eye size={14} />}
              <span className="hidden sm:inline">{hideValues ? t("controls.showValues") : t("controls.hideValues")}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors hover:bg-[var(--sunken)] cursor-pointer"
              style={{ borderColor: "var(--db-border)", color: "var(--brand)", background: "var(--db-card)" }}
              title={t("printReportTooltip")}
            >
              <Printer size={14} />
              <span className="hidden sm:inline">{t("printReport")}</span>
            </button>
          </div>
        </div>

        {cashflowFailed ? (
          <div className="dash-card p-6 space-y-3">
            <SectionStatus state="error" what={t("states.cashflow")} />
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer"
              style={{ borderColor: "var(--db-border)", color: "var(--brand)", background: "var(--db-card)" }}
            >
              <RefreshCw size={13} /> {t("states.retry")}
            </button>
          </div>
        ) : (
          <>
            <SummaryCards
              overview={overview}
              due={due}
              budget={budget}
              alerts={alerts}
              hide={hideValues}
              isAnnual={isAnnual}
              periodLabel={periodLabel}
              periodEnded={periodEnded}
              state={{ receivables: receivablesState, payables: payablesState, budget: budgetState }}
              onOpenDefault={() => setDefaultModalOpen(true)}
            />

            <EvolutionCharts columns={columns} evolution={evolution} isAnnual={isAnnual} periodLabel={periodLabel} hide={hideValues} />

            <BudgetForecast
              budget={budget}
              projection={projection}
              today={today}
              hide={hideValues}
              periodLabel={periodLabel}
              budgetState={budgetState}
              projectionState={projectionState}
              canSeeCenters={srcState.costCenters !== "off"}
            />

            <DueSection due={due} hide={hideValues} payablesState={payablesState} receivablesState={receivablesState} />

            <CostCenterSection data={centers} hide={hideValues} periodLabel={periodLabel} state={centersState} />

            <AlertCenter alerts={alerts} hide={hideValues} periodLabel={periodLabel} marginTargetPct={DEFAULT_ALERT_THRESHOLDS.marginTargetPct} />
          </>
        )}

      </main>
    </div>
  );
}
