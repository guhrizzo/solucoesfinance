"use client";

// ─── CRÍTICO: impede o Next.js de tentar fazer prerender desta página ─────────
export const dynamic = "force-dynamic";

import { useState } from "react";
import {
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  FileText,
  Users,
  Bell,
  Search,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  ClipboardList,
  Settings,
  LogOut,
  ChevronRight,
  AlertCircle,
  Clock,
  Wallet,
  BarChart2,
  RefreshCw,
  Calendar,
  Download,
  Filter,
  X,
  Menu,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const kpis = [
  { label: "Receita bruta",   value: "R$ 1.248.390", change: "+14.2%", up: true,  sub: "vs. mês anterior", icon: TrendingUp,  color: "blue"    },
  { label: "Despesas totais", value: "R$ 892.140",   change: "+3.8%",  up: false, sub: "vs. mês anterior", icon: CreditCard,  color: "rose"    },
  { label: "Lucro líquido",   value: "R$ 356.250",   change: "+28.6%", up: true,  sub: "vs. mês anterior", icon: Wallet,      color: "emerald" },
  { label: "Inadimplência",   value: "3.1%",          change: "-0.4%",  up: true,  sub: "vs. mês anterior", icon: AlertCircle, color: "amber"   },
];

const months      = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const revenueData = [680,820,740,960,880,1050,970,1120,1040,1248,0,0];
const expenseData = [510,630,580,720,690,800,750,860,810,892,0,0];

const transactions = [
  { id: "TXN-8841", name: "Fornecedor Alpha Ltda",  type: "Pagamento",   amount: -42800,  date: "Hoje, 09:14",   status: "pago"      },
  { id: "TXN-8840", name: "Cliente Beta S.A.",       type: "Recebimento", amount:  98500,  date: "Hoje, 08:30",   status: "recebido"  },
  { id: "TXN-8839", name: "Aluguel sede",            type: "Pagamento",   amount: -18500,  date: "Ontem, 17:02",  status: "pago"      },
  { id: "TXN-8838", name: "Gama Consultoria",        type: "Recebimento", amount:  55000,  date: "Ontem, 14:45",  status: "recebido"  },
  { id: "TXN-8837", name: "Folha de pagamento",      type: "Pagamento",   amount: -210000, date: "28 out, 10:00", status: "pago"      },
  { id: "TXN-8836", name: "Delta Tecnologia Ltda",   type: "Recebimento", amount: 134000,  date: "27 out, 16:20", status: "pendente"  },
];

const upcomingBills = [
  { name: "Simples Nacional",      due: "05/11", amount: 12400, urgent: true  },
  { name: "Seguro empresarial",    due: "08/11", amount:  4800, urgent: false },
  { name: "Licença de software",   due: "10/11", amount:  2200, urgent: false },
  { name: "Parcela financiamento", due: "15/11", amount: 28000, urgent: false },
];

const costCenters = [
  { name: "Operações",      pct: 38, color: "#1565c0" },
  { name: "Comercial",      pct: 26, color: "#42a5f5" },
  { name: "Administrativo", pct: 20, color: "#90caf9" },
  { name: "TI",             pct: 10, color: "#bbdefb" },
  { name: "Outros",         pct:  6, color: "#e3f2fd" },
];

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard",        active: true  },
  { icon: TrendingUp,      label: "Fluxo de caixa",   active: false },
  { icon: FileText,        label: "Relatórios",        active: false },
  { icon: CreditCard,      label: "Contas a pagar",    active: false },
  { icon: DollarSign,      label: "Contas a receber",  active: false },
  { icon: BarChart2,       label: "Centro de custos",  active: false },
  { icon: Users,           label: "Usuários",          active: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n < 0 ? `- R$ ${Math.abs(n).toLocaleString("pt-BR")}` : `R$ ${n.toLocaleString("pt-BR")}`;

const maxBar = Math.max(...revenueData.filter(Boolean));

const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
  blue:    { bg: "rgba(21,101,192,0.1)",  text: "#42a5f5", icon: "rgba(21,101,192,0.15)" },
  rose:    { bg: "rgba(244,63,94,0.08)",  text: "#fb7185", icon: "rgba(244,63,94,0.12)"  },
  emerald: { bg: "rgba(16,185,129,0.08)", text: "#34d399", icon: "rgba(16,185,129,0.12)" },
  amber:   { bg: "rgba(245,158,11,0.08)", text: "#fbbf24", icon: "rgba(245,158,11,0.12)" },
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  collapsed,
  mobileOpen,
  onClose,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
      )}
      <aside
        className={`sidebar fixed lg:sticky top-0 left-0 h-screen z-50 flex flex-col transition-all duration-300
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
        style={{ width: collapsed ? 72 : 230 }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between gap-3 px-5 py-6 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-blue-500 flex items-center justify-center shrink-0">
              <ClipboardList size={16} className="text-white" />
            </div>
            {!collapsed && (
              <span className="text-white font-bold text-lg tracking-tight whitespace-nowrap">
                Nexus<span className="text-blue-400">Fi</span>
              </span>
            )}
          </div>
          <button onClick={onClose} className="lg:hidden text-white/40 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={onClose}
              className={`nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                ${item.active ? "bg-blue-500/20 text-white" : "text-blue-200/50 hover:text-white hover:bg-white/5"}`}
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              {!collapsed && item.active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-3 pb-6 space-y-1 border-t border-white/5 pt-4">
          <button className="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-blue-200/50 hover:text-white hover:bg-white/5 text-sm font-medium transition-all">
            <Settings size={18} className="shrink-0" />
            {!collapsed && <span>Configurações</span>}
          </button>
          <button className="nav-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-blue-200/50 hover:text-rose-400 hover:bg-rose-500/5 text-sm font-medium transition-all">
            <LogOut size={18} className="shrink-0" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </aside>
    </>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ kpi, delay }: { kpi: typeof kpis[0]; delay: number }) {
  const c = colorMap[kpi.color];
  return (
    <div className="kpi-card rounded-2xl p-4 md:p-5 flex flex-col gap-3 md:gap-4" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between">
        <p className="text-slate-400 text-xs font-medium">{kpi.label}</p>
        <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: c.icon }}>
          <kpi.icon size={16} style={{ color: c.text }} />
        </div>
      </div>
      <div>
        <p className="text-blue-950 text-xl md:text-2xl font-extrabold leading-tight mb-1">{kpi.value}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>
            {kpi.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {kpi.change}
          </span>
          <span className="text-slate-400 text-xs">{kpi.sub}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [period]                     = useState("Out 2024");
  const { user, loading }            = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex bg-slate-50 min-h-screen">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, body { font-family: 'Sora', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }

        .sidebar {
          background: linear-gradient(180deg, #0a1628 0%, #0d2247 60%, #0e3372 100%);
          border-right: 1px solid rgba(255,255,255,0.05);
        }
        .kpi-card {
          background: white; border: 1px solid #e8eef8;
          box-shadow: 0 1px 3px rgba(13,34,71,0.06), 0 4px 16px rgba(13,34,71,0.04);
          animation: slideUp 0.5s ease both;
        }
        .chart-card {
          background: white; border: 1px solid #e8eef8;
          box-shadow: 0 1px 3px rgba(13,34,71,0.06), 0 4px 16px rgba(13,34,71,0.04);
          border-radius: 1rem; animation: slideUp 0.5s 0.2s ease both;
        }
        .side-card {
          background: white; border: 1px solid #e8eef8;
          box-shadow: 0 1px 3px rgba(13,34,71,0.06), 0 4px 16px rgba(13,34,71,0.04);
          border-radius: 1rem; animation: slideUp 0.5s 0.3s ease both;
        }
        @keyframes slideUp {
          from { opacity:0; transform: translateY(20px); }
          to   { opacity:1; transform: translateY(0); }
        }
        .bar-rev { fill: #1565c0; transition: opacity 0.15s; }
        .bar-rev:hover { opacity: 0.8; }
        .bar-exp { fill: #e8eef8; transition: opacity 0.15s; }
        .bar-exp:hover { opacity: 0.7; }
        .bar-rev-anim { animation: growBar 0.8s cubic-bezier(.22,.68,0,1.2) both; transform-origin: bottom; }
        .bar-exp-anim { animation: growBar 0.8s 0.1s cubic-bezier(.22,.68,0,1.2) both; transform-origin: bottom; }
        @keyframes growBar { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .tx-row { transition: background 0.15s; }
        .tx-row:hover { background: #f8faff; }
        .nav-item { cursor: pointer; }
        .search-input {
          background: #f1f5fb; border: 1.5px solid transparent; outline: none; transition: all 0.2s;
        }
        .search-input:focus {
          border-color: #1565c0; background: white; box-shadow: 0 0 0 3px rgba(21,101,192,0.08);
        }
        .donut-ring { transition: stroke-dashoffset 0.8s cubic-bezier(.22,.68,0,1.2); }
        .badge-pago     { background:#dcfce7; color:#16a34a; }
        .badge-recebido { background:#dbeafe; color:#1d4ed8; }
        .badge-pendente { background:#fef9c3; color:#b45309; }
        .collapse-btn {
          background: white; border: 1px solid #e8eef8;
          box-shadow: 0 2px 8px rgba(13,34,71,0.08); transition: all 0.15s;
        }
        .collapse-btn:hover { background: #f0f5ff; }
        .header-shadow { box-shadow: 0 1px 0 #e8eef8; }
        .bottom-nav {
          background: white; border-top: 1px solid #e8eef8;
          box-shadow: 0 -4px 20px rgba(13,34,71,0.06);
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d0daf0; border-radius: 4px; }
      `}</style>

      {/* Sidebar desktop */}
      <div className="hidden lg:block shrink-0" style={{ width: collapsed ? 72 : 230 }}>
        <Sidebar collapsed={collapsed} mobileOpen={false} onClose={() => {}} />
      </div>

      {/* Sidebar mobile drawer */}
      <div className="lg:hidden">
        <Sidebar collapsed={false} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0">

        {/* Topbar */}
        <header className="sticky top-0 z-20 bg-white header-shadow flex items-center justify-between px-4 md:px-8 py-3 md:py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileOpen(true)} className="collapse-btn lg:hidden w-9 h-9 rounded-lg flex items-center justify-center">
              <Menu size={16} className="text-blue-800" />
            </button>
            <button onClick={() => setCollapsed(!collapsed)} className="collapse-btn hidden lg:flex w-8 h-8 rounded-lg items-center justify-center">
              <BarChart2 size={15} className="text-blue-800" />
            </button>
            <div>
              <h1 className="text-blue-950 font-bold text-sm md:text-lg leading-tight">Dashboard financeiro</h1>
              <p className="text-slate-400 text-xs hidden sm:block">
                Bem-vindo de volta, {user?.displayName?.split(" ")[0] ?? "Usuário"} 👋
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="relative hidden md:block">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="search-input rounded-xl pl-9 pr-4 py-2 text-sm text-blue-950 placeholder-slate-400 w-52" placeholder="Buscar transações..." />
            </div>
            <button className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 transition-colors text-blue-700 text-xs font-semibold px-3 py-2 rounded-xl">
              <Calendar size={12} />
              <span className="hidden sm:inline">{period}</span>
              <span className="sm:hidden">Out</span>
              <ChevronDown size={11} />
            </button>
            <button className="relative w-9 h-9 rounded-xl bg-slate-50 hover:bg-blue-50 flex items-center justify-center transition-colors">
              <Bell size={16} className="text-slate-500" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-sm">
              {user?.displayName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U"}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 overflow-auto">

          {/* KPIs */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
            {kpis.map((kpi, i) => <KpiCard key={kpi.label} kpi={kpi} delay={i * 80} />)}
          </div>

          {/* Chart + Bills */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">

            <div className="chart-card xl:col-span-2 p-4 md:p-6">
              <div className="flex items-start md:items-center justify-between mb-4 md:mb-6 gap-2">
                <div>
                  <h2 className="text-blue-950 font-bold text-sm md:text-base">Receita vs. Despesas</h2>
                  <p className="text-slate-400 text-xs mt-0.5">Acumulado 2024 — mensal</p>
                </div>
                <div className="flex items-center gap-2 md:gap-4 shrink-0">
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 inline-block" /> Receita
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-2.5 h-2.5 rounded-sm bg-slate-200 inline-block" /> Despesa
                  </div>
                  <button className="flex items-center gap-1 text-xs text-blue-500 font-medium hover:text-blue-700 transition-colors">
                    <Download size={12} /><span className="hidden sm:inline">Exportar</span>
                  </button>
                </div>
              </div>

              <svg viewBox="0 0 600 200" className="w-full" style={{ height: 160 }}>
                {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
                  <g key={i}>
                    <line x1="40" y1={10+(1-t)*160} x2="590" y2={10+(1-t)*160} stroke="#f1f5f9" strokeWidth="1" />
                    <text x="32" y={10+(1-t)*160+4} fontSize="9" fill="#94a3b8" textAnchor="end" fontFamily="JetBrains Mono, monospace">
                      {Math.round(t*maxBar/100)*100===0?"0":`${Math.round(t*maxBar/100)}k`}
                    </text>
                  </g>
                ))}
                {months.map((m, i) => {
                  const rev = revenueData[i]; const exp = expenseData[i];
                  if (!rev) return null;
                  const bw=22, gap=44, x=48+i*gap;
                  return (
                    <g key={m}>
                      <rect className="bar-rev bar-rev-anim" x={x} y={170-(rev/maxBar)*160} width={bw} height={(rev/maxBar)*160} rx="3" style={{ animationDelay: `${i*60}ms` }} />
                      <rect className="bar-exp bar-exp-anim" x={x+bw+2} y={170-(exp/maxBar)*160} width={bw} height={(exp/maxBar)*160} rx="3" style={{ animationDelay: `${i*60+30}ms` }} />
                      <text x={x+bw} y={190} fontSize="9" fill="#94a3b8" textAnchor="middle" fontFamily="Sora, sans-serif">{m}</text>
                    </g>
                  );
                })}
              </svg>

              <div className="grid grid-cols-3 gap-2 md:gap-4 mt-3 md:mt-4 pt-3 md:pt-4 border-t border-slate-100">
                {[
                  { label: "Total receitas", val: "R$ 9.51M", color: "text-blue-600"    },
                  { label: "Total despesas", val: "R$ 7.25M", color: "text-slate-400"   },
                  { label: "Resultado líq.", val: "R$ 2.26M", color: "text-emerald-500" },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="text-slate-400 text-xs mb-0.5 leading-tight">{s.label}</p>
                    <p className={`font-bold text-xs md:text-sm mono ${s.color}`}>{s.val}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="side-card p-4 md:p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4 md:mb-5">
                <h2 className="text-blue-950 font-bold text-sm md:text-base">Vencimentos próximos</h2>
                <span className="bg-rose-50 text-rose-500 text-xs font-semibold px-2.5 py-1 rounded-full">
                  {upcomingBills.filter(b=>b.urgent).length} urgente
                </span>
              </div>
              <div className="space-y-2 md:space-y-3 flex-1">
                {upcomingBills.map((bill) => (
                  <div key={bill.name} className="flex items-center justify-between p-2.5 md:p-3 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2 md:gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${bill.urgent ? "bg-rose-50" : "bg-blue-50"}`}>
                        {bill.urgent ? <AlertCircle size={14} className="text-rose-500" /> : <Clock size={14} className="text-blue-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-blue-950 text-xs font-semibold leading-tight truncate">{bill.name}</p>
                        <p className="text-slate-400 text-xs mono">vence {bill.due}</p>
                      </div>
                    </div>
                    <p className={`text-xs font-bold mono shrink-0 ml-2 ${bill.urgent ? "text-rose-500" : "text-blue-950"}`}>
                      R$ {bill.amount.toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))}
              </div>
              <button className="mt-3 md:mt-4 w-full py-2.5 rounded-xl text-blue-600 text-xs font-semibold border border-blue-100 hover:bg-blue-50 transition-colors flex items-center justify-center gap-1">
                Ver todos <ChevronRight size={13} />
              </button>
            </div>
          </div>

          {/* Transactions + Cost Centers */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">

            <div className="chart-card xl:col-span-2 p-4 md:p-6">
              <div className="flex items-center justify-between mb-4 md:mb-5">
                <div>
                  <h2 className="text-blue-950 font-bold text-sm md:text-base">Últimas transações</h2>
                  <p className="text-slate-400 text-xs mt-0.5">6 movimentações recentes</p>
                </div>
                <div className="flex items-center gap-2">
                  <button className="flex items-center gap-1 bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-600 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors">
                    <Filter size={11} /><span className="hidden sm:inline ml-1">Filtrar</span>
                  </button>
                  <button className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors">
                    Ver todas
                  </button>
                </div>
              </div>

              {/* Mobile: cards */}
              <div className="md:hidden space-y-2">
                {transactions.map((tx) => (
                  <div key={tx.id} className="tx-row flex items-center justify-between p-3 rounded-xl border border-slate-100">
                    <div className="min-w-0">
                      <p className="text-blue-950 text-xs font-semibold truncate">{tx.name}</p>
                      <p className="text-slate-400 text-xs mono">{tx.date}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-3 shrink-0">
                      <span className={`mono text-xs font-bold ${tx.amount > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                        {tx.amount > 0 ? "+" : ""}{fmt(tx.amount)}
                      </span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full badge-${tx.status}`}>
                        {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {["ID","Descrição","Tipo","Valor","Data","Status"].map((h) => (
                        <th key={h} className="text-left text-xs font-semibold text-slate-400 pb-3 pr-4 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="tx-row border-b border-slate-50">
                        <td className="py-3 pr-4"><span className="mono text-xs text-slate-400">{tx.id}</span></td>
                        <td className="py-3 pr-4"><p className="text-blue-950 text-xs font-semibold">{tx.name}</p></td>
                        <td className="py-3 pr-4">
                          <span className={`text-xs font-medium ${tx.amount > 0 ? "text-emerald-600" : "text-slate-500"}`}>{tx.type}</span>
                        </td>
                        <td className="py-3 pr-4">
                          <span className={`mono text-xs font-bold ${tx.amount > 0 ? "text-emerald-600" : "text-rose-500"}`}>
                            {tx.amount > 0 ? "+" : ""}{fmt(tx.amount)}
                          </span>
                        </td>
                        <td className="py-3 pr-4"><span className="text-slate-400 text-xs whitespace-nowrap">{tx.date}</span></td>
                        <td className="py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full badge-${tx.status}`}>
                            {tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="side-card p-4 md:p-6 flex flex-col">
              <div className="flex items-center justify-between mb-4 md:mb-5">
                <h2 className="text-blue-950 font-bold text-sm md:text-base">Centro de custos</h2>
                <button className="text-slate-400 hover:text-blue-600 transition-colors"><MoreHorizontal size={16} /></button>
              </div>
              <div className="flex justify-center mb-4 md:mb-5">
                <svg width="130" height="130" viewBox="0 0 140 140">
                  {(() => {
                    const circ = 2 * Math.PI * 52;
                    let offset = 0;
                    return costCenters.map((cc) => {
                      const dash = (cc.pct / 100) * circ;
                      const el = (
                        <circle key={cc.name} cx={70} cy={70} r={52} fill="none" stroke={cc.color}
                          strokeWidth={22} strokeDasharray={`${dash} ${circ-dash}`}
                          strokeDashoffset={-offset} transform="rotate(-90 70 70)" className="donut-ring" />
                      );
                      offset += dash;
                      return el;
                    });
                  })()}
                  <text x="70" y="66" textAnchor="middle" fontSize="13" fontWeight="800" fill="#0d2247" fontFamily="Sora">R$ 892K</text>
                  <text x="70" y="80" textAnchor="middle" fontSize="8" fill="#94a3b8" fontFamily="Sora">total despesas</text>
                </svg>
              </div>
              <div className="space-y-2.5 flex-1">
                {costCenters.map((cc) => (
                  <div key={cc.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cc.color }} />
                      <span className="text-slate-500 text-xs">{cc.name}</span>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="w-16 md:w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${cc.pct}%`, background: cc.color }} />
                      </div>
                      <span className="mono text-xs text-blue-950 font-semibold w-7 text-right">{cc.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-between items-center">
                <span className="text-slate-400 text-xs">Maior custo</span>
                <span className="text-blue-950 text-xs font-bold">Operações · 38%</span>
              </div>
            </div>
          </div>

          {/* Cash Flow */}
          <div className="chart-card p-4 md:p-6">
            <div className="flex items-start md:items-center justify-between mb-4 gap-2">
              <div>
                <h2 className="text-blue-950 font-bold text-sm md:text-base">Fluxo de caixa — projeção 30 dias</h2>
                <p className="text-slate-400 text-xs mt-0.5">Baseado em histórico + compromissos agendados</p>
              </div>
              <button className="flex items-center gap-1 text-slate-400 hover:text-blue-600 text-xs font-medium transition-colors shrink-0">
                <RefreshCw size={12} /><span className="hidden sm:inline ml-1">Atualizar</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-6">
              {[
                { label: "Saldo atual",        val: "R$ 1.248.390",  icon: Wallet,       color: "blue",    note: "em conta corrente" },
                { label: "Entradas previstas", val: "+ R$ 643.000",  icon: TrendingUp,   color: "emerald", note: "próximos 30 dias"  },
                { label: "Saídas agendadas",   val: "- R$ 418.500",  icon: TrendingDown, color: "rose",    note: "próximos 30 dias"  },
              ].map((item) => {
                const cMap: Record<string, { bg: string; text: string; icon: string }> = {
                  blue:    { bg: "#eff6ff", text: "#1d4ed8", icon: "#dbeafe" },
                  emerald: { bg: "#f0fdf4", text: "#15803d", icon: "#dcfce7" },
                  rose:    { bg: "#fff1f2", text: "#be123c", icon: "#ffe4e6" },
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
                      <p className="text-xs opacity-60" style={{ color: c.text }}>{item.note}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 md:mt-5">
              <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                <span>Saldo projetado final</span>
                <span className="mono font-semibold text-emerald-600">R$ 1.472.890 <span className="text-slate-400 font-normal">(+18.0%)</span></span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: "72%", background: "linear-gradient(90deg, #1565c0, #42a5f5)" }} />
              </div>
              <div className="flex justify-between text-xs text-slate-300 mt-1 mono">
                <span>R$ 0</span><span>Meta: R$ 2M</span>
              </div>
            </div>
          </div>

        </main>
      </div>

      {/* Bottom nav mobile */}
      <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-30 flex lg:hidden justify-around items-center py-2 px-2">
        {[
          { icon: LayoutDashboard, label: "Início",     active: true  },
          { icon: TrendingUp,      label: "Caixa",      active: false },
          { icon: FileText,        label: "Relatórios", active: false },
          { icon: CreditCard,      label: "Contas",     active: false },
          { icon: Settings,        label: "Config.",    active: false },
        ].map((item) => (
          <button key={item.label}
            className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all
              ${item.active ? "text-blue-600" : "text-slate-400 hover:text-blue-500"}`}
          >
            <item.icon size={20} strokeWidth={item.active ? 2.5 : 1.8} />
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}