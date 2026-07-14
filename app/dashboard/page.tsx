"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, TrendingDown, DollarSign, CreditCard,
  AlertCircle, Clock, Wallet, ChevronRight, ArrowUpRight,
  ArrowDownRight, MoreHorizontal, Filter, Download,
  RefreshCw, CheckCircle2
} from "lucide-react";
import OnboardingModal from "../components/OnboardingModal";
import Navbar from "../components/Navbar";

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

interface Bill {
  id: string;
  name: string;
  dueDate: string;
  amount: number;
  status: string;
}

interface Receivable {
  id: string;
  clientName?: string;
  description?: string;
  dueDate: string;
  amount: number;
  status: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmt = (n: number) =>
  n < 0 ? `- R$ ${Math.abs(n).toLocaleString("pt-BR")}` : `R$ ${n.toLocaleString("pt-BR")}`;

const months = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
  blue:    { bg:"rgba(21,101,192,0.1)",  text:"#42a5f5", icon:"rgba(21,101,192,0.15)" },
  rose:    { bg:"rgba(244,63,94,0.08)",  text:"#fb7185", icon:"rgba(244,63,94,0.12)"  },
  emerald: { bg:"rgba(16,185,129,0.08)", text:"#34d399", icon:"rgba(16,185,129,0.12)" },
  amber:   { bg:"rgba(245,158,11,0.08)", text:"#fbbf24", icon:"rgba(245,158,11,0.12)" },
};

export default function Dashboard() {
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [user, setUser] = useState<{ displayName: string | null; email: string | null; uid: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideValues, setHideValues] = useState(false);

  // Firestore Data States
  const [txs, setTxs] = useState<Tx[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);

  const activePath = "/dashboard";

  // Obter o mês atual formatado (ex: "Out 2026")
  const currentPeriodLabel = useMemo(() => {
    const date = new Date();
    return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
      .replace(/^\w/, c => c.toUpperCase())
      .replace(/\./g, "");
  }, []);

  // Inicialização e Listeners em tempo real do Firestore
  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    let unsubTxs: (() => void) | undefined;
    let unsubBills: (() => void) | undefined;
    let unsubReceivables: (() => void) | undefined;

    (async () => {
      try {
        const [{ getFirebase }, { onAuthStateChanged }, { collection, query, orderBy, onSnapshot }] = await Promise.all([
          import("@/lib/firebase"),
          import("firebase/auth"),
          import("firebase/firestore"),
        ]);
        const { auth, db } = await getFirebase();

        unsubAuth = onAuthStateChanged(auth, (u) => {
          if (!u) {
            window.location.href = "/login";
            return;
          }
          setUser({ displayName: u.displayName, email: u.email, uid: u.uid });

          // Listener de Lançamentos de Fluxo de Caixa
          const txsRef = collection(db, "users", u.uid, "cashflow");
          const qTxs = query(txsRef, orderBy("date", "desc"));
          unsubTxs = onSnapshot(qTxs, (snap) => {
            setTxs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tx)));
            setLoading(false);
          }, (err) => console.error("Erro Txs:", err));

          // Listener de Contas a Pagar
          const billsRef = collection(db, "users", u.uid, "bills");
          unsubBills = onSnapshot(billsRef, (snap) => {
            setBills(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bill)));
          }, (err) => console.error("Erro Contas a Pagar:", err));

          // Listener de Contas a Receber
          const receivablesRef = collection(db, "users", u.uid, "receivables");
          unsubReceivables = onSnapshot(receivablesRef, (snap) => {
            setReceivables(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Receivable)));
          }, (err) => console.error("Erro Receivables:", err));

        });
      } catch (err) {
        console.error("Erro ao inicializar listeners:", err);
        setLoading(false);
      }
    })();

    return () => {
      unsubAuth?.();
      unsubTxs?.();
      unsubBills?.();
      unsubReceivables?.();
    };
  }, []);

  // 1. Cálculos de KPI com base nos dados reais do mês atual
  const kpiData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0 a 11

    // Transações do mês atual
    const currentMonthTxs = txs.filter(tx => {
      const txDate = new Date(tx.date + "T12:00:00");
      return txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth;
    });

    let receitaMes = 0;
    let despesaMes = 0;

    currentMonthTxs.forEach(tx => {
      if (tx.type === "entrada") receitaMes += tx.amount;
      else despesaMes += tx.amount;
    });

    // Transações do mês anterior (para comparar variação)
    const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const prevMonthTxs = txs.filter(tx => {
      const txDate = new Date(tx.date + "T12:00:00");
      return txDate.getFullYear() === prevMonthDate.getFullYear() && txDate.getMonth() === prevMonthDate.getMonth();
    });

    let receitaPrev = 0;
    let despesaPrev = 0;

    prevMonthTxs.forEach(tx => {
      if (tx.type === "entrada") receitaPrev += tx.amount;
      else despesaPrev += tx.amount;
    });

    const calcVar = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? "+100%" : "0%";
      const diff = ((curr - prev) / prev) * 100;
      return `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`;
    };

    const varReceita = calcVar(receitaMes, receitaPrev);
    const varDespesa = calcVar(despesaMes, despesaPrev);

    const lucroMes = receitaMes - despesaMes;
    const lucroPrev = receitaPrev - despesaPrev;
    const varLucro = calcVar(lucroMes, lucroPrev);

    // Inadimplência: Contas a receber vencidas vs total de contas a receber pendentes
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const pendingReceivables = receivables.filter(r => r.status !== "recebido");
    const totalPendingVal = pendingReceivables.reduce((sum, r) => sum + r.amount, 0);
    const overdueVal = pendingReceivables.filter(r => {
      const due = new Date(r.dueDate + "T00:00:00");
      due.setHours(0, 0, 0, 0);
      return due < today;
    }).reduce((sum, r) => sum + r.amount, 0);

    const taxaInadimplencia = totalPendingVal > 0 ? (overdueVal / totalPendingVal) * 100 : 0;

    return [
      { label: "Receita bruta",   value: hideValues ? "••••••" : toBRL(receitaMes), change: varReceita, up: parseFloat(varReceita) >= 0, sub: "vs. mês anterior", icon: TrendingUp,  color: "blue"    },
      { label: "Despesas totais", value: hideValues ? "••••••" : toBRL(despesaMes), change: varDespesa, up: parseFloat(varDespesa) <= 0, sub: "vs. mês anterior", icon: CreditCard,  color: "rose"    },
      { label: "Lucro líquido",   value: hideValues ? "••••••" : toBRL(lucroMes),   change: varLucro,   up: lucroMes >= 0,           sub: "vs. mês anterior", icon: Wallet,      color: "emerald" },
      { label: "Inadimplência",   value: `${taxaInadimplencia.toFixed(1)}%`,        change: overdueVal > 0 ? "Atrasadas" : "Em dia",  up: taxaInadimplencia === 0,  sub: `${toBRL(overdueVal)} pendente`, icon: AlertCircle, color: "amber"   },
    ];
  }, [txs, receivables, hideValues]);

  // 2. Gráfico Receita vs. Despesas agrupado por mês do ano corrente
  const chartData = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();

    const revenues = new Array(12).fill(0);
    const expenses = new Array(12).fill(0);

    txs.forEach(tx => {
      const txDate = new Date(tx.date + "T12:00:00");
      if (txDate.getFullYear() === currentYear) {
        const monthIdx = txDate.getMonth();
        if (tx.type === "entrada") {
          revenues[monthIdx] += tx.amount;
        } else {
          expenses[monthIdx] += tx.amount;
        }
      }
    });

    const maxVal = Math.max(...revenues, ...expenses) || 1000;

    return { revenues, expenses, maxVal };
  }, [txs]);

  // 3. Vencimentos próximos (Contas a Pagar pendentes)
  const upcomingBillsData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return bills
      .filter(b => b.status !== "pago")
      .map(b => {
        const due = new Date(b.dueDate + "T00:00:00");
        due.setHours(0, 0, 0, 0);
        const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
        return {
          ...b,
          urgent: diffDays <= 3,
          dueFormatted: due.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
        };
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 4);
  }, [bills]);

  // 4. Últimas transações (máximo 6 reais)
  const recentTransactions = useMemo(() => {
    return txs.slice(0, 6);
  }, [txs]);

  // 5. Centro de Custos (Despesas por categoria para o Donut Chart)
  const costCenterData = useMemo(() => {
    const categoryTotals: Record<string, number> = {};
    let totalExpenses = 0;

    txs.forEach(tx => {
      if (tx.type === "saida") {
        categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
        totalExpenses += tx.amount;
      }
    });

    const colors = ["#1565c0", "#42a5f5", "#90caf9", "#bbdefb", "#e3f2fd", "#cbd5e1"];

    const sortedCenters = Object.entries(categoryTotals)
      .map(([name, amount], idx) => ({
        name,
        amount,
        pct: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
        color: colors[idx % colors.length]
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      centers: sortedCenters.slice(0, 5),
      totalExpenses
    };
  }, [txs]);

  // 6. Projeção de fluxo de caixa a 30 dias (Saldo em conta + Recebíveis 30d - Contas a Pagar 30d)
  const projection = useMemo(() => {
    // Saldo atual consolidado histórico
    let saldoAtual = 0;
    txs.forEach(t => {
      if (t.type === "entrada") saldoAtual += t.amount;
      else saldoAtual -= t.amount;
    });

    // 30 dias a partir de hoje
    const today = new Date();
    const futureLimit = new Date();
    futureLimit.setDate(futureLimit.getDate() + 30);

    const filter30Days = (dueDateStr: string) => {
      const d = new Date(dueDateStr + "T00:00:00");
      return d >= today && d <= futureLimit;
    };

    // Entradas previstas nos próximos 30 dias (Recebíveis pendentes)
    const entradasPrevistas = receivables
      .filter(r => r.status !== "recebido" && filter30Days(r.dueDate))
      .reduce((sum, r) => sum + r.amount, 0);

    // Saídas previstas nos próximos 30 dias (Contas a pagar pendentes)
    const saidasAgendadas = bills
      .filter(b => b.status !== "pago" && filter30Days(b.dueDate))
      .reduce((sum, b) => sum + b.amount, 0);

    const saldoProjetado = saldoAtual + entradasPrevistas - saidasAgendadas;
    const variacaoPct = saldoAtual !== 0 ? ((saldoProjetado - saldoAtual) / Math.abs(saldoAtual)) * 100 : 0;

    return {
      saldoAtual,
      entradasPrevistas,
      saidasAgendadas,
      saldoProjetado,
      variacaoPct
    };
  }, [txs, bills, receivables]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--db-bg)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm font-semibold" style={{ color: "var(--db-text2)" }}>Sincronizando painel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--db-bg)" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, body { font-family: 'Sora', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        * { transition: background-color .2s, border-color .2s, color .15s; }
        button, a, input, select { transition: background-color .15s, border-color .15s, color .1s, opacity .15s !important; }

        .kpi-card {
          background: var(--db-card);
          border: 1px solid var(--db-border);
          box-shadow: 0 1px 3px rgba(13,34,71,0.06), 0 4px 16px rgba(13,34,71,0.04);
          animation: slideUp 0.5s ease both;
        }
        .chart-card {
          background: var(--db-card);
          border: 1px solid var(--db-border);
          box-shadow: 0 1px 3px rgba(13,34,71,0.06), 0 4px 16px rgba(13,34,71,0.04);
          border-radius: 1rem;
          animation: slideUp 0.5s 0.2s ease both;
        }
        .side-card {
          background: var(--db-card);
          border: 1px solid var(--db-border);
          box-shadow: 0 1px 3px rgba(13,34,71,0.06), 0 4px 16px rgba(13,34,71,0.04);
          border-radius: 1rem;
          animation: slideUp 0.5s 0.3s ease both;
        }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }

        .bar-rev { fill: #1565c0; transition: opacity 0.15s; }
        .bar-rev:hover { opacity: 0.8; }
        .bar-exp { fill: var(--db-border); transition: opacity 0.15s; }
        .bar-exp:hover { opacity: 0.7; }
        .bar-rev-anim { animation: growBar 0.8s cubic-bezier(.22,.68,0,1.2) both; transform-origin: bottom; }
        .bar-exp-anim { animation: growBar 0.8s 0.1s cubic-bezier(.22,.68,0,1.2) both; transform-origin: bottom; }
        @keyframes growBar { from{transform:scaleY(0)} to{transform:scaleY(1)} }

        .tx-row { transition: background 0.15s; border-bottom: 1px solid var(--db-border); }
        .tx-row:last-child { border-bottom: none; }
        .tx-row:hover { background: var(--db-hover); }

        .bill-row { transition: background 0.15s; border-radius: 12px; }
        .bill-row:hover { background: var(--db-hover); }

        .donut-ring { transition: stroke-dashoffset 0.8s cubic-bezier(.22,.68,0,1.2); }

        .badge-pago     { background: #dcfce7; color: #16a34a; }
        .badge-recebido { background: #dbeafe; color: #1d4ed8; }
        .badge-pendente { background: #fef9c3; color: #b45309; }

        .db-divider { border-color: var(--db-border); }
        .db-progress-bg { background: var(--db-border); }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--db-border); border-radius: 4px; }
      `}</style>

      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />

      <Navbar user={user} period={currentPeriodLabel} activePath={activePath} />

      <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 overflow-auto pb-20 lg:pb-8">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          {kpiData.map((kpi, i) => {
            const c = colorMap[kpi.color];
            return (
              <div key={kpi.label} className="kpi-card rounded-2xl p-4 md:p-5 flex flex-col gap-3 md:gap-4" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="flex items-start justify-between">
                  <p className="text-xs font-medium" style={{ color: "var(--db-text2)" }}>{kpi.label}</p>
                  <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: c.icon }}>
                    <kpi.icon size={16} style={{ color: c.text }} />
                  </div>
                </div>
                <div>
                  <p className="text-xl md:text-2xl font-extrabold leading-tight mb-1" style={{ color: "var(--db-text)" }}>{kpi.value}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>
                      {kpi.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {kpi.change}
                    </span>
                    <span className="text-xs" style={{ color: "var(--db-text2)" }}>{kpi.sub}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Chart + Bills ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">

          <div className="chart-card xl:col-span-2 p-4 md:p-6">
            <div className="flex items-start md:items-center justify-between mb-4 md:mb-6 gap-2">
              <div>
                <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Receita vs. Despesas</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--db-text2)" }}>Acumulado ano corrente — mensal</p>
              </div>
              <div className="flex items-center gap-2 md:gap-4 shrink-0">
                <div className="hidden sm:flex items-center gap-1.5 text-xs" style={{ color: "var(--db-text2)" }}>
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" /> Receita
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-xs" style={{ color: "var(--db-text2)" }}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--db-border)" }} /> Despesa
                </div>
                <button 
                  onClick={() => setHideValues(!hideValues)}
                  className="flex items-center gap-1 text-xs text-blue-500 font-medium hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <Download size={12} /><span className="hidden sm:inline">{hideValues ? "Mostrar Valores" : "Ocultar Valores"}</span>
                </button>
              </div>
            </div>
            <svg viewBox="0 0 600 200" className="w-full" style={{ height: 160 }}>
              {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
                <g key={i}>
                  <line x1="40" y1={10 + (1 - t) * 160} x2="590" y2={10 + (1 - t) * 160} stroke="var(--db-border)" strokeWidth="1" />
                  <text x="32" y={10 + (1 - t) * 160 + 4} fontSize="9" fill="var(--db-text-3)" textAnchor="end" fontFamily="JetBrains Mono, monospace">
                    {Math.round(t * chartData.maxVal / 100) * 100 === 0 ? "0" : `${Math.round(t * chartData.maxVal / 1000)}k`}
                  </text>
                </g>
              ))}
              {months.map((m, i) => {
                const rev = chartData.revenues[i];
                const exp = chartData.expenses[i];
                const bw = 22, gap = 44, x = 48 + i * gap;
                return (
                  <g key={m}>
                    <rect className="bar-rev bar-rev-anim" x={x} y={170 - (rev / chartData.maxVal) * 160} width={bw} height={(rev / chartData.maxVal) * 160} rx="3" style={{ animationDelay: `${i * 60}ms` }} />
                    <rect className="bar-exp bar-exp-anim" x={x + bw + 2} y={170 - (exp / chartData.maxVal) * 160} width={bw} height={(exp / chartData.maxVal) * 160} rx="3" style={{ animationDelay: `${i * 60 + 30}ms` }} />
                    <text x={x + bw} y={190} fontSize="9" fill="var(--db-text-3)" textAnchor="middle" fontFamily="Sora, sans-serif">{m}</text>
                  </g>
                );
              })}
            </svg>
            <div className="grid grid-cols-3 gap-2 md:gap-4 mt-3 md:mt-4 pt-3 md:pt-4 border-t db-divider">
              {[
                { label:"Total receitas (ano)", val: hideValues ? "••••••" : toBRL(chartData.revenues.reduce((a,b)=>a+b,0)), color:"#42a5f5" },
                { label:"Total despesas (ano)", val: hideValues ? "••••••" : toBRL(chartData.expenses.reduce((a,b)=>a+b,0)), color:"var(--db-text2)" },
                { label:"Saldo acumulado", val: hideValues ? "••••••" : toBRL(chartData.revenues.reduce((a,b)=>a+b,0) - chartData.expenses.reduce((a,b)=>a+b,0)), color:"#34d399" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-xs mb-0.5 leading-tight" style={{ color: "var(--db-text2)" }}>{s.label}</p>
                  <p className="font-bold text-xs md:text-sm mono" style={{ color: s.color }}>{s.val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Vencimentos Próximos */}
          <div className="side-card p-4 md:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4 md:mb-5">
              <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Vencimentos próximos</h2>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444" }}>
                {upcomingBillsData.filter(b => b.urgent).length} urgente
              </span>
            </div>
            <div className="space-y-1 md:space-y-2 flex-1 overflow-y-auto">
              {upcomingBillsData.length === 0 ? (
                <div className="text-center py-8 text-xs" style={{ color: "var(--db-text3)" }}>
                  Nenhuma conta pendente vencendo em breve!
                </div>
              ) : (
                upcomingBillsData.map((bill) => (
                  <div key={bill.id} className="bill-row flex items-center justify-between p-2.5 md:p-3">
                    <div className="flex items-center gap-2 md:gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: bill.urgent ? "rgba(239,68,68,0.1)" : "rgba(21,101,192,0.1)" }}>
                        {bill.urgent
                          ? <AlertCircle size={14} style={{ color: "#f87171" }} />
                          : <Clock       size={14} style={{ color: "#60a5fa" }} />
                        }
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold leading-tight truncate" style={{ color: "var(--db-text)" }}>{bill.name}</p>
                        <p className="text-xs mono" style={{ color: "var(--db-text2)" }}>vence {bill.dueFormatted}</p>
                      </div>
                    </div>
                    <p className="text-xs font-bold mono shrink-0 ml-2" style={{ color: bill.urgent ? "#f87171" : "var(--db-text)" }}>
                      {hideValues ? "••••" : toBRL(bill.amount)}
                    </p>
                  </div>
                ))
              )}
            </div>
            <a href="/contasPagar" className="mt-3 md:mt-4 w-full py-2.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 text-center"
              style={{ borderColor: "var(--db-border)", color: "#60a5fa", background: "transparent" }}>
              Ver todas <ChevronRight size={13} />
            </a>
          </div>
        </div>

        {/* ── Transactions + Cost Centers ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">

          <div className="chart-card xl:col-span-2 p-4 md:p-6">
            <div className="flex items-center justify-between mb-4 md:mb-5">
              <div>
                <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Últimas transações</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--db-text2)" }}>Movimentações recentes</p>
              </div>
              <div className="flex items-center gap-2">
                <a href="/fluxo-caixa" className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors">
                  Ver todas
                </a>
              </div>
            </div>

            <div className="md:hidden space-y-2">
              {recentTransactions.length === 0 ? (
                <div className="text-center py-6 text-xs" style={{ color: "var(--db-text3)" }}>Nenhum lançamento registrado.</div>
              ) : (
                recentTransactions.map((tx) => (
                  <div key={tx.id} className="tx-row flex items-center justify-between p-3 rounded-xl" style={{ border: `1px solid var(--db-border)` }}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: "var(--db-text)" }}>{tx.description}</p>
                      <p className="text-xs mono" style={{ color: "var(--db-text2)" }}>{tx.date.split("-")[2]}/{tx.date.split("-")[1]}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-3 shrink-0">
                      <span className={`mono text-xs font-bold ${tx.type === "entrada" ? "text-emerald-400" : "text-rose-400"}`}>
                        {tx.type === "entrada" ? "+" : "-"}{hideValues ? "•••" : toBRL(tx.amount)}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tx.reconciled ? "badge-pago" : "badge-pendente"}`}>
                        {tx.reconciled ? "Conciliado" : "Pendente"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b db-divider">
                    {["Descrição","Tipo","Valor","Data","Status"].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold pb-3 pr-4 whitespace-nowrap" style={{ color: "var(--db-text)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-xs" style={{ color: "var(--db-text3)" }}>Nenhuma transação registrada.</td>
                    </tr>
                  ) : (
                    recentTransactions.map((tx) => (
                      <tr key={tx.id} className="tx-row">
                        <td className="py-3 pr-4"><p className="text-xs font-semibold" style={{ color: "var(--db-text)" }}>{tx.description}</p></td>
                        <td className="py-3 pr-4"><span className={`text-xs font-medium ${tx.type === "entrada" ? "text-emerald-400" : "text-rose-400"}`}>{tx.type === "entrada" ? "Entrada" : "Saída"}</span></td>
                        <td className="py-3 pr-4"><span className={`mono text-xs font-bold ${tx.type === "entrada" ? "text-emerald-400" : "text-rose-400"}`}>{tx.type === "entrada" ? "+" : "-"}{hideValues ? "••••" : toBRL(tx.amount)}</span></td>
                        <td className="py-3 pr-4"><span className="text-xs whitespace-nowrap" style={{ color: "var(--db-text2)" }}>{tx.date.split("-")[2]}/{tx.date.split("-")[1]}</span></td>
                        <td className="py-3"><span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full ${tx.reconciled ? "badge-pago" : "badge-pendente"}`}>{tx.reconciled ? "Conciliado" : "Pendente"}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Centros de Custo (Donut Chart) */}
          <div className="side-card p-4 md:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4 md:mb-5">
              <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Centro de custos</h2>
              <a href="/costCenter" style={{ color: "var(--db-text2)" }} className="hover:text-blue-400 transition-colors"><MoreHorizontal size={16} /></a>
            </div>
            <div className="flex justify-center mb-4 md:mb-5">
              <svg width="130" height="130" viewBox="0 0 140 140">
                {(() => {
                  const circ = 2 * Math.PI * 52; 
                  let offset = 0;
                  return costCenterData.centers.map((cc) => {
                    const dash = (cc.pct / 100) * circ;
                    const el = (
                      <circle key={cc.name} cx={70} cy={70} r={52} fill="none" stroke={cc.color}
                        strokeWidth={22} strokeDasharray={`${dash} ${circ - dash}`}
                        strokeDashoffset={-offset} transform="rotate(-90 70 70)" className="donut-ring" />
                    );
                    offset += dash; 
                    return el;
                  });
                })()}
                <text x="70" y="66" textAnchor="middle" fontSize="11" fontWeight="800" fill="var(--db-text)" fontFamily="Sora">
                  {hideValues ? "••••" : toBRL(costCenterData.totalExpenses)}
                </text>
                <text x="70" y="80" textAnchor="middle" fontSize="8" fill="var(--db-text3)" fontFamily="Sora">total despesas</text>
              </svg>
            </div>
            <div className="space-y-2.5 flex-1 overflow-y-auto">
              {costCenterData.centers.length === 0 ? (
                <div className="text-center py-6 text-xs" style={{ color: "var(--db-text3)" }}>Nenhuma despesa no período.</div>
              ) : (
                costCenterData.centers.map((cc) => (
                  <div key={cc.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cc.color }} />
                      <span className="text-xs truncate max-w-[80px]" style={{ color: "var(--db-text2)" }} title={cc.name}>{cc.name}</span>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="w-16 md:w-20 h-1.5 rounded-full overflow-hidden db-progress-bg">
                        <div className="h-full rounded-full" style={{ width: `${cc.pct}%`, background: cc.color }} />
                      </div>
                      <span className="mono text-xs font-semibold w-7 text-right" style={{ color: "var(--db-text)" }}>{cc.pct}%</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Projeção fluxo de caixa ── */}
        <div className="chart-card p-4 md:p-6">
          <div className="flex items-start md:items-center justify-between mb-4 gap-2">
            <div>
              <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Projeção de fluxo de caixa (Próximos 30 dias)</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--db-text2)" }}>Baseado em saldo atual e recebimentos/contas agendadas para os próximos 30 dias</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
            {[
              { label:"Saldo atual",        val: hideValues ? "••••" : toBRL(projection.saldoAtual), icon:Wallet,       color:"blue",    note:"consolidado histórico" },
              { label:"Entradas previstas", val: hideValues ? "••••" : `+ ${toBRL(projection.entradasPrevistas)}`, icon:TrendingUp,   color:"emerald", note:"recebíveis próximos 30 dias"  },
              { label:"Saídas agendadas",   val: hideValues ? "••••" : `- ${toBRL(projection.saidasAgendadas)}`, icon:TrendingDown, color:"rose",    note:"compromissos próximos 30 dias"  },
            ].map((item) => {
              const cMap: Record<string, { bg: string; text: string; icon: string }> = {
                blue:    { bg:"rgba(21,101,192,0.12)",  text:"#60a5fa", icon:"rgba(21,101,192,0.2)"  },
                emerald: { bg:"rgba(16,185,129,0.1)",   text:"#34d399", icon:"rgba(16,185,129,0.18)" },
                rose:    { bg:"rgba(244,63,94,0.1)",    text:"#fb7185", icon:"rgba(244,63,94,0.18)"  },
              };
              const c = cMap[item.color];
              return (
                <div key={item.label} className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl" style={{ background: c.bg }}>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: c.icon }}>
                    <item.icon size={18} style={{ color: c.text }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium mb-0.5" style={{ color: c.text }}>{item.label}</p>
                    <p className="font-extrabold text-base md:text-lg mono truncate" style={{ color: c.text }}>{item.val}</p>
                    <p className="text-xs opacity-60 truncate" style={{ color: c.text }} title={item.note}>{item.note}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 md:mt-5">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--db-text2)" }}>
              <span>Saldo projetado final</span>
              <span className="mono font-semibold text-emerald-400">
                {hideValues ? "••••" : toBRL(projection.saldoProjetado)} 
                <span className="font-normal text-xs ml-1" style={{ color: "var(--db-text2)" }}>
                  ({projection.variacaoPct >= 0 ? "+" : ""}{projection.variacaoPct.toFixed(1)}%)
                </span>
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden db-progress-bg">
              <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max((projection.saldoProjetado / (projection.saldoAtual || 1)) * 50, 10), 100)}%`, background:"linear-gradient(90deg, #1565c0, #42a5f5)" }} />
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}