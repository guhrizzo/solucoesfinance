"use client";

import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, DollarSign, Landmark,
  FileText, Search, RefreshCw, ShieldCheck, Download,
  Lock, Unlock, ArrowUpRight, ArrowDownRight, Eye, EyeOff, Calculator, BarChart3, Activity
} from "lucide-react";
import Navbar from "../components/Navbar";
import AccessDenied from "../components/AccessDenied";
import { PageLoader } from "../components/ui";
import type { ReportData } from "@/lib/reportPdf";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type TxType = "entrada" | "saida";

interface Tx {
  id: string;
  type: TxType;
  description: string;
  category: string;
  amount: number;
  date: string;
  note: string;
  createdAt: number;
  reconciled?: boolean;
}

// Helper para formatação
const toBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function RelatoriosPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  // true quando o usuário logado é um membro de equipe sem "Relatórios"
  // liberado — ver lib/accountScope.ts.
  const [blocked, setBlocked] = useState(false);

  // ── Logout ─────────────────────────────────────────────────────────────────
  async function handleLogout() {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  // Período gerencial/contábil, uniforme em todas as abas — só Mensal ou
  // Anual (recortes operacionais como 7D/30D saíram junto com o antigo
  // seletor; ver histórico de commits pra essa transição).
  const [filterPeriod, setFilterPeriod] = useState<"mes" | "ano">("mes");
  const [searchQuery, setSearchQuery] = useState("");
  const [hideValues, setHideValues] = useState(false);

  type TabType = "fluxo" | "faturamento" | "dre" | "precificacao";
  const [activeTab, setActiveTab] = useState<TabType>("fluxo");

  // Estados de Precificação
  const [precCusto, setPrecCusto] = useState<number | "">("");
  const [precImposto, setPrecImposto] = useState<number | "">("");
  const [precMargem, setPrecMargem] = useState<number | "">("");

  // Fechamento de caixa: qual período está sendo conferido/reaberto agora
  const [closingBusy, setClosingBusy] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Inicialização e Auth
  useEffect(() => {
    let snapUnsub: (() => void) | undefined;
    let authUnsub: (() => void) | undefined;

    (async () => {
      try {
        const [{ getFirebase }, { onAuthStateChanged }, { collection, query, orderBy, onSnapshot }] = await Promise.all([
          import("@/lib/firebase"),
          import("firebase/auth"),
          import("firebase/firestore"),
        ]);

        const { auth, db } = await getFirebase();
        authUnsub = onAuthStateChanged(auth, async (u) => {
          if (!u) {
            window.location.href = "/login";
            return;
          }

          // Resolve de quem são os dados que este login deve ver: o próprio
          // uid (dono) ou o do dono da conta (membro convidado) — ver
          // lib/accountScope.ts. Membro sem "relatorios" liberado nem chega
          // a assinar as transações abaixo.
          const { resolveAccountScope, hasPermission } = await import("@/lib/accountScope");
          const scope = await resolveAccountScope(db, u.uid);
          if (!hasPermission(scope, "relatorios")) {
            setBlocked(true);
            setLoading(false);
            return;
          }
          const ownerUid = scope.ownerUid;

          setUid(ownerUid);
          setUser(u);

          // Buscar transações de fluxo de caixa
          const q = query(collection(db, "users", ownerUid, "cashflow"), orderBy("date", "desc"));
          snapUnsub = onSnapshot(q, (snap) => {
            setTxs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tx)));
            setLoading(false);
          }, (err) => {
            console.error("Erro ao carregar transações:", err);
            setLoading(false);
          });
        });
      } catch (e) {
        console.error("Erro ao inicializar Firebase:", e);
        setLoading(false);
      }
    })();

    return () => {
      authUnsub?.();
      snapUnsub?.();
    };
  }, []);

  // Filtragem das transações por período
  const filteredTxs = useMemo(() => {
    const now = new Date();
    return txs.filter(tx => {
      // Filtro de Busca
      if (searchQuery && !tx.description.toLowerCase().includes(searchQuery.toLowerCase()) && !tx.category.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Filtro de Data
      const txDate = new Date(tx.date + "T12:00:00");
      if (filterPeriod === "mes") {
        return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
      }
      return txDate.getFullYear() === now.getFullYear(); // "ano"
    });
  }, [txs, filterPeriod, searchQuery]);

  // Cálculos financeiros com base no filtro
  const metrics = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    let conciliadas = 0;

    filteredTxs.forEach(tx => {
      if (tx.type === "entrada") entradas += tx.amount;
      else if (tx.type === "saida") saidas += tx.amount;
      if (tx.reconciled) conciliadas++;
    });

    const saldo = entradas - saidas;
    const taxaConciliacao = filteredTxs.length > 0 ? (conciliadas / filteredTxs.length) * 100 : 0;

    return { entradas, saidas, saldo, taxaConciliacao, total: filteredTxs.length };
  }, [filteredTxs]);

  // Cálculos do DRE
  const dreData = useMemo(() => {
    let receita = 0;
    let impostos = 0;
    let cmv = 0;
    let despesas = 0;

    filteredTxs.forEach(tx => {
      const catLower = tx.category.toLowerCase();
      if (tx.type === "entrada") {
        receita += tx.amount;
      } else {
        if (catLower.includes("imposto") || catLower.includes("taxa") || catLower.includes("tributo")) {
          impostos += tx.amount;
        } else if (catLower.includes("fornecedor") || catLower.includes("produto") || catLower.includes("mercadoria") || catLower.includes("compra")) {
          cmv += tx.amount;
        } else {
          despesas += tx.amount;
        }
      }
    });

    const receitaLiquida = receita - impostos;
    const lucroBruto = receitaLiquida - cmv;
    const lucroLiquido = lucroBruto - despesas;
    const margemLiquida = receita > 0 ? (lucroLiquido / receita) * 100 : 0;

    return { receita, impostos, receitaLiquida, cmv, lucroBruto, despesas, lucroLiquido, margemLiquida };
  }, [filteredTxs]);

  // Cálculos de Precificação (Markup)
  const precSugestao = useMemo(() => {
    const c = Number(precCusto) || 0;
    const i = Number(precImposto) || 0;
    const m = Number(precMargem) || 0;

    if (c === 0) return 0;
    const deducoes = (i + m) / 100;
    if (deducoes >= 1) return -1; // Inviável

    return c / (1 - deducoes);
  }, [precCusto, precImposto, precMargem]);

  // Categorias de Entrada e Saída agrupadas
  const categoryBreakdown = useMemo(() => {
    const breakdown: Record<string, { total: number; type: TxType }> = {};
    filteredTxs.forEach(tx => {
      if (!breakdown[tx.category]) {
        breakdown[tx.category] = { total: 0, type: tx.type };
      }
      breakdown[tx.category].total += tx.amount;
    });

    return Object.entries(breakdown)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [filteredTxs]);

  // Demonstrativo de Faturamento (aba Faturamento) — formato gerencial e
  // contábil no estilo de uma Declaração de Faturamento: agrupa as entradas
  // do fluxo de caixa por mês (visão "Anual", ano corrente) ou por dia
  // (visão "Mensal", mês corrente), com total e média do período.
  const faturamentoLedger = useMemo(() => {
    const now = new Date();

    if (filterPeriod === "ano") {
      const byMonth = MONTH_LABELS.map((label, i) => ({ label, total: 0, key: i }));
      filteredTxs.forEach(tx => {
        if (tx.type !== "entrada") return;
        const m = Number(tx.date.split("-")[1]) - 1;
        if (byMonth[m]) byMonth[m].total += tx.amount;
      });
      const elapsedMonths = now.getMonth() + 1; // meses decorridos no ano corrente até hoje
      const total = byMonth.reduce((s, m) => s + m.total, 0);
      const average = total / elapsedMonths;
      const remainingUnits = 12 - elapsedMonths;
      return {
        granularity: "mes" as const,
        periodLabel: `Ano de ${now.getFullYear()}`,
        rows: byMonth.map(m => ({ label: `${m.label}/${now.getFullYear()}`, total: m.total })),
        total,
        countLabel: `${elapsedMonths} ${elapsedMonths === 1 ? "mês" : "meses"} decorridos`,
        average,
        projection: {
          remainingUnits,
          remainingLabel: `${remainingUnits} ${remainingUnits === 1 ? "mês restante" : "meses restantes"} do ano`,
          projectedRemaining: average * remainingUnits,
          projectedTotal: total + average * remainingUnits,
        },
      };
    }

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const byDay = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, total: 0 }));
    filteredTxs.forEach(tx => {
      if (tx.type !== "entrada") return;
      const d = Number(tx.date.split("-")[2]);
      if (byDay[d - 1]) byDay[d - 1].total += tx.amount;
    });
    const elapsedDays = now.getDate(); // dias decorridos no mês corrente até hoje
    const total = byDay.reduce((s, d) => s + d.total, 0);
    const average = total / elapsedDays;
    const remainingUnits = daysInMonth - elapsedDays;
    return {
      granularity: "dia" as const,
      periodLabel: `${MONTH_LABELS[now.getMonth()]} de ${now.getFullYear()}`,
      rows: byDay.filter(d => d.total > 0).map(d => ({ label: `${String(d.day).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`, total: d.total })),
      total,
      countLabel: `${elapsedDays} ${elapsedDays === 1 ? "dia decorrido" : "dias decorridos"}`,
      average,
      projection: {
        remainingUnits,
        remainingLabel: `${remainingUnits} ${remainingUnits === 1 ? "dia restante" : "dias restantes"} no mês`,
        projectedRemaining: average * remainingUnits,
        projectedTotal: total + average * remainingUnits,
      },
    };
  }, [filteredTxs, filterPeriod]);

  // Rótulo do período gerencial selecionado (para cabeçalhos e PDF).
  const periodLabel = useMemo(() => {
    const now = new Date();
    const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return filterPeriod === "ano"
      ? `Ano de ${now.getFullYear()}`
      : `${meses[now.getMonth()]} de ${now.getFullYear()}`;
  }, [filterPeriod]);

  // ── Fechamento de Caixa por Período ──────────────────────────────────────────
  // Modelo financeiro de conferência: os lançamentos do período são agrupados
  // por dia (visão Mensal) ou por mês (visão Anual). O usuário fecha cada
  // período um a um — "Marcar como conferido" grava reconciled=true em todos os
  // lançamentos daquele dia/mês; "Reabrir" desfaz. Um período conta como
  // conferido quando todos os seus lançamentos estão conciliados.
  const periodClosings = useMemo(() => {
    const map = new Map<string, { label: string; ids: string[]; count: number; entradas: number; saidas: number; reconciledCount: number }>();

    filteredTxs.forEach(tx => {
      const key = filterPeriod === "ano" ? tx.date.slice(0, 7) : tx.date;
      const label = filterPeriod === "ano"
        ? `${MONTH_LABELS[Number(tx.date.slice(5, 7)) - 1]}/${tx.date.slice(0, 4)}`
        : `${tx.date.slice(8, 10)}/${tx.date.slice(5, 7)}`;
      const g = map.get(key) ?? { label, ids: [], count: 0, entradas: 0, saidas: 0, reconciledCount: 0 };
      g.ids.push(tx.id);
      g.count++;
      if (tx.type === "entrada") g.entradas += tx.amount;
      else g.saidas += tx.amount;
      if (tx.reconciled) g.reconciledCount++;
      map.set(key, g);
    });

    const rows = [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, g]) => ({
        key,
        label: g.label,
        ids: g.ids,
        count: g.count,
        entradas: g.entradas,
        saidas: g.saidas,
        saldo: g.entradas - g.saidas,
        done: g.count > 0 && g.reconciledCount === g.count,
      }));

    const doneCount = rows.filter(r => r.done).length;
    return { rows, doneCount, total: rows.length };
  }, [filteredTxs, filterPeriod]);

  // Fecha ou reabre um período — grava em lote em todos os lançamentos dele.
  const handleToggleClosing = async (row: { key: string; ids: string[]; done: boolean }) => {
    if (!uid || closingBusy) return;
    setClosingBusy(row.key);
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { doc, writeBatch } = await import("firebase/firestore");
      const { db } = await getFirebase();
      const batch = writeBatch(db);
      const next = !row.done;
      row.ids.forEach(id => {
        batch.update(doc(db, "users", uid, "cashflow", id), {
          reconciled: next,
          reconciledAt: next ? Date.now() : null,
        });
      });
      await batch.commit();
    } catch (err) {
      console.error("Erro ao fechar período:", err);
    } finally {
      setClosingBusy(null);
    }
  };

  // Exporta a aba ativa em PDF.
  const handleExportPdf = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { exportReportPdf } = await import("@/lib/reportPdf");
      const base = {
        tab: activeTab,
        periodLabel,
        generatedAt: new Date(),
        userLabel: user?.email ?? undefined,
      };
      let payload: ReportData;
      if (activeTab === "fluxo") {
        payload = {
          ...base,
          metrics,
          closings: periodClosings.rows.map(r => ({
            label: r.label, count: r.count, entradas: r.entradas, saidas: r.saidas, saldo: r.saldo, done: r.done,
          })),
          txs: filteredTxs.map(t => ({
            date: t.date, description: t.description, category: t.category, type: t.type, amount: t.amount, reconciled: t.reconciled,
          })),
        };
      } else if (activeTab === "faturamento") {
        payload = {
          ...base,
          faturamento: {
            granularity: faturamentoLedger.granularity,
            rows: faturamentoLedger.rows,
            total: faturamentoLedger.total,
            average: faturamentoLedger.average,
            countLabel: faturamentoLedger.countLabel,
            ticketMedio: dreData.receita / (filteredTxs.filter(t => t.type === "entrada").length || 1),
            projection: faturamentoLedger.projection.remainingUnits > 0 ? {
              remainingLabel: faturamentoLedger.projection.remainingLabel,
              projectedRemaining: faturamentoLedger.projection.projectedRemaining,
              projectedTotal: faturamentoLedger.projection.projectedTotal,
            } : undefined,
          },
        };
      } else if (activeTab === "dre") {
        payload = { ...base, dre: dreData };
      } else {
        payload = {
          ...base,
          prec: {
            custo: Number(precCusto) || 0,
            imposto: Number(precImposto) || 0,
            margem: Number(precMargem) || 0,
            sugestao: precSugestao,
          },
        };
      }
      await exportReportPdf(payload);
    } catch (err) {
      console.error("Erro ao exportar PDF:", err);
    } finally {
      setExporting(false);
    }
  };

  // Renderização do gráfico SVG de colunas
  const svgChartData = useMemo(() => {
    // Agrupar por data dos últimos 7 dias para desenhar gráfico simples
    const days: Record<string, { entrada: number; saida: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateString = d.toISOString().split("T")[0];
      days[dateString] = { entrada: 0, saida: 0 };
    }

    filteredTxs.forEach(tx => {
      if (days[tx.date]) {
        if (tx.type === "entrada") days[tx.date].entrada += tx.amount;
        else days[tx.date].saida += tx.amount;
      }
    });

    return Object.entries(days).map(([date, val]) => ({
      label: date.split("-")[2] + "/" + date.split("-")[1],
      ...val
    }));
  }, [filteredTxs]);

  if (blocked) return <AccessDenied category="Relatórios" />;

  if (loading) return <PageLoader />;

  return (
    <>
      <Navbar activePath="/relatorios" user={user} onLogout={handleLogout} hidePeriod />
      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 pb-24">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-extrabold" style={{ color: "var(--db-text)" }}>
              Relatórios & Conciliação
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--db-text-2)" }}>
              Monitore a saúde do seu fluxo de caixa e feche cada período conferindo os lançamentos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg p-1" style={{ background: "var(--cf-input)" }}>
              {[{ id: "mes", label: "Mensal" }, { id: "ano", label: "Anual" }].map(p => (
                <button
                  key={p.id}
                  onClick={() => setFilterPeriod(p.id as any)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer"
                  style={filterPeriod === p.id 
                    ? { background: "var(--db-card)", color: "var(--primary)", boxShadow: "var(--db-shadow-sm)" }
                    : { background: "transparent", color: "var(--db-text-2)" }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setHideValues(!hideValues)}
              className="p-2.5 rounded-lg border cursor-pointer hover:bg-opacity-80 transition-colors"
              style={{ borderColor: "var(--db-border)", background: "var(--db-card)", color: "var(--db-text-2)" }}
              title={hideValues ? "Mostrar valores" : "Ocultar valores"}
            >
              {hideValues ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>

            <button
              onClick={handleExportPdf}
              disabled={exporting}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold cursor-pointer transition-colors disabled:opacity-60"
              style={{ background: "var(--primary)", color: "#fff" }}
              title="Exportar a aba ativa em PDF"
            >
              {exporting ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
              Exportar PDF
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b scrollbar-hide" style={{ borderColor: "var(--db-border)" }}>
          {[
            { id: "fluxo", label: "Fluxo de Caixa", icon: Activity },
            { id: "faturamento", label: "Faturamento", icon: BarChart3 },
            { id: "dre", label: "DRE", icon: FileText },
            { id: "precificacao", label: "Precificação", icon: Calculator },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer"
              style={{
                color: activeTab === tab.id ? "var(--primary)" : "var(--db-text-2)",
                borderColor: activeTab === tab.id ? "var(--primary)" : "transparent",
              }}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Aba: Fluxo de Caixa */}
        {activeTab === "fluxo" && (
          <div className="space-y-6 fade-in">
            {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card Entradas */}
          <div className="cf-card p-5 space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Total Entradas</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight size={16} />
              </div>
            </div>
            <p className="text-2xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
              {hideValues ? "••••••" : toBRL(metrics.entradas)}
            </p>
            <p className="text-xs" style={{ color: "var(--db-text-3)" }}>Recebimentos no período</p>
          </div>

          {/* Card Saídas */}
          <div className="cf-card p-5 space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Total Saídas</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                <ArrowDownRight size={16} />
              </div>
            </div>
            <p className="text-2xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
              {hideValues ? "••••••" : toBRL(metrics.saidas)}
            </p>
            <p className="text-xs" style={{ color: "var(--db-text-3)" }}>Pagamentos e despesas</p>
          </div>

          {/* Card Saldo Líquido */}
          <div className="cf-card p-5 space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Saldo Líquido</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                <DollarSign size={16} />
              </div>
            </div>
            <p className="text-2xl font-extrabold mono" style={{ color: metrics.saldo >= 0 ? "var(--success)" : "var(--danger)" }}>
              {hideValues ? "••••••" : toBRL(metrics.saldo)}
            </p>
            <p className="text-xs" style={{ color: "var(--db-text-3)" }}>Resultado operacional</p>
          </div>

          {/* Card Conciliação */}
          <div className="cf-card p-5 space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Caixa Conferido</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                <ShieldCheck size={16} />
              </div>
            </div>
            <p className="text-2xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
              {metrics.taxaConciliacao.toFixed(0)}%
            </p>
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-600 h-full transition-all duration-500" style={{ width: `${metrics.taxaConciliacao}%` }} />
            </div>
          </div>
        </div>

        {/* Gráfico SVG e Categorias */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Gráfico de Barras */}
          <div className="cf-card p-5 lg:col-span-2 space-y-4">
            <div>
              <h3 className="font-heading text-sm font-bold" style={{ color: "var(--db-text)" }}>Histórico de Fluxo Diário</h3>
              <p className="text-xs" style={{ color: "var(--db-text-2)" }}>Entradas vs Saídas nos últimos dias ativos</p>
            </div>
            
            {/* SVG Plot */}
            <div className="h-64 w-full flex items-end justify-between pt-6 px-4 relative">
              <div className="absolute inset-x-0 top-1/2 border-t border-dashed" style={{ borderColor: "var(--db-border)" }} />
              {svgChartData.map((data, i) => {
                const max = Math.max(...svgChartData.map(d => Math.max(d.entrada, d.saida))) || 1;
                const entHeight = (data.entrada / max) * 160;
                const saiHeight = (data.saida / max) * 160;
                return (
                  <div key={i} className="flex flex-col items-center gap-2 flex-1 group">
                    <div className="flex items-end gap-1.5 h-44">
                      {/* Entrada Bar */}
                      <div className="w-2.5 sm:w-3.5 bg-emerald-500 rounded-t-md transition-all duration-300 relative" style={{ height: `${Math.max(entHeight, 4)}px` }}>
                        <span className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded text-white bg-slate-900 pointer-events-none transition-opacity whitespace-nowrap z-30">
                          +{toBRL(data.entrada)}
                        </span>
                      </div>
                      {/* Saida Bar */}
                      <div className="w-2.5 sm:w-3.5 bg-rose-500 rounded-t-md transition-all duration-300 relative" style={{ height: `${Math.max(saiHeight, 4)}px` }}>
                        <span className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded text-white bg-slate-900 pointer-events-none transition-opacity whitespace-nowrap z-30">
                          -{toBRL(data.saida)}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: "var(--db-text-2)" }}>{data.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Distribuição por Categoria */}
          <div className="cf-card p-5 space-y-4">
            <div>
              <h3 className="font-heading text-sm font-bold" style={{ color: "var(--db-text)" }}>Gastos e Receitas por Categoria</h3>
              <p className="text-xs" style={{ color: "var(--db-text-2)" }}>Maiores agrupamentos do período</p>
            </div>

            <div className="space-y-4 max-h-[260px] overflow-y-auto pr-1">
              {categoryBreakdown.length === 0 ? (
                <div className="text-center py-10" style={{ color: "var(--db-text-3)" }}>
                  Nenhuma transação no período.
                </div>
              ) : (
                categoryBreakdown.map((cat, i) => {
                  const maxAmt = Math.max(...categoryBreakdown.map(c => c.total)) || 1;
                  const pct = (cat.total / maxAmt) * 100;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span style={{ color: "var(--db-text)" }}>{cat.name}</span>
                        <span style={{ color: cat.type === "entrada" ? "var(--success)" : "var(--danger)" }}>
                          {hideValues ? "•••" : toBRL(cat.total)}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500" 
                          style={{ 
                            width: `${pct}%`, 
                            background: cat.type === "entrada" ? "var(--success)" : "var(--danger)" 
                          }} 
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Fechamento de Caixa por Período */}
        <div className="cf-card p-6 space-y-5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Landmark className="text-primary" size={20} />
                <h2 className="font-heading text-lg font-bold" style={{ color: "var(--db-text)" }}>
                  Fechamento de Caixa por {filterPeriod === "ano" ? "Mês" : "Dia"}
                </h2>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--db-text-2)" }}>
                Confira os lançamentos do fluxo de caixa {filterPeriod === "ano" ? "mês a mês" : "dia a dia"} e feche cada período — {periodLabel}.
              </p>
            </div>

            <div className="text-right shrink-0">
              <p className="text-2xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
                {periodClosings.doneCount}/{periodClosings.total}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>
                Períodos conferidos
              </p>
            </div>
          </div>

          {periodClosings.total > 0 && (
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-600 h-full transition-all duration-500"
                style={{ width: `${(periodClosings.doneCount / periodClosings.total) * 100}%` }} />
            </div>
          )}

          {periodClosings.rows.length === 0 ? (
            <div className="border border-dashed rounded-2xl p-10 text-center space-y-3" style={{ borderColor: "var(--db-border)" }}>
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <Landmark size={22} />
              </div>
              <h4 className="font-bold text-sm" style={{ color: "var(--db-text)" }}>Nenhum lançamento no período</h4>
              <p className="text-xs max-w-sm mx-auto" style={{ color: "var(--db-text-2)" }}>
                Assim que houver lançamentos no fluxo de caixa em {periodLabel}, eles aparecem aqui agrupados para conferência.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--db-border)", color: "var(--db-text-2)" }}>
                    <th className="py-2.5 font-bold">{filterPeriod === "ano" ? "Mês" : "Dia"}</th>
                    <th className="py-2.5 font-bold text-center">Lançtos</th>
                    <th className="py-2.5 font-bold text-right">Entradas</th>
                    <th className="py-2.5 font-bold text-right">Saídas</th>
                    <th className="py-2.5 font-bold text-right">Saldo</th>
                    <th className="py-2.5 font-bold text-center">Status</th>
                    <th className="py-2.5 font-bold text-right">Ação</th>
                  </tr>
                </thead>
                <tbody style={{ color: "var(--db-text)" }}>
                  {periodClosings.rows.map((row) => (
                    <tr key={row.key} className="border-b" style={{ borderColor: "var(--db-border)" }}>
                      <td className="py-3 font-semibold">{row.label}</td>
                      <td className="py-3 text-center">{row.count}</td>
                      <td className="py-3 text-right font-mono text-emerald-500">
                        {hideValues ? "•••" : toBRL(row.entradas)}
                      </td>
                      <td className="py-3 text-right font-mono text-rose-500">
                        {hideValues ? "•••" : toBRL(row.saidas)}
                      </td>
                      <td className="py-3 text-right font-mono font-bold" style={{ color: row.saldo >= 0 ? "var(--success)" : "var(--danger)" }}>
                        {hideValues ? "•••" : toBRL(row.saldo)}
                      </td>
                      <td className="py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          row.done
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                        }`}>
                          {row.done ? "Conferido" : "Pendente"}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleToggleClosing(row)}
                          disabled={closingBusy === row.key}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-colors disabled:opacity-60"
                          style={row.done
                            ? { background: "var(--cf-input)", color: "var(--db-text-2)" }
                            : { background: "var(--success)", color: "#fff" }}
                        >
                          {closingBusy === row.key
                            ? <RefreshCw size={11} className="animate-spin" />
                            : row.done ? <><Unlock size={11} /> Reabrir</> : <><Lock size={11} /> Conferir</>}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Transações Recentes Filtradas */}
        <div className="cf-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-heading text-sm font-bold" style={{ color: "var(--db-text)" }}>Lançamentos Filtrados</h3>
              <p className="text-xs" style={{ color: "var(--db-text-2)" }}>Visualizando {filteredTxs.length} transações no período</p>
            </div>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input
                type="text"
                placeholder="Buscar por nome ou categoria..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 pl-8 pr-4 py-1.5 rounded-lg text-xs outline-none transition-colors border"
                style={{ background: "var(--cf-input)", borderColor: "var(--db-border)", color: "var(--db-text)" }}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--db-border)", color: "var(--db-text-2)" }}>
                  <th className="py-2.5 font-bold">Data</th>
                  <th className="py-2.5 font-bold">Descrição</th>
                  <th className="py-2.5 font-bold">Categoria</th>
                  <th className="py-2.5 font-bold">Status</th>
                  <th className="py-2.5 font-bold text-right">Valor</th>
                </tr>
              </thead>
              <tbody style={{ color: "var(--db-text)" }}>
                {filteredTxs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center" style={{ color: "var(--db-text-3)" }}>
                      Nenhum lançamento corresponde ao filtro.
                    </td>
                  </tr>
                ) : (
                  filteredTxs.map((tx) => (
                    <tr key={tx.id} className="border-b transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40" style={{ borderColor: "var(--db-border)" }}>
                      <td className="py-3 font-semibold">{tx.date.split("-")[2]}/{tx.date.split("-")[1]}</td>
                      <td className="py-3 font-semibold max-w-[200px] truncate">{tx.description}</td>
                      <td className="py-3">{tx.category}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          tx.reconciled 
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                        }`}>
                          {tx.reconciled ? "Conciliado" : "Não Conciliado"}
                        </span>
                      </td>
                      <td className={`py-3 text-right font-mono font-bold ${tx.type === "entrada" ? "text-emerald-500" : "text-rose-500"}`}>
                        {tx.type === "entrada" ? "+" : "-"}{hideValues ? "•••" : toBRL(tx.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

          </div>
        )}

        {/* Aba: Faturamento */}
        {activeTab === "faturamento" && (
          <div className="space-y-6 fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="cf-card p-6 flex flex-col items-center justify-center text-center space-y-2">
                <BarChart3 className="text-primary mb-2" size={32} />
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>
                  Receita Bruta {filterPeriod === "ano" ? "Anual" : "do Mês"}
                </p>
                <p className="text-4xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
                  {hideValues ? "••••••" : toBRL(dreData.receita)}
                </p>
                <p className="text-xs" style={{ color: "var(--db-text-3)" }}>{faturamentoLedger.periodLabel}</p>
              </div>
              <div className="cf-card p-6 flex flex-col items-center justify-center text-center space-y-2">
                <Activity className="text-primary mb-2" size={32} />
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Ticket Médio Estimado</p>
                <p className="text-4xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
                  {hideValues ? "••••••" : toBRL(dreData.receita / (filteredTxs.filter(t => t.type === "entrada").length || 1))}
                </p>
              </div>
            </div>

            {/* Demonstrativo de Faturamento — formato gerencial/contábil,
                agrupado por mês (visão Anual) ou por dia (visão Mensal),
                sempre a partir das entradas do Fluxo de Caixa. */}
            <div className="cf-card p-6 sm:p-8">
              <div className="mb-6 flex items-center gap-3">
                <FileText className="text-primary" size={24} />
                <div>
                  <h2 className="font-heading text-xl font-bold" style={{ color: "var(--db-text)" }}>
                    Demonstrativo de Faturamento {filterPeriod === "ano" ? "— Mensal" : "— Diário"}
                  </h2>
                  <p className="text-xs" style={{ color: "var(--db-text-2)" }}>{faturamentoLedger.periodLabel} · Vinculado às entradas do Fluxo de Caixa</p>
                </div>
              </div>

              {faturamentoLedger.rows.length === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: "var(--db-text-3)" }}>Nenhum faturamento registrado no período.</p>
              ) : (
                <>
                  <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--db-border)" }}>
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50">
                          <th className="p-3 font-bold" style={{ color: "var(--db-text)" }}>
                            {faturamentoLedger.granularity === "mes" ? "Mês" : "Dia"}
                          </th>
                          <th className="p-3 font-bold text-right" style={{ color: "var(--db-text)" }}>Faturamento</th>
                        </tr>
                      </thead>
                      <tbody>
                        {faturamentoLedger.rows.map((row, i) => (
                          <tr key={i} className="border-t" style={{ borderColor: "var(--db-border)" }}>
                            <td className="p-3" style={{ color: "var(--db-text-2)" }}>{row.label}</td>
                            <td className="p-3 text-right font-mono font-semibold" style={{ color: "var(--db-text)" }}>
                              {hideValues ? "••••••" : toBRL(row.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 bg-slate-100 dark:bg-slate-900" style={{ borderColor: "var(--db-border)" }}>
                          <td className="p-3 font-extrabold uppercase tracking-wider text-xs" style={{ color: "var(--db-text)" }}>Total</td>
                          <td className="p-3 text-right font-mono font-extrabold" style={{ color: "var(--success)" }}>
                            {hideValues ? "••••••" : toBRL(faturamentoLedger.total)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-4 px-1">
                    <p className="text-xs font-semibold" style={{ color: "var(--db-text-2)" }}>{faturamentoLedger.countLabel}</p>
                    <p className="text-xs font-semibold" style={{ color: "var(--db-text-2)" }}>
                      Média de Faturamento: <span className="font-mono font-bold" style={{ color: "var(--db-text)" }}>{hideValues ? "••••••" : toBRL(faturamentoLedger.average)}</span>
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Projeção de Faturamento — estimativa linear a partir da média
                já observada no período, extrapolada pro que falta (resto do
                mês ou resto do ano). Borda tracejada marca visualmente que é
                estimativa, não fato realizado. */}
            {faturamentoLedger.rows.length > 0 && faturamentoLedger.projection.remainingUnits > 0 && (
              <div className="cf-card p-6 sm:p-8" style={{ border: "1px dashed var(--db-border)" }}>
                <div className="mb-5 flex items-center gap-3">
                  <TrendingUp className="text-primary" size={24} />
                  <div>
                    <h2 className="font-heading text-xl font-bold" style={{ color: "var(--db-text)" }}>Projeção de Faturamento</h2>
                    <p className="text-xs" style={{ color: "var(--db-text-2)" }}>
                      Estimativa pela média {faturamentoLedger.granularity === "mes" ? "mensal" : "diária"} observada · {faturamentoLedger.projection.remainingLabel}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Realizado até hoje</p>
                    <p className="text-xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
                      {hideValues ? "••••••" : toBRL(faturamentoLedger.total)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Projeção do restante</p>
                    <p className="text-xl font-extrabold mono" style={{ color: "var(--primary)" }}>
                      +{hideValues ? "••••••" : toBRL(faturamentoLedger.projection.projectedRemaining)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>
                      {faturamentoLedger.granularity === "mes" ? "Projeção do ano" : "Projeção do mês"}
                    </p>
                    <p className="text-xl font-extrabold mono" style={{ color: "var(--success)" }}>
                      {hideValues ? "••••••" : toBRL(faturamentoLedger.projection.projectedTotal)}
                    </p>
                  </div>
                </div>

                <p className="text-[10px] mt-5" style={{ color: "var(--db-text-3)" }}>
                  Estimativa linear a partir do ritmo de faturamento já registrado no período — não considera sazonalidade nem contratos futuros.
                </p>
              </div>
            )}

            <div className="cf-card p-6">
              <h3 className="font-heading text-lg font-bold mb-4" style={{ color: "var(--db-text)" }}>Maiores Fontes de Faturamento</h3>
              <div className="space-y-4">
                {categoryBreakdown.filter(c => c.type === "entrada").length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--db-text-3)" }}>Nenhum faturamento registrado no período.</p>
                ) : (
                  categoryBreakdown.filter(c => c.type === "entrada").map((cat, i) => {
                    const maxAmt = Math.max(...categoryBreakdown.filter(c => c.type === "entrada").map(c => c.total)) || 1;
                    const pct = (cat.total / maxAmt) * 100;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm font-semibold">
                          <span style={{ color: "var(--db-text)" }}>{cat.name}</span>
                          <span style={{ color: "var(--success)" }}>
                            {hideValues ? "•••" : toBRL(cat.total)}
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500 bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Aba: DRE */}
        {activeTab === "dre" && (
          <div className="space-y-6 fade-in">
            <div className="cf-card p-6 sm:p-8">
              <div className="mb-6 flex items-center gap-3">
                <FileText className="text-primary" size={24} />
                <div>
                  <h2 className="font-heading text-xl font-bold" style={{ color: "var(--db-text)" }}>
                    Demonstração do Resultado do Exercício
                  </h2>
                  <p className="text-xs" style={{ color: "var(--db-text-2)" }}>Visão simplificada baseada nas categorias de fluxo de caixa</p>
                </div>
              </div>

              <div className="space-y-0 rounded-xl overflow-hidden border" style={{ borderColor: "var(--db-border)" }}>
                {/* Linha Receita */}
                <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50">
                  <span className="font-bold text-sm" style={{ color: "var(--db-text)" }}>Receita Operacional Bruta</span>
                  <span className="font-mono font-bold" style={{ color: "var(--success)" }}>{hideValues ? "••••••" : toBRL(dreData.receita)}</span>
                </div>
                {/* Linha Impostos */}
                <div className="flex justify-between items-center p-4 border-t" style={{ borderColor: "var(--db-border)" }}>
                  <span className="text-sm" style={{ color: "var(--db-text-2)" }}>(-) Deduções e Impostos</span>
                  <span className="font-mono" style={{ color: "var(--danger)" }}>{hideValues ? "••••••" : `-${toBRL(dreData.impostos)}`}</span>
                </div>
                {/* Receita Líquida */}
                <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 border-t" style={{ borderColor: "var(--db-border)" }}>
                  <span className="font-bold text-sm" style={{ color: "var(--db-text)" }}>= Receita Operacional Líquida</span>
                  <span className="font-mono font-bold" style={{ color: "var(--db-text)" }}>{hideValues ? "••••••" : toBRL(dreData.receitaLiquida)}</span>
                </div>
                {/* CMV */}
                <div className="flex justify-between items-center p-4 border-t" style={{ borderColor: "var(--db-border)" }}>
                  <span className="text-sm" style={{ color: "var(--db-text-2)" }}>(-) Custo da Mercadoria Vendida (CMV)</span>
                  <span className="font-mono" style={{ color: "var(--danger)" }}>{hideValues ? "••••••" : `-${toBRL(dreData.cmv)}`}</span>
                </div>
                {/* Lucro Bruto */}
                <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 border-t" style={{ borderColor: "var(--db-border)" }}>
                  <span className="font-bold text-sm" style={{ color: "var(--db-text)" }}>= Lucro Bruto</span>
                  <span className="font-mono font-bold" style={{ color: "var(--db-text)" }}>{hideValues ? "••••••" : toBRL(dreData.lucroBruto)}</span>
                </div>
                {/* Despesas */}
                <div className="flex justify-between items-center p-4 border-t" style={{ borderColor: "var(--db-border)" }}>
                  <span className="text-sm" style={{ color: "var(--db-text-2)" }}>(-) Despesas Operacionais</span>
                  <span className="font-mono" style={{ color: "var(--danger)" }}>{hideValues ? "••••••" : `-${toBRL(dreData.despesas)}`}</span>
                </div>
                {/* Lucro Líquido */}
                <div className="flex justify-between items-center p-5 bg-slate-100 dark:bg-slate-900 border-t" style={{ borderColor: "var(--db-border)" }}>
                  <span className="font-extrabold text-base uppercase tracking-wider" style={{ color: "var(--db-text)" }}>= Lucro Líquido do Exercício</span>
                  <div className="text-right">
                    <span className="font-mono font-extrabold text-xl" style={{ color: dreData.lucroLiquido >= 0 ? "var(--success)" : "var(--danger)" }}>
                      {hideValues ? "••••••" : toBRL(dreData.lucroLiquido)}
                    </span>
                    <p className="text-[10px] font-bold mt-1" style={{ color: "var(--db-text-2)" }}>
                      Margem Líquida: {dreData.margemLiquida.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Aba: Precificação */}
        {activeTab === "precificacao" && (
          <div className="space-y-6 fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="cf-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Calculator className="text-primary" size={24} />
                  <h2 className="font-heading text-xl font-bold" style={{ color: "var(--db-text)" }}>
                    Calculadora de Precificação
                  </h2>
                </div>
                <p className="text-sm mb-6" style={{ color: "var(--db-text-2)" }}>
                  Descubra o preço de venda ideal com base no método Markup, garantindo que você atinja a margem de lucro desejada após o pagamento de impostos.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--db-text)" }}>Custo do Produto (R$)</label>
                    <input 
                      type="number" 
                      value={precCusto} 
                      onChange={(e) => setPrecCusto(Number(e.target.value))} 
                      className="w-full p-2.5 rounded-lg border outline-none font-mono" 
                      style={{ background: "var(--cf-input)", borderColor: "var(--db-border)", color: "var(--db-text)" }} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--db-text)" }}>Impostos e Taxas (%)</label>
                    <input 
                      type="number" 
                      value={precImposto} 
                      onChange={(e) => setPrecImposto(Number(e.target.value))} 
                      className="w-full p-2.5 rounded-lg border outline-none font-mono" 
                      style={{ background: "var(--cf-input)", borderColor: "var(--db-border)", color: "var(--db-text)" }} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--db-text)" }}>Margem de Lucro Desejada (%)</label>
                    <input 
                      type="number" 
                      value={precMargem} 
                      onChange={(e) => setPrecMargem(Number(e.target.value))} 
                      className="w-full p-2.5 rounded-lg border outline-none font-mono" 
                      style={{ background: "var(--cf-input)", borderColor: "var(--db-border)", color: "var(--db-text)" }} 
                    />
                  </div>
                </div>
              </div>

              <div className="cf-card p-6 flex flex-col justify-center text-center">
                <h3 className="font-heading text-lg font-bold mb-2" style={{ color: "var(--db-text)" }}>Preço de Venda Sugerido</h3>
                {precSugestao === -1 ? (
                  <div className="text-rose-500 font-bold mt-4 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20">
                    Sua margem e impostos superam ou igualam 100%. É impossível precificar.
                  </div>
                ) : (
                  <>
                    <div className="text-5xl font-extrabold mono mt-4 mb-6" style={{ color: "var(--primary)" }}>
                      {toBRL(precSugestao)}
                    </div>
                    <div className="space-y-3 mt-auto border-t pt-4 text-sm" style={{ borderColor: "var(--db-border)" }}>
                      <div className="flex justify-between">
                        <span style={{ color: "var(--db-text-2)" }}>Custos:</span>
                        <span className="font-mono font-semibold" style={{ color: "var(--db-text)" }}>{toBRL(Number(precCusto) || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: "var(--db-text-2)" }}>Impostos Estimados:</span>
                        <span className="font-mono font-semibold" style={{ color: "var(--danger)" }}>{toBRL(precSugestao * ((Number(precImposto) || 0)/100))}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span style={{ color: "var(--db-text)" }}>Lucro Líquido:</span>
                        <span className="font-mono text-emerald-500">{toBRL(precSugestao * ((Number(precMargem) || 0)/100))}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </>
  );
}