"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  FileText,
  Users,
  AlertCircle,
  Clock,
  Wallet,
  BarChart2,
  RefreshCw,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Filter,
  Download,
} from "lucide-react";
import OnboardingModal from "../components/OnboardingModal";
import Navbar from "../components/Navbar";
import { useTheme } from "@/app/hooks/useTheme"; // ajuste o path se necessário

// ─── Mock Data ────────────────────────────────────────────────────────────────

const kpis = [
  { label: "Receita bruta",  value: "R$ 1.248.390", change: "+14.2%", up: true,  sub: "vs. mês anterior", icon: TrendingUp,  color: "blue"    },
  { label: "Despesas totais",value: "R$ 892.140",   change: "+3.8%",  up: false, sub: "vs. mês anterior", icon: CreditCard,  color: "rose"    },
  { label: "Lucro líquido",  value: "R$ 356.250",   change: "+28.6%", up: true,  sub: "vs. mês anterior", icon: Wallet,      color: "emerald" },
  { label: "Inadimplência",  value: "3.1%",         change: "-0.4%",  up: true,  sub: "vs. mês anterior", icon: AlertCircle, color: "amber"   },
];

const months      = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const revenueData = [680,820,740,960,880,1050,970,1120,1040,1248,0,0];
const expenseData = [510,630,580,720,690,800,750,860,810,892,0,0];

const transactions = [
  { id:"TXN-8841", name:"Fornecedor Alpha Ltda",   type:"Pagamento",    amount:-42800,  date:"Hoje, 09:14",    status:"pago"      },
  { id:"TXN-8840", name:"Cliente Beta S.A.",        type:"Recebimento",  amount:98500,   date:"Hoje, 08:30",    status:"recebido"  },
  { id:"TXN-8839", name:"Aluguel sede",             type:"Pagamento",    amount:-18500,  date:"Ontem, 17:02",   status:"pago"      },
  { id:"TXN-8838", name:"Gama Consultoria",         type:"Recebimento",  amount:55000,   date:"Ontem, 14:45",   status:"recebido"  },
  { id:"TXN-8837", name:"Folha de pagamento",       type:"Pagamento",    amount:-210000, date:"28 out, 10:00",  status:"pago"      },
  { id:"TXN-8836", name:"Delta Tecnologia Ltda",    type:"Recebimento",  amount:134000,  date:"27 out, 16:20",  status:"pendente"  },
];

const upcomingBills = [
  { name:"Simples Nacional",       due:"05/11", amount:12400, urgent:true  },
  { name:"Seguro empresarial",     due:"08/11", amount:4800,  urgent:false },
  { name:"Licença de software",    due:"10/11", amount:2200,  urgent:false },
  { name:"Parcela financiamento",  due:"15/11", amount:28000, urgent:false },
];

const costCenters = [
  { name:"Operações",      pct:38, color:"#1565c0" },
  { name:"Comercial",      pct:26, color:"#42a5f5" },
  { name:"Administrativo", pct:20, color:"#90caf9" },
  { name:"TI",             pct:10, color:"#bbdefb" },
  { name:"Outros",         pct:6,  color:"#e3f2fd" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n < 0 ? `- R$ ${Math.abs(n).toLocaleString("pt-BR")}` : `R$ ${n.toLocaleString("pt-BR")}`;

const maxBar = Math.max(...revenueData.filter(Boolean));

const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
  blue:    { bg:"rgba(21,101,192,0.1)",  text:"#42a5f5", icon:"rgba(21,101,192,0.15)" },
  rose:    { bg:"rgba(244,63,94,0.08)",  text:"#fb7185", icon:"rgba(244,63,94,0.12)"  },
  emerald: { bg:"rgba(16,185,129,0.08)", text:"#34d399", icon:"rgba(16,185,129,0.12)" },
  amber:   { bg:"rgba(245,158,11,0.08)", text:"#fbbf24", icon:"rgba(245,158,11,0.12)" },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [period]         = useState("Out 2024");
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [user, setUser]  = useState<{ displayName: string | null; email: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const activePath = "/dashboard";

  // ── Tema compartilhado com Navbar ──
  const { dark } = useTheme();

  const theme = dark ? {
    "--db-bg":     "#0d1117",
    "--db-card":   "#1c2230",
    "--db-border": "#2a3548",
    "--db-text":   "#e2e8f0",
    "--db-text2":  "#8899b4",
    "--db-text3":  "#4a5568",
    "--db-hover":  "#1e2a3a",
    "--db-sub":    "#131922",
    "--db-divider":"#2a3548",
  } : {
    "--db-bg":     "#f8fafc",
    "--db-card":   "#ffffff",
    "--db-border": "#e8eef8",
    "--db-text":   "#0f1f40",
    "--db-text2":  "#64748b",
    "--db-text3":  "#94a3b8",
    "--db-hover":  "#f8faff",
    "--db-sub":    "#f1f5fb",
    "--db-divider":"#f1f5fb",
  };

  // Cores que o SVG não aceita via CSS var — passamos direto
  const svgText  = dark ? "#8899b4" : "#94a3b8";
  const svgTitle = dark ? "#e2e8f0" : "#0d2247";

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { getFirebase }        = await import("../../lib/firebase");
      const { auth }               = await getFirebase();
      const { onAuthStateChanged } = await import("firebase/auth");
      unsub = onAuthStateChanged(auth, (u) => {
        if (!u) { window.location.href = "/login"; return; }
        setUser({ displayName: u.displayName, email: u.email });
        setLoading(false);
      });
    })();
    return () => unsub?.();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--db-bg)", ...(theme as any) }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm" style={{ color: "var(--db-text2)" }}>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--db-bg)", ...(theme as any) }}>

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

      {/* ── Navbar (controla o dark mode) ── */}
      <Navbar user={user} period={period} activePath={activePath} />

      {/* ── Content ── */}
      <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 overflow-auto pb-20 lg:pb-8">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          {kpis.map((kpi, i) => {
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

          {/* Gráfico de barras */}
          <div className="chart-card xl:col-span-2 p-4 md:p-6">
            <div className="flex items-start md:items-center justify-between mb-4 md:mb-6 gap-2">
              <div>
                <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Receita vs. Despesas</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--db-text2)" }}>Acumulado 2024 — mensal</p>
              </div>
              <div className="flex items-center gap-2 md:gap-4 shrink-0">
                <div className="hidden sm:flex items-center gap-1.5 text-xs" style={{ color: "var(--db-text2)" }}>
                  <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" /> Receita
                </div>
                <div className="hidden sm:flex items-center gap-1.5 text-xs" style={{ color: "var(--db-text2)" }}>
                  <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: "var(--db-border)" }} /> Despesa
                </div>
                <button className="flex items-center gap-1 text-xs text-blue-500 font-medium hover:text-blue-400 transition-colors">
                  <Download size={12} /><span className="hidden sm:inline">Exportar</span>
                </button>
              </div>
            </div>
            <svg viewBox="0 0 600 200" className="w-full" style={{ height: 160 }}>
              {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
                <g key={i}>
                  <line x1="40" y1={10 + (1 - t) * 160} x2="590" y2={10 + (1 - t) * 160} stroke={dark ? "#2a3548" : "#f1f5f9"} strokeWidth="1" />
                  <text x="32" y={10 + (1 - t) * 160 + 4} fontSize="9" fill={svgText} textAnchor="end" fontFamily="JetBrains Mono, monospace">
                    {Math.round(t * maxBar / 100) * 100 === 0 ? "0" : `${Math.round(t * maxBar / 100)}k`}
                  </text>
                </g>
              ))}
              {months.map((m, i) => {
                const rev = revenueData[i];
                const exp = expenseData[i];
                if (!rev) return null;
                const bw = 22, gap = 44, x = 48 + i * gap;
                return (
                  <g key={m}>
                    <rect className="bar-rev bar-rev-anim" x={x} y={170 - (rev / maxBar) * 160} width={bw} height={(rev / maxBar) * 160} rx="3" style={{ animationDelay: `${i * 60}ms` }} />
                    <rect className="bar-exp bar-exp-anim" x={x + bw + 2} y={170 - (exp / maxBar) * 160} width={bw} height={(exp / maxBar) * 160} rx="3" style={{ animationDelay: `${i * 60 + 30}ms` }} />
                    <text x={x + bw} y={190} fontSize="9" fill={svgText} textAnchor="middle" fontFamily="Sora, sans-serif">{m}</text>
                  </g>
                );
              })}
            </svg>
            <div className="grid grid-cols-3 gap-2 md:gap-4 mt-3 md:mt-4 pt-3 md:pt-4 border-t db-divider">
              {[
                { label:"Total receitas",  val:"R$ 9.51M", color:"#42a5f5"  },
                { label:"Total despesas",  val:"R$ 7.25M", color:"var(--db-text2)" },
                { label:"Resultado líq.",  val:"R$ 2.26M", color:"#34d399"  },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-xs mb-0.5 leading-tight" style={{ color: "var(--db-text2)" }}>{s.label}</p>
                  <p className="font-bold text-xs md:text-sm mono" style={{ color: s.color }}>{s.val}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Vencimentos */}
          <div className="side-card p-4 md:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4 md:mb-5">
              <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Vencimentos próximos</h2>
              <span className="bg-rose-500 bg-opacity-10 text-rose-400 text-xs font-semibold px-2.5 py-1 rounded-full">
                {upcomingBills.filter(b => b.urgent).length} urgente
              </span>
            </div>
            <div className="space-y-1 md:space-y-2 flex-1">
              {upcomingBills.map((bill) => (
                <div key={bill.name} className="bill-row flex items-center justify-between p-2.5 md:p-3">
                  <div className="flex items-center gap-2 md:gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: bill.urgent ? "rgba(239,68,68,0.1)" : "rgba(21,101,192,0.1)" }}>
                      {bill.urgent
                        ? <AlertCircle size={14} style={{ color: "#f87171" }} />
                        : <Clock       size={14} style={{ color: "#60a5fa" }} />
                      }
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold leading-tight truncate" style={{ color: "var(--db-text)" }}>{bill.name}</p>
                      <p className="text-xs mono" style={{ color: "var(--db-text2)" }}>vence {bill.due}</p>
                    </div>
                  </div>
                  <p className="text-xs font-bold mono shrink-0 ml-2" style={{ color: bill.urgent ? "#f87171" : "var(--db-text)" }}>
                    R$ {bill.amount.toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
            <button className="mt-3 md:mt-4 w-full py-2.5 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1 transition-colors"
              style={{ borderColor: "var(--db-border)", color: "#60a5fa", background: "transparent" }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--db-hover)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              Ver todos <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* ── Transactions + Cost Centers ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">

          {/* Transações */}
          <div className="chart-card xl:col-span-2 p-4 md:p-6">
            <div className="flex items-center justify-between mb-4 md:mb-5">
              <div>
                <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Últimas transações</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--db-text2)" }}>6 movimentações recentes</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors"
                  style={{ background: "var(--db-sub)", color: "var(--db-text2)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(21,101,192,0.1)"; e.currentTarget.style.color = "#60a5fa"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "var(--db-sub)"; e.currentTarget.style.color = "var(--db-text2)"; }}>
                  <Filter size={11} /><span className="hidden sm:inline ml-1">Filtrar</span>
                </button>
                <button className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors">
                  Ver todas
                </button>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {transactions.map((tx) => (
                <div key={tx.id} className="tx-row flex items-center justify-between p-3 rounded-xl" style={{ border: `1px solid var(--db-border)` }}>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate" style={{ color: "var(--db-text)" }}>{tx.name}</p>
                    <p className="text-xs mono" style={{ color: "var(--db-text2)" }}>{tx.date}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-3 shrink-0">
                    <span className={`mono text-xs font-bold ${tx.amount > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {tx.amount > 0 ? "+" : ""}{fmt(tx.amount)}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full badge-${tx.status}`}>
                      {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b db-divider">
                    {["ID","Descrição","Tipo","Valor","Data","Status"].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold pb-3 pr-4 whitespace-nowrap" style={{ color: "var(--db-text2)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="tx-row">
                      <td className="py-3 pr-4"><span className="mono text-xs" style={{ color: "var(--db-text3)" }}>{tx.id}</span></td>
                      <td className="py-3 pr-4"><p className="text-xs font-semibold" style={{ color: "var(--db-text)" }}>{tx.name}</p></td>
                      <td className="py-3 pr-4"><span className={`text-xs font-medium ${tx.amount > 0 ? "text-emerald-400" : ""}`} style={tx.amount <= 0 ? { color: "var(--db-text2)" } : {}}>{tx.type}</span></td>
                      <td className="py-3 pr-4"><span className={`mono text-xs font-bold ${tx.amount > 0 ? "text-emerald-400" : "text-rose-400"}`}>{tx.amount > 0 ? "+" : ""}{fmt(tx.amount)}</span></td>
                      <td className="py-3 pr-4"><span className="text-xs whitespace-nowrap" style={{ color: "var(--db-text2)" }}>{tx.date}</span></td>
                      <td className="py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full badge-${tx.status}`}>{tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Centro de custos */}
          <div className="side-card p-4 md:p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4 md:mb-5">
              <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Centro de custos</h2>
              <button style={{ color: "var(--db-text2)" }} className="hover:text-blue-400 transition-colors"><MoreHorizontal size={16} /></button>
            </div>
            <div className="flex justify-center mb-4 md:mb-5">
              <svg width="130" height="130" viewBox="0 0 140 140">
                {(() => {
                  const circ = 2 * Math.PI * 52; let offset = 0;
                  return costCenters.map((cc) => {
                    const dash = (cc.pct / 100) * circ;
                    const el = (
                      <circle key={cc.name} cx={70} cy={70} r={52} fill="none" stroke={cc.color}
                        strokeWidth={22} strokeDasharray={`${dash} ${circ - dash}`}
                        strokeDashoffset={-offset} transform="rotate(-90 70 70)" className="donut-ring" />
                    );
                    offset += dash; return el;
                  });
                })()}
                <text x="70" y="66" textAnchor="middle" fontSize="13" fontWeight="800" fill={svgTitle} fontFamily="Sora">R$ 892K</text>
                <text x="70" y="80" textAnchor="middle" fontSize="8" fill={svgText} fontFamily="Sora">total despesas</text>
              </svg>
            </div>
            <div className="space-y-2.5 flex-1">
              {costCenters.map((cc) => (
                <div key={cc.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cc.color }} />
                    <span className="text-xs" style={{ color: "var(--db-text2)" }}>{cc.name}</span>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3">
                    <div className="w-16 md:w-20 h-1.5 rounded-full overflow-hidden db-progress-bg">
                      <div className="h-full rounded-full" style={{ width: `${cc.pct}%`, background: cc.color }} />
                    </div>
                    <span className="mono text-xs font-semibold w-7 text-right" style={{ color: "var(--db-text)" }}>{cc.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t db-divider flex justify-between items-center">
              <span className="text-xs" style={{ color: "var(--db-text2)" }}>Maior custo</span>
              <span className="text-xs font-bold" style={{ color: "var(--db-text)" }}>Operações · 38%</span>
            </div>
          </div>
        </div>

        {/* ── Projeção fluxo de caixa ── */}
        <div className="chart-card p-4 md:p-6">
          <div className="flex items-start md:items-center justify-between mb-4 gap-2">
            <div>
              <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Fluxo de caixa — projeção 30 dias</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--db-text2)" }}>Baseado em histórico + compromissos agendados</p>
            </div>
            <button className="flex items-center gap-1 text-xs font-medium transition-colors shrink-0" style={{ color: "var(--db-text2)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#60a5fa")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--db-text2)")}>
              <RefreshCw size={12} /><span className="hidden sm:inline ml-1">Atualizar</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
            {[
              { label:"Saldo atual",        val:"R$ 1.248.390",  icon:Wallet,      color:"blue",    note:"em conta corrente" },
              { label:"Entradas previstas", val:"+ R$ 643.000",  icon:TrendingUp,  color:"emerald", note:"próximos 30 dias"  },
              { label:"Saídas agendadas",   val:"- R$ 418.500",  icon:TrendingDown,color:"rose",    note:"próximos 30 dias"  },
            ].map((item) => {
              const cMap: Record<string, { bg: string; text: string; icon: string }> = {
                blue:    { bg:"rgba(21,101,192,0.12)",  text:"#60a5fa", icon:"rgba(21,101,192,0.2)"  },
                emerald: { bg:"rgba(16,185,129,0.1)",   text:"#34d399", icon:"rgba(16,185,129,0.18)" },
                rose:    { bg:"rgba(244,63,94,0.1)",    text:"#fb7185", icon:"rgba(244,63,94,0.18)"  },
              };
              // No light mode, usa cores mais sólidas
              const cLight: Record<string, { bg: string; text: string; icon: string }> = {
                blue:    { bg:"#eff6ff", text:"#1d4ed8", icon:"#dbeafe" },
                emerald: { bg:"#f0fdf4", text:"#15803d", icon:"#dcfce7" },
                rose:    { bg:"#fff1f2", text:"#be123c", icon:"#ffe4e6" },
              };
              const c = dark ? cMap[item.color] : cLight[item.color];
              return (
                <div key={item.label} className="flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl" style={{ background: c.bg }}>
                  <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: c.icon }}>
                    <item.icon size={18} style={{ color: c.text }} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium mb-0.5" style={{ color: c.text }}>{item.label}</p>
                    <p className="font-extrabold text-base md:text-lg mono truncate" style={{ color: c.text }}>{item.val}</p>
                    <p className="text-xs opacity-60" style={{ color: c.text }}>{item.note}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 md:mt-5">
            <div className="flex justify-between text-xs mb-1.5" style={{ color: "var(--db-text2)" }}>
              <span>Saldo projetado final</span>
              <span className="mono font-semibold text-emerald-400">R$ 1.472.890 <span className="font-normal" style={{ color: "var(--db-text2)" }}>(+18.0%)</span></span>
            </div>
            <div className="h-2 rounded-full overflow-hidden db-progress-bg">
              <div className="h-full rounded-full" style={{ width:"72%", background:"linear-gradient(90deg, #1565c0, #42a5f5)" }} />
            </div>
            <div className="flex justify-between text-xs mt-1 mono" style={{ color: "var(--db-text3)" }}>
              <span>R$ 0</span><span>Meta: R$ 2M</span>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}