"use client";

import { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard, TrendingUp, FileText, CreditCard, DollarSign,
  BarChart2, Users, Bell, Search, ChevronDown, Calendar, Settings,
  LogOut, ClipboardList, Menu, X, HelpCircle, UserCircle, Moon, Sun, Zap,
} from "lucide-react";
import { useTheme } from "../hooks/useTheme";

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem { icon: React.ElementType; label: string; href: string; badge?: number; }
interface NavbarProps {
  user?: { displayName: string | null; email: string | null } | null;
  period?: string;
  activePath?: string;
  onLogout?: () => void;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: TrendingUp, label: "Fluxo de caixa", href: "/fluxo-caixa" },
  { icon: FileText, label: "Relatórios", href: "/relatorios" },
  { icon: CreditCard, label: "Contas a pagar", href: "/contasPagar", badge: 4 },
  { icon: DollarSign, label: "Contas a receber", href: "/contasReceber" },
  { icon: BarChart2, label: "Centro de custos", href: "/costCenter" },
  { icon: Users, label: "Usuários", href: "/users" },
];

const notifications = [
  { id: 1, title: "Vencimento próximo", desc: "Simples Nacional vence em 2 dias", time: "há 10 min", urgent: true },
  { id: 2, title: "Nova transação", desc: "Recebimento de Delta Tecnologia — R$ 134.000", time: "há 35 min", urgent: false },
  { id: 3, title: "Meta atingida", desc: "Lucro líquido superou projeção de outubro", time: "há 2h", urgent: false },
];

// ─── Styles ───────────────────────────────────────────────────────────────────

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

  /* ── Dark mode variables (sync with CashFlowPage) ── */
  :root {
    --nav-bg:        #ffffff;
    --nav-border:    #e8eef8;
    --nav-shadow:    0 1px 0 #e8eef8, 0 4px 20px rgba(13,34,71,0.04);
    --nav-text:      #0d2247;
    --nav-text2:     #64748b;
    --nav-text3:     #94a3b8;
    --nav-link-hover-bg: #f0f7ff;
    --nav-link-hover-color: #1565c0;
    --nav-link-active-bg: rgba(21,101,192,0.08);
    --nav-link-active-border: rgba(21,101,192,0.15);
    --nav-input-bg:  #f1f5fb;
    --nav-icon-bg:   #f8faff;
    --nav-icon-hover:#f0f7ff;
    --nav-drop-bg:   #ffffff;
    --nav-drop-border: #e8eef8;
    --nav-drop-item-hover: #f0f7ff;
    --nav-drop-div:  #f1f5fb;
    --nav-mobile-bg: #ffffff;
    --nav-mobile-border: #e8eef8;
    --nav-mobile-shadow: 0 -4px 20px rgba(13,34,71,0.06);
    --nav-notif-hover: #f8faff;
    --nav-period-bg: #f0f7ff;
    --nav-period-hover: #dbeafe;
    --nav-logo-text: #0d2247;
  }
  [data-theme="dark"] {
    --nav-bg:        #161b22;
    --nav-border:    #2a3548;
    --nav-shadow:    0 1px 0 #2a3548, 0 4px 20px rgba(0,0,0,0.2);
    --nav-text:      #e2e8f0;
    --nav-text2:     #8899b4;
    --nav-text3:     #4a5568;
    --nav-link-hover-bg: rgba(59,130,246,0.08);
    --nav-link-hover-color: #60a5fa;
    --nav-link-active-bg: rgba(59,130,246,0.12);
    --nav-link-active-border: rgba(96,165,250,0.2);
    --nav-input-bg:  #0d1117;
    --nav-icon-bg:   #1c2230;
    --nav-icon-hover:#243040;
    --nav-drop-bg:   #1c2230;
    --nav-drop-border: #2a3548;
    --nav-drop-item-hover: #243040;
    --nav-drop-div:  #2a3548;
    --nav-mobile-bg: #161b22;
    --nav-mobile-border: #2a3548;
    --nav-mobile-shadow: 0 -4px 20px rgba(0,0,0,0.3);
    --nav-notif-hover: #1e2a3a;
    --nav-period-bg: rgba(59,130,246,0.08);
    --nav-period-hover: rgba(59,130,246,0.15);
    --nav-logo-text: #e2e8f0;
  }

  .nxfi-nav *, .nxfi-sidebar *, .nxfi-mobile-nav * {
    font-family: 'Sora', sans-serif;
    box-sizing: border-box;
    transition: background-color .2s, border-color .2s, color .15s;
  }
  .nxfi-nav .mono, .nxfi-sidebar .mono { font-family: 'JetBrains Mono', monospace; }

  /* ── Top Navbar ── */
  .nxfi-nav {
    position: sticky; top: 0; z-index: 50;
    background: var(--nav-bg);
    border-bottom: 1px solid var(--nav-border);
    box-shadow: var(--nav-shadow);
    display: flex; align-items: center;
    padding: 0 2rem; height: 64px; gap: 1rem;
  }

  /* Logo */
  .nxfi-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; flex-shrink: 0; }
  .nxfi-logo-icon {
    width: 34px; height: 34px; border-radius: 10px;
    background: linear-gradient(135deg, #1565c0, #42a5f5);
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(21,101,192,0.3);
  }
  .nxfi-logo-text { font-weight: 800; font-size: 1.1rem; color: var(--nav-logo-text); letter-spacing: -0.03em; }
  .nxfi-logo-text span { color: #1565c0; }

  /* Desktop nav links */
  .nxfi-nav-links { display: flex; align-items: center; gap: 2px; flex: 1; overflow: hidden; }
  .nxfi-nav-link {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 10px;
    text-decoration: none; font-size: 0.8rem; font-weight: 500;
    color: var(--nav-text2); white-space: nowrap;
    transition: all 0.15s ease; position: relative;
    border: 1.5px solid transparent;
  }
  .nxfi-nav-link:hover { color: var(--nav-link-hover-color); background: var(--nav-link-hover-bg); }
  .nxfi-nav-link.active {
    color: var(--nav-link-hover-color); background: var(--nav-link-active-bg);
    border-color: var(--nav-link-active-border); font-weight: 600;
  }
  .nxfi-nav-link .badge {
    background: #ef4444; color: white; font-size: 0.65rem;
    font-weight: 700; padding: 1px 5px; border-radius: 100px;
    font-family: 'JetBrains Mono', monospace; line-height: 1.4;
  }

  /* Right actions */
  .nxfi-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  .nxfi-search-wrap { position: relative; }
  .nxfi-search {
    background: var(--nav-input-bg); border: 1.5px solid transparent;
    border-radius: 10px; padding: 7px 12px 7px 34px;
    font-size: 0.8rem; color: var(--nav-text); outline: none;
    width: 200px; transition: all 0.2s;
    font-family: 'Sora', sans-serif;
  }
  .nxfi-search:focus {
    border-color: #1565c0; background: var(--nav-bg); width: 240px;
    box-shadow: 0 0 0 3px rgba(21,101,192,0.08);
  }
  .nxfi-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--nav-text3); pointer-events: none; }
  .nxfi-search::placeholder { color: var(--nav-text3); }

  .nxfi-period-btn {
    display: flex; align-items: center; gap: 6px;
    background: var(--nav-period-bg); border: none; border-radius: 10px;
    padding: 7px 12px; cursor: pointer; color: #1565c0;
    font-size: 0.8rem; font-weight: 600; transition: all 0.15s;
    font-family: 'Sora', sans-serif;
  }
  .nxfi-period-btn:hover { background: var(--nav-period-hover); }

  .nxfi-icon-btn {
    width: 36px; height: 36px; border: none; cursor: pointer;
    border-radius: 10px; background: var(--nav-icon-bg); color: var(--nav-text2);
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; position: relative;
  }
  .nxfi-icon-btn:hover { background: var(--nav-icon-hover); color: var(--nav-link-hover-color); }
  .nxfi-notif-dot { position: absolute; top: 7px; right: 7px; width: 7px; height: 7px; border-radius: 50%; background: #ef4444; border: 1.5px solid var(--nav-bg); }

  .nxfi-avatar-btn {
    display: flex; align-items: center; gap: 8px;
    background: none; border: none; cursor: pointer;
    padding: 4px 8px 4px 4px; border-radius: 12px;
    transition: background 0.15s;
  }
  .nxfi-avatar-btn:hover { background: var(--nav-link-hover-bg); }
  .nxfi-avatar {
    width: 34px; height: 34px; border-radius: 10px;
    background: linear-gradient(135deg, #1565c0, #42a5f5);
    display: flex; align-items: center; justify-content: center;
    color: white; font-weight: 700; font-size: 0.875rem; flex-shrink: 0;
  }
  .nxfi-avatar-name { font-size: 0.78rem; font-weight: 600; color: var(--nav-text); line-height: 1.2; }
  .nxfi-avatar-role { font-size: 0.68rem; color: var(--nav-text3); }

  /* ── Dropdowns ── */
  .nxfi-dropdown {
    position: absolute; top: calc(100% + 8px);
    background: var(--nav-drop-bg); border: 1px solid var(--nav-drop-border);
    border-radius: 14px; z-index: 100; overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08);
    animation: dropIn 0.18s cubic-bezier(.22,.68,0,1.1) both;
  }
  @keyframes dropIn { from { opacity: 0; transform: translateY(-6px) scale(0.97); } to { opacity: 1; transform: none; } }

  .nxfi-notif-drop { right: 0; width: 320px; }
  .nxfi-notif-header {
    padding: 14px 16px 10px; border-bottom: 1px solid var(--nav-drop-div);
    display: flex; align-items: center; justify-content: space-between;
  }
  .nxfi-notif-header h3 { font-size: 0.82rem; font-weight: 700; color: var(--nav-text); }
  .nxfi-notif-header button { font-size: 0.72rem; color: #1565c0; background: none; border: none; cursor: pointer; font-weight: 600; font-family: 'Sora', sans-serif; }
  .nxfi-notif-item {
    display: flex; gap: 10px; padding: 12px 16px;
    border-bottom: 1px solid var(--nav-drop-div); transition: background 0.12s; cursor: pointer;
  }
  .nxfi-notif-item:last-child { border-bottom: none; }
  .nxfi-notif-item:hover { background: var(--nav-notif-hover); }
  .nxfi-notif-dot2 { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
  .nxfi-notif-title { font-size: 0.78rem; font-weight: 600; color: var(--nav-text); }
  .nxfi-notif-desc { font-size: 0.72rem; color: var(--nav-text2); margin-top: 2px; line-height: 1.4; }
  .nxfi-notif-time { font-size: 0.68rem; color: var(--nav-text3); margin-top: 4px; font-family: 'JetBrains Mono', monospace; }

  .nxfi-user-drop { right: 0; width: 220px; }
  .nxfi-user-drop-header { padding: 14px 16px 12px; border-bottom: 1px solid var(--nav-drop-div); }
  .nxfi-user-drop-name { font-size: 0.82rem; font-weight: 700; color: var(--nav-text); }
  .nxfi-user-drop-email { font-size: 0.72rem; color: var(--nav-text3); margin-top: 2px; }
  .nxfi-drop-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 16px; font-size: 0.8rem; font-weight: 500;
    color: var(--nav-text2); cursor: pointer; transition: all 0.12s;
    background: none; border: none; width: 100%; text-align: left;
    font-family: 'Sora', sans-serif;
  }
  .nxfi-drop-item:hover { background: var(--nav-drop-item-hover); color: var(--nav-link-hover-color); }
  .nxfi-drop-item.danger:hover { background: #fff1f2; color: #ef4444; }
  .nxfi-drop-divider { height: 1px; background: var(--nav-drop-div); margin: 4px 0; }

  /* ── Sidebar (mobile drawer) ── */
  .nxfi-sidebar-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 60; backdrop-filter: blur(2px); animation: fadeIn 0.2s ease both; }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  .nxfi-sidebar {
    position: fixed; top: 0; left: 0; height: 100vh; z-index: 70;
    width: 260px; display: flex; flex-direction: column;
    background: linear-gradient(180deg, #0a1628 0%, #0d2247 60%, #0e3372 100%);
    border-right: 1px solid rgba(255,255,255,0.05);
    animation: slideInLeft 0.25s cubic-bezier(.22,.68,0,1.1) both;
    overflow-y: auto;
  }
  @keyframes slideInLeft { from { transform: translateX(-100%); } to { transform: translateX(0); } }
  .nxfi-sidebar-logo { display: flex; align-items: center; justify-content: space-between; padding: 20px 20px 18px; border-bottom: 1px solid rgba(255,255,255,0.06); }
  .nxfi-sidebar-logo-inner { display: flex; align-items: center; gap: 10px; }
  .nxfi-sidebar-logo-text { font-size: 1.1rem; font-weight: 800; color: white; letter-spacing: -0.02em; }
  .nxfi-sidebar-logo-text span { color: #42a5f5; }
  .nxfi-sidebar-close { background: rgba(255,255,255,0.06); border: none; border-radius: 8px; width: 30px; height: 30px; cursor: pointer; color: rgba(255,255,255,0.4); display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
  .nxfi-sidebar-close:hover { background: rgba(255,255,255,0.12); color: white; }
  .nxfi-sidebar-nav { flex: 1; padding: 16px 12px; }
  .nxfi-sidebar-section { font-size: 0.65rem; font-weight: 700; color: rgba(255,255,255,0.25); letter-spacing: 0.1em; text-transform: uppercase; padding: 0 12px; margin: 12px 0 6px; }
  .nxfi-sidebar-link {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; border-radius: 10px;
    text-decoration: none; font-size: 0.82rem; font-weight: 500;
    color: rgba(147,197,253,0.55); margin-bottom: 2px;
    transition: all 0.15s; border: 1.5px solid transparent;
  }
  .nxfi-sidebar-link:hover { color: white; background: rgba(255,255,255,0.06); }
  .nxfi-sidebar-link.active { color: white; background: rgba(21,101,192,0.25); border-color: rgba(66,165,245,0.2); font-weight: 600; }
  .nxfi-sidebar-link .dot { width: 6px; height: 6px; border-radius: 50%; background: #42a5f5; margin-left: auto; }
  .nxfi-sidebar-link .badge { margin-left: auto; background: #ef4444; color: white; font-size: 0.65rem; font-weight: 700; padding: 1px 6px; border-radius: 100px; font-family: 'JetBrains Mono', monospace; }
  .nxfi-sidebar-footer { padding: 12px; border-top: 1px solid rgba(255,255,255,0.06); }
  .nxfi-sidebar-footer-btn { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px; font-size: 0.82rem; font-weight: 500; cursor: pointer; width: 100%; background: none; border: none; transition: all 0.15s; font-family: 'Sora', sans-serif; color: rgba(147,197,253,0.55); }
  .nxfi-sidebar-footer-btn:hover { color: white; background: rgba(255,255,255,0.06); }
  .nxfi-sidebar-footer-btn.danger:hover { color: #fca5a5; background: rgba(239,68,68,0.08); }

  /* ── Mobile bottom nav ── */
  .nxfi-mobile-nav {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 40;
    background: var(--nav-mobile-bg); border-top: 1px solid var(--nav-mobile-border);
    box-shadow: var(--nav-mobile-shadow);
    display: flex; justify-content: space-around; align-items: center;
    padding: 6px 8px 10px;
  }
  .nxfi-mobile-link { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 12px; border-radius: 12px; text-decoration: none; transition: all 0.15s; color: var(--nav-text3); font-size: 0.65rem; font-weight: 500; }
  .nxfi-mobile-link:hover { color: var(--nav-link-hover-color); background: var(--nav-link-hover-bg); }
  .nxfi-mobile-link.active { color: #1565c0; }

  /* Responsive */
  @media (max-width: 1024px) { .nxfi-nav-links, .nxfi-search-wrap { display: none; } .nxfi-avatar-info { display: none; } .nxfi-period-label { display: none; } }
  @media (min-width: 1025px) { .nxfi-hamburger { display: none; } .nxfi-mobile-nav { display: none; } }
`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function Navbar({
  user = { displayName: "Carlos Mendes", email: "carlos@nexusfi.com" },
  period = "Out 2024",
  activePath = "/dashboard",
  onLogout,
}: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);

  const { dark, toggle } = useTheme();

  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const initial = user?.displayName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U";
  const firstName = user?.displayName?.split(" ")[0] ?? "Usuário";
  const unreadCount = notifications.length;

  return (
    <>
      <style>{css}</style>

      {/* ── Top Navbar ── */}
      <nav className="nxfi-nav">
        <button className="nxfi-icon-btn nxfi-hamburger" onClick={() => setMobileOpen(true)}>
          <Menu size={18} />
        </button>

        <a href="/dashboard" className="nxfi-logo">
          <div className="nxfi-logo-icon"><ClipboardList size={16} color="white" /></div>
          <span className="nxfi-logo-text">Nexus<span>Fi</span></span>
        </a>

        <div className="nxfi-nav-links">
          {navItems.map((item) => (
            <a key={item.label} href={item.href} className={`nxfi-nav-link ${activePath === item.href ? "active" : ""}`}>
              <item.icon size={14} />
              {item.label}
              {item.badge && <span className="badge">{item.badge}</span>}
            </a>
          ))}
        </div>

        <div className="nxfi-actions">
          <div className="nxfi-search-wrap">
            <Search size={13} className="nxfi-search-icon" />
            <input className="nxfi-search" placeholder="Buscar transações..." />
          </div>

          <button className="nxfi-period-btn">
            <Calendar size={13} />
            <span className="nxfi-period-label">{period}</span>
            <ChevronDown size={11} />
          </button>

          
          <button onClick={toggle} className="cursor-pointer">
            {dark ? <Sun size={16} /> : <Moon size={16} className="text-slate-900/60" />}
          </button>

          {/* Notifications */}
          <div ref={notifRef} style={{ position: "relative" }}>
            <button className="nxfi-icon-btn" onClick={() => { setNotifOpen(!notifOpen); setUserOpen(false); }}>
              <Bell size={16} />
              {unreadCount > 0 && <span className="nxfi-notif-dot" />}
            </button>
            {notifOpen && (
              <div className="nxfi-dropdown nxfi-notif-drop">
                <div className="nxfi-notif-header">
                  <h3>Notificações <span style={{ color: "var(--nav-text3)", fontWeight: 400 }}>({unreadCount})</span></h3>
                  <button>Marcar como lido</button>
                </div>
                {notifications.map((n) => (
                  <div key={n.id} className="nxfi-notif-item">
                    <span className="nxfi-notif-dot2" style={{ background: n.urgent ? "#ef4444" : "#1565c0" }} />
                    <div>
                      <div className="nxfi-notif-title">{n.title}</div>
                      <div className="nxfi-notif-desc">{n.desc}</div>
                      <div className="nxfi-notif-time">{n.time}</div>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "10px 16px", borderTop: "1px solid var(--nav-drop-div)" }}>
                  <button style={{ width: "100%", background: "var(--nav-period-bg)", border: "none", borderRadius: 8, padding: "7px 0", fontSize: "0.78rem", fontWeight: 600, color: "#1565c0", cursor: "pointer", fontFamily: "Sora, sans-serif" }}>
                    Ver todas as notificações
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* User menu */}
          <div ref={userRef} style={{ position: "relative" }}>
            <button className="nxfi-avatar-btn" onClick={() => { setUserOpen(!userOpen); setNotifOpen(false); }}>
              <div className="nxfi-avatar">{initial}</div>
              <div className="nxfi-avatar-info">
                <div className="nxfi-avatar-name">{firstName}</div>
                <div className="nxfi-avatar-role">Administrador</div>
              </div>
              <ChevronDown size={13} style={{ color: "var(--nav-text3)", marginLeft: 2 }} />
            </button>
            {userOpen && (
              <div className="nxfi-dropdown nxfi-user-drop">
                <div className="nxfi-user-drop-header">
                  <div className="nxfi-user-drop-name">{user?.displayName ?? "Usuário"}</div>
                  <div className="nxfi-user-drop-email">{user?.email}</div>
                </div>
                <div style={{ padding: "6px 0" }}>
                  {[
                    { icon: UserCircle, label: "Meu perfil" },
                    { icon: Zap, label: "Plano & faturamento" },
                    { icon: HelpCircle, label: "Ajuda & suporte" },
                    { icon: Settings, label: "Configurações" },
                  ].map((item) => (
                    <button key={item.label} className="nxfi-drop-item">
                      <item.icon size={14} />
                      {item.label}
                    </button>
                  ))}
                  <div className="nxfi-drop-divider" />
                  <button className="nxfi-drop-item danger" onClick={onLogout}>
                    <LogOut size={14} />
                    Sair da conta
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* ── Mobile Sidebar Drawer ── */}
      {mobileOpen && (
        <>
          <div className="nxfi-sidebar-overlay" onClick={() => setMobileOpen(false)} />
          <aside className="nxfi-sidebar">
            <div className="nxfi-sidebar-logo">
              <div className="nxfi-sidebar-logo-inner">
                <div className="nxfi-logo-icon"><ClipboardList size={16} color="white" /></div>
                <span className="nxfi-sidebar-logo-text">Nexus<span>Fi</span></span>
              </div>
              <button className="nxfi-sidebar-close" onClick={() => setMobileOpen(false)}>
                <X size={15} />
              </button>
            </div>
            <nav className="nxfi-sidebar-nav">
              <div className="nxfi-sidebar-section">Menu principal</div>
              {navItems.map((item) => (
                <a key={item.label} href={item.href} className={`nxfi-sidebar-link ${activePath === item.href ? "active" : ""}`} onClick={() => setMobileOpen(false)}>
                  <item.icon size={16} />
                  {item.label}
                  {activePath === item.href && <span className="dot" />}
                  {item.badge && <span className="badge">{item.badge}</span>}
                </a>
              ))}
            </nav>
            <div className="nxfi-sidebar-footer">
              
              <button onClick={toggle}>
                {dark ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button className="nxfi-sidebar-footer-btn"><Settings size={16} />Configurações</button>
              <button className="nxfi-sidebar-footer-btn danger" onClick={onLogout}><LogOut size={16} />Sair da conta</button>
            </div>
          </aside>
        </>
      )}

      {/* ── Mobile Bottom Nav ── */}
      <nav className="nxfi-mobile-nav">
        {[
          { icon: LayoutDashboard, label: "Início", href: "/dashboard" },
          { icon: TrendingUp, label: "Caixa", href: "/fluxo-caixa" },
          { icon: FileText, label: "Relatórios", href: "/relatorios" },
          { icon: CreditCard, label: "Contas", href: "/contasPagar" },
          { icon: Settings, label: "Config.", href: "#" },
        ].map((item) => (
          <a key={item.label} href={item.href} className={`nxfi-mobile-link ${activePath === item.href ? "active" : ""}`}>
            <item.icon size={20} strokeWidth={activePath === item.href ? 2.5 : 1.8} />
            {item.label}
          </a>
        ))}
      </nav>
    </>
  );
}