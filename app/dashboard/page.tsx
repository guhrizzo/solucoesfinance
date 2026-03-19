"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useRef } from "react";
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
  HelpCircle,
  UserCircle,
  Zap,
  Moon,
  Sun,
} from "lucide-react";
import OnboardingModal from "../components/OnboardingModal";
import Navbar from "../components/Navbar";

// ─── Mock Data ────────────────────────────────────────────────────────────────

const kpis = [
  { label: "Receita bruta", value: "R$ 1.248.390", change: "+14.2%", up: true, sub: "vs. mês anterior", icon: TrendingUp, color: "blue" },
  { label: "Despesas totais", value: "R$ 892.140", change: "+3.8%", up: false, sub: "vs. mês anterior", icon: CreditCard, color: "rose" },
  { label: "Lucro líquido", value: "R$ 356.250", change: "+28.6%", up: true, sub: "vs. mês anterior", icon: Wallet, color: "emerald" },
  { label: "Inadimplência", value: "3.1%", change: "-0.4%", up: true, sub: "vs. mês anterior", icon: AlertCircle, color: "amber" },
];

const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const revenueData = [680, 820, 740, 960, 880, 1050, 970, 1120, 1040, 1248, 0, 0];
const expenseData = [510, 630, 580, 720, 690, 800, 750, 860, 810, 892, 0, 0];

const transactions = [
  { id: "TXN-8841", name: "Fornecedor Alpha Ltda", type: "Pagamento", amount: -42800, date: "Hoje, 09:14", status: "pago" },
  { id: "TXN-8840", name: "Cliente Beta S.A.", type: "Recebimento", amount: 98500, date: "Hoje, 08:30", status: "recebido" },
  { id: "TXN-8839", name: "Aluguel sede", type: "Pagamento", amount: -18500, date: "Ontem, 17:02", status: "pago" },
  { id: "TXN-8838", name: "Gama Consultoria", type: "Recebimento", amount: 55000, date: "Ontem, 14:45", status: "recebido" },
  { id: "TXN-8837", name: "Folha de pagamento", type: "Pagamento", amount: -210000, date: "28 out, 10:00", status: "pago" },
  { id: "TXN-8836", name: "Delta Tecnologia Ltda", type: "Recebimento", amount: 134000, date: "27 out, 16:20", status: "pendente" },
];

const upcomingBills = [
  { name: "Simples Nacional", due: "05/11", amount: 12400, urgent: true },
  { name: "Seguro empresarial", due: "08/11", amount: 4800, urgent: false },
  { name: "Licença de software", due: "10/11", amount: 2200, urgent: false },
  { name: "Parcela financiamento", due: "15/11", amount: 28000, urgent: false },
];

const costCenters = [
  { name: "Operações", pct: 38, color: "#1565c0" },
  { name: "Comercial", pct: 26, color: "#42a5f5" },
  { name: "Administrativo", pct: 20, color: "#90caf9" },
  { name: "TI", pct: 10, color: "#bbdefb" },
  { name: "Outros", pct: 6, color: "#e3f2fd" },
];

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", badge: undefined },
  { icon: TrendingUp, label: "Fluxo de caixa", href: "/fluxo-caixa", badge: undefined },
  { icon: FileText, label: "Relatórios", href: "/relatorios", badge: undefined },
  { icon: CreditCard, label: "Contas a pagar", href: "/contasPagas", badge: 3 },
  { icon: DollarSign, label: "Contas a receber", href: "/contasReceber", badge: undefined },
  { icon: BarChart2, label: "Centro de custos", href: "/costCenter", badge: undefined },
  { icon: Users, label: "Usuários", href: "/users", badge: undefined },
];

const notifications = [
  { id: 1, title: "Vencimento próximo", desc: "Simples Nacional vence em 2 dias", time: "há 10 min", urgent: true },
  { id: 2, title: "Nova transação", desc: "Recebimento de Delta Tecnologia — R$ 134.000", time: "há 35 min", urgent: false },
  { id: 3, title: "Meta atingida", desc: "Lucro líquido superou projeção de outubro", time: "há 2h", urgent: false },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n < 0 ? `- R$ ${Math.abs(n).toLocaleString("pt-BR")}` : `R$ ${n.toLocaleString("pt-BR")}`;

const maxBar = Math.max(...revenueData.filter(Boolean));

const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
  blue:    { bg: "rgba(21,101,192,0.1)",  text: "#42a5f5", icon: "rgba(21,101,192,0.15)" },
  rose:    { bg: "rgba(244,63,94,0.08)",  text: "#fb7185", icon: "rgba(244,63,94,0.12)" },
  emerald: { bg: "rgba(16,185,129,0.08)", text: "#34d399", icon: "rgba(16,185,129,0.12)" },
  amber:   { bg: "rgba(245,158,11,0.08)", text: "#fbbf24", icon: "rgba(245,158,11,0.12)" },
};

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

// ─── Navbar ───────────────────────────────────────────────────────────────────

<Navbar />

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [period]          = useState("Out 2024");
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [user, setUser]   = useState<{ displayName: string | null; email: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const activePath = "/dashboard";

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { getFirebase }      = await import("../../lib/firebase");
      const { auth }             = await getFirebase();
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
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-slate-50 min-h-screen">

      <OnboardingModal open={showOnboarding} onClose={() => setShowOnboarding(false)} />

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, body { font-family: 'Sora', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }

        /* ── Navbar styles ── */
        .nxfi-nav {
          position: sticky; top: 0; z-index: 50;
          background: white;
          border-bottom: 1px solid #e8eef8;
          box-shadow: 0 1px 0 #e8eef8, 0 4px 20px rgba(13,34,71,0.04);
          display: flex; align-items: center;
          padding: 0 1.5rem; height: 64px; gap: 1rem;
        }
        .nxfi-logo { display:flex; align-items:center; gap:10px; text-decoration:none; flex-shrink:0; }
        .nxfi-logo-icon {
          width:34px; height:34px; border-radius:10px;
          background: linear-gradient(135deg,#1565c0,#42a5f5);
          display:flex; align-items:center; justify-content:center;
          box-shadow: 0 2px 8px rgba(21,101,192,0.3);
        }
        .nxfi-logo-text { font-weight:800; font-size:1.1rem; color:#0d2247; letter-spacing:-0.03em; }
        .nxfi-logo-text span { color:#1565c0; }

        .nxfi-nav-links { display:flex; align-items:center; gap:2px; flex:1; overflow:hidden; }
        .nxfi-nav-link {
          display:flex; align-items:center; gap:6px; padding:6px 12px; border-radius:10px;
          text-decoration:none; font-size:0.8rem; font-weight:500; color:#64748b;
          white-space:nowrap; transition:all 0.15s; border:1.5px solid transparent;
        }
        .nxfi-nav-link:hover { color:#1565c0; background:#f0f7ff; }
        .nxfi-nav-link.active { color:#1565c0; background:rgba(21,101,192,0.08); border-color:rgba(21,101,192,0.15); font-weight:600; }
        .nxfi-nav-link .badge { background:#ef4444; color:white; font-size:0.65rem; font-weight:700; padding:1px 5px; border-radius:100px; font-family:'JetBrains Mono',monospace; }

        .nxfi-actions { display:flex; align-items:center; gap:8px; flex-shrink:0; }
        .nxfi-search-wrap { position:relative; }
        .nxfi-search {
          background:#f1f5fb; border:1.5px solid transparent; border-radius:10px;
          padding:7px 12px 7px 34px; font-size:0.8rem; color:#0d2247; outline:none;
          width:200px; transition:all 0.2s; font-family:'Sora',sans-serif;
        }
        .nxfi-search:focus { border-color:#1565c0; background:white; width:240px; box-shadow:0 0 0 3px rgba(21,101,192,0.08); }
        .nxfi-search-icon { position:absolute; left:10px; top:50%; transform:translateY(-50%); color:#94a3b8; pointer-events:none; }
        .nxfi-search::placeholder { color:#94a3b8; }
        .nxfi-period-btn {
          display:flex; align-items:center; gap:6px; background:#f0f7ff; border:none;
          border-radius:10px; padding:7px 12px; cursor:pointer; color:#1565c0;
          font-size:0.8rem; font-weight:600; transition:all 0.15s; font-family:'Sora',sans-serif;
        }
        .nxfi-period-btn:hover { background:#dbeafe; }
        .nxfi-icon-btn {
          width:36px; height:36px; border:none; cursor:pointer; border-radius:10px;
          background:#f8faff; color:#64748b; display:flex; align-items:center; justify-content:center;
          transition:all 0.15s; position:relative;
        }
        .nxfi-icon-btn:hover { background:#f0f7ff; color:#1565c0; }
        .nxfi-notif-dot {
          position:absolute; top:7px; right:7px; width:7px; height:7px; border-radius:50%;
          background:#ef4444; border:1.5px solid white;
        }
        .nxfi-avatar-btn {
          display:flex; align-items:center; gap:8px; background:none; border:none; cursor:pointer;
          padding:4px 8px 4px 4px; border-radius:12px; transition:background 0.15s;
        }
        .nxfi-avatar-btn:hover { background:#f0f7ff; }
        .nxfi-avatar {
          width:34px; height:34px; border-radius:10px;
          background:linear-gradient(135deg,#1565c0,#42a5f5);
          display:flex; align-items:center; justify-content:center;
          color:white; font-weight:700; font-size:0.875rem; flex-shrink:0;
        }
        .nxfi-avatar-info { text-align:left; }
        .nxfi-avatar-name { font-size:0.78rem; font-weight:600; color:#0d2247; line-height:1.2; }
        .nxfi-avatar-role { font-size:0.68rem; color:#94a3b8; }

        /* Dropdowns */
        .nxfi-dropdown {
          position:absolute; top:calc(100% + 8px); background:white;
          border:1px solid #e8eef8; border-radius:14px; z-index:100; overflow:hidden;
          box-shadow:0 8px 32px rgba(13,34,71,0.12),0 2px 8px rgba(13,34,71,0.06);
          animation:dropIn 0.18s cubic-bezier(.22,.68,0,1.1) both;
        }
        @keyframes dropIn { from{opacity:0;transform:translateY(-6px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        .nxfi-notif-drop { right:0; width:320px; }
        .nxfi-notif-header { padding:14px 16px 10px; border-bottom:1px solid #f1f5fb; display:flex; align-items:center; justify-content:space-between; }
        .nxfi-notif-header h3 { font-size:0.82rem; font-weight:700; color:#0d2247; }
        .nxfi-notif-header button { font-size:0.72rem; color:#1565c0; background:none; border:none; cursor:pointer; font-weight:600; font-family:'Sora',sans-serif; }
        .nxfi-notif-item { display:flex; gap:10px; padding:12px 16px; border-bottom:1px solid #f8faff; transition:background 0.12s; cursor:pointer; }
        .nxfi-notif-item:last-child { border-bottom:none; }
        .nxfi-notif-item:hover { background:#f8faff; }
        .nxfi-notif-dot2 { width:8px; height:8px; border-radius:50%; margin-top:5px; flex-shrink:0; }
        .nxfi-notif-title { font-size:0.78rem; font-weight:600; color:#0d2247; }
        .nxfi-notif-desc { font-size:0.72rem; color:#64748b; margin-top:2px; line-height:1.4; }
        .nxfi-notif-time { font-size:0.68rem; color:#94a3b8; margin-top:4px; font-family:'JetBrains Mono',monospace; }
        .nxfi-user-drop { right:0; width:220px; }
        .nxfi-user-drop-header { padding:14px 16px 12px; border-bottom:1px solid #f1f5fb; }
        .nxfi-user-drop-name { font-size:0.82rem; font-weight:700; color:#0d2247; }
        .nxfi-user-drop-email { font-size:0.72rem; color:#94a3b8; margin-top:2px; }
        .nxfi-drop-item {
          display:flex; align-items:center; gap:10px; padding:9px 16px; font-size:0.8rem;
          font-weight:500; color:#475569; cursor:pointer; transition:all 0.12s;
          background:none; border:none; width:100%; text-align:left; font-family:'Sora',sans-serif;
        }
        .nxfi-drop-item:hover { background:#f0f7ff; color:#1565c0; }
        .nxfi-drop-item.danger:hover { background:#fff1f2; color:#ef4444; }
        .nxfi-drop-divider { height:1px; background:#f1f5fb; margin:4px 0; }

        /* Sidebar drawer */
        .nxfi-sidebar-overlay {
          position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:60;
          backdrop-filter:blur(2px); animation:fadeIn 0.2s ease both;
        }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .nxfi-sidebar {
          position:fixed; top:0; left:0; height:100vh; z-index:70; width:260px;
          display:flex; flex-direction:column;
          background:linear-gradient(180deg,#0a1628 0%,#0d2247 60%,#0e3372 100%);
          border-right:1px solid rgba(255,255,255,0.05);
          animation:slideInLeft 0.25s cubic-bezier(.22,.68,0,1.1) both; overflow-y:auto;
        }
        @keyframes slideInLeft { from{transform:translateX(-100%)} to{transform:translateX(0)} }
        .nxfi-sidebar-logo { display:flex; align-items:center; justify-content:space-between; padding:20px 20px 18px; border-bottom:1px solid rgba(255,255,255,0.06); }
        .nxfi-sidebar-logo-inner { display:flex; align-items:center; gap:10px; }
        .nxfi-sidebar-logo-text { font-size:1.1rem; font-weight:800; color:white; letter-spacing:-0.02em; }
        .nxfi-sidebar-logo-text span { color:#42a5f5; }
        .nxfi-sidebar-close {
          background:rgba(255,255,255,0.06); border:none; border-radius:8px;
          width:30px; height:30px; cursor:pointer; color:rgba(255,255,255,0.4);
          display:flex; align-items:center; justify-content:center; transition:all 0.15s;
        }
        .nxfi-sidebar-close:hover { background:rgba(255,255,255,0.12); color:white; }
        .nxfi-sidebar-nav { flex:1; padding:16px 12px; }
        .nxfi-sidebar-section { font-size:0.65rem; font-weight:700; color:rgba(255,255,255,0.25); letter-spacing:0.1em; text-transform:uppercase; padding:0 12px; margin:12px 0 6px; }
        .nxfi-sidebar-link {
          display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:10px;
          text-decoration:none; font-size:0.82rem; font-weight:500; color:rgba(147,197,253,0.55);
          margin-bottom:2px; transition:all 0.15s; border:1.5px solid transparent;
        }
        .nxfi-sidebar-link:hover { color:white; background:rgba(255,255,255,0.06); }
        .nxfi-sidebar-link.active { color:white; background:rgba(21,101,192,0.25); border-color:rgba(66,165,245,0.2); font-weight:600; }
        .nxfi-sidebar-link .dot { width:6px; height:6px; border-radius:50%; background:#42a5f5; margin-left:auto; }
        .nxfi-sidebar-link .badge { margin-left:auto; background:#ef4444; color:white; font-size:0.65rem; font-weight:700; padding:1px 6px; border-radius:100px; font-family:'JetBrains Mono',monospace; }
        .nxfi-sidebar-footer { padding:12px; border-top:1px solid rgba(255,255,255,0.06); }
        .nxfi-sidebar-footer-btn {
          display:flex; align-items:center; gap:10px; padding:9px 12px; border-radius:10px;
          font-size:0.82rem; font-weight:500; cursor:pointer; width:100%; background:none; border:none;
          transition:all 0.15s; font-family:'Sora',sans-serif; color:rgba(147,197,253,0.55);
        }
        .nxfi-sidebar-footer-btn:hover { color:white; background:rgba(255,255,255,0.06); }
        .nxfi-sidebar-footer-btn.danger:hover { color:#fca5a5; background:rgba(239,68,68,0.08); }

        /* Mobile bottom nav */
        .nxfi-mobile-nav {
          position:fixed; bottom:0; left:0; right:0; z-index:40; background:white;
          border-top:1px solid #e8eef8; box-shadow:0 -4px 20px rgba(13,34,71,0.06);
          display:flex; justify-content:space-around; align-items:center; padding:6px 8px 10px;
        }
        .nxfi-mobile-link {
          display:flex; flex-direction:column; align-items:center; gap:3px; padding:6px 12px;
          border-radius:12px; text-decoration:none; transition:all 0.15s; color:#94a3b8;
          font-size:0.65rem; font-weight:500;
        }
        .nxfi-mobile-link:hover { color:#1565c0; background:#f0f7ff; }
        .nxfi-mobile-link.active { color:#1565c0; }

        /* Responsive */
        @media (max-width:1024px) {
          .nxfi-nav-links, .nxfi-search-wrap { display:none; }
          .nxfi-avatar-info { display:none; }
          .nxfi-period-label { display:none; }
        }
        @media (min-width:1025px) {
          .nxfi-hamburger { display:none; }
          .nxfi-mobile-nav { display:none; }
        }

        /* ── Dashboard styles ── */
        .kpi-card {
          background:white; border:1px solid #e8eef8;
          box-shadow:0 1px 3px rgba(13,34,71,0.06),0 4px 16px rgba(13,34,71,0.04);
          animation:slideUp 0.5s ease both;
        }
        .chart-card {
          background:white; border:1px solid #e8eef8;
          box-shadow:0 1px 3px rgba(13,34,71,0.06),0 4px 16px rgba(13,34,71,0.04);
          border-radius:1rem; animation:slideUp 0.5s 0.2s ease both;
        }
        .side-card {
          background:white; border:1px solid #e8eef8;
          box-shadow:0 1px 3px rgba(13,34,71,0.06),0 4px 16px rgba(13,34,71,0.04);
          border-radius:1rem; animation:slideUp 0.5s 0.3s ease both;
        }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .bar-rev { fill:#1565c0; transition:opacity 0.15s; }
        .bar-rev:hover { opacity:0.8; }
        .bar-exp { fill:#e8eef8; transition:opacity 0.15s; }
        .bar-exp:hover { opacity:0.7; }
        .bar-rev-anim { animation:growBar 0.8s cubic-bezier(.22,.68,0,1.2) both; transform-origin:bottom; }
        .bar-exp-anim { animation:growBar 0.8s 0.1s cubic-bezier(.22,.68,0,1.2) both; transform-origin:bottom; }
        @keyframes growBar { from{transform:scaleY(0)} to{transform:scaleY(1)} }
        .tx-row { transition:background 0.15s; }
        .tx-row:hover { background:#f8faff; }
        .donut-ring { transition:stroke-dashoffset 0.8s cubic-bezier(.22,.68,0,1.2); }
        .badge-pago     { background:#dcfce7; color:#16a34a; }
        .badge-recebido { background:#dbeafe; color:#1d4ed8; }
        .badge-pendente { background:#fef9c3; color:#b45309; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background:transparent; }
        ::-webkit-scrollbar-thumb { background:#d0daf0; border-radius:4px; }
      `}</style>

      {/* ── Navbar ── */}
      <Navbar
        user={user}
        period={period}
        activePath={activePath}
      />

      {/* ── Content ── */}
      <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 overflow-auto pb-20 lg:pb-8">

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
                  <line x1="40" y1={10 + (1 - t) * 160} x2="590" y2={10 + (1 - t) * 160} stroke="#f1f5f9" strokeWidth="1" />
                  <text x="32" y={10 + (1 - t) * 160 + 4} fontSize="9" fill="#94a3b8" textAnchor="end" fontFamily="JetBrains Mono, monospace">
                    {Math.round(t * maxBar / 100) * 100 === 0 ? "0" : `${Math.round(t * maxBar / 100)}k`}
                  </text>
                </g>
              ))}
              {months.map((m, i) => {
                const rev = revenueData[i]; const exp = expenseData[i];
                if (!rev) return null;
                const bw = 22, gap = 44, x = 48 + i * gap;
                return (
                  <g key={m}>
                    <rect className="bar-rev bar-rev-anim" x={x} y={170 - (rev / maxBar) * 160} width={bw} height={(rev / maxBar) * 160} rx="3" style={{ animationDelay: `${i * 60}ms` }} />
                    <rect className="bar-exp bar-exp-anim" x={x + bw + 2} y={170 - (exp / maxBar) * 160} width={bw} height={(exp / maxBar) * 160} rx="3" style={{ animationDelay: `${i * 60 + 30}ms` }} />
                    <text x={x + bw} y={190} fontSize="9" fill="#94a3b8" textAnchor="middle" fontFamily="Sora, sans-serif">{m}</text>
                  </g>
                );
              })}
            </svg>
            <div className="grid grid-cols-3 gap-2 md:gap-4 mt-3 md:mt-4 pt-3 md:pt-4 border-t border-slate-100">
              {[
                { label: "Total receitas", val: "R$ 9.51M", color: "text-blue-600" },
                { label: "Total despesas", val: "R$ 7.25M", color: "text-slate-400" },
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
                {upcomingBills.filter(b => b.urgent).length} urgente
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
            {/* Mobile cards */}
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
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["ID", "Descrição", "Tipo", "Valor", "Data", "Status"].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-slate-400 pb-3 pr-4 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="tx-row border-b border-slate-50">
                      <td className="py-3 pr-4"><span className="mono text-xs text-slate-400">{tx.id}</span></td>
                      <td className="py-3 pr-4"><p className="text-blue-950 text-xs font-semibold">{tx.name}</p></td>
                      <td className="py-3 pr-4"><span className={`text-xs font-medium ${tx.amount > 0 ? "text-emerald-600" : "text-slate-500"}`}>{tx.type}</span></td>
                      <td className="py-3 pr-4"><span className={`mono text-xs font-bold ${tx.amount > 0 ? "text-emerald-600" : "text-rose-500"}`}>{tx.amount > 0 ? "+" : ""}{fmt(tx.amount)}</span></td>
                      <td className="py-3 pr-4"><span className="text-slate-400 text-xs whitespace-nowrap">{tx.date}</span></td>
                      <td className="py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full badge-${tx.status}`}>{tx.status.charAt(0).toUpperCase() + tx.status.slice(1)}</span></td>
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
              { label: "Saldo atual",        val: "R$ 1.248.390",   icon: Wallet,      color: "blue",    note: "em conta corrente" },
              { label: "Entradas previstas", val: "+ R$ 643.000",   icon: TrendingUp,  color: "emerald", note: "próximos 30 dias" },
              { label: "Saídas agendadas",   val: "- R$ 418.500",   icon: TrendingDown,color: "rose",    note: "próximos 30 dias" },
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
  );
}