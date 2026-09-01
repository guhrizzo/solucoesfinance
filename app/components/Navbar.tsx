"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, TrendingUp, FileText, CreditCard, DollarSign,
  BarChart2, Users, Bell, Search, ChevronDown, ChevronLeft, ChevronRight,
  Calendar, Settings, LogOut, Menu, X, HelpCircle, UserCircle, Moon, Sun,
  Zap, PanelLeft, Landmark, Boxes, ShoppingCart,
} from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { useNavbarLayout } from "../hooks/useNavbarLayout";
import { useToast } from "./useToast";
import { ToastContainer } from "./ToastContainer";
import { useBillBadges } from "./Usebillbadges";
import { useReceivableBadges } from "./useReceivableBadges";
import { useAccountScope, hasPermission } from "../hooks/useAccountScope";
import { usePeriod } from "../hooks/usePeriod";
import { MonthPickerModal } from "./MonthPickerModal";
import type { PermissionKey } from "@/lib/accountScope";

interface NavItem { icon: React.ElementType; label: string; href: string; badge?: number; permKey?: PermissionKey; }
interface NavbarProps {
  user?: { displayName: string | null; email: string | null; uid?: string | null } | null;
  activePath?: string;
  onLogout?: () => void;
  /** Esconde o seletor de mês (páginas sem recorte mensal: Fluxo de caixa,
   *  Estoque, Usuários). O mês em si vem sempre do contexto global
   *  `usePeriod()` — ver app/hooks/usePeriod.tsx. */
  hidePeriod?: boolean;
}

// `permKey` liga cada item à categoria de app/lib/accountScope.ts — item sem
// `permKey` (só "Usuários", a própria conta) fica sempre visível pra
// qualquer um, dono ou membro.
const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", permKey: "dashboard" },
  { icon: TrendingUp, label: "Fluxo de caixa", href: "/fluxo-caixa", permKey: "fluxoCaixa" },
  { icon: FileText, label: "Relatórios", href: "/relatorios", permKey: "relatorios" },
  { icon: CreditCard, label: "Contas a pagar", href: "/contasPagar", permKey: "contasPagar" },
  { icon: Landmark, label: "Impostos", href:"/impostos", permKey: "impostos" },
  { icon: DollarSign, label: "Contas a receber", href: "/contasReceber", permKey: "contasReceber" },
  { icon: BarChart2, label: "Centro de custos", href: "/costCenter", permKey: "centroCustos" },
  { icon: Boxes, label: "Estoque", href: "/estoque", permKey: "estoque" },
  { icon: ShoppingCart, label: "Painel de vendas", href: "/vendas", permKey: "vendas" },
  { icon: Users, label: "Usuários", href: "/users" },

];

const notifications = [
  { id: 1, title: "Vencimento próximo", desc: "Simples Nacional vence em 2 dias", time: "há 10 min", urgent: true },
  { id: 2, title: "Nova transação", desc: "Recebimento de Delta Tecnologia — R$ 134.000", time: "há 35 min", urgent: false },
  { id: 3, title: "Meta atingida", desc: "Lucro líquido superou projeção de outubro", time: "há 2h", urgent: false },
];

const css = `
  /* --nav-* tokens now live in app/globals.css as the single source of truth
     (previously duplicated here with its own hardcoded light/dark values). */

  .nxfi-nav *, .nxfi-sidebar *, .nxfi-mobile-nav * {
    font-family: 'Sora', sans-serif;
    box-sizing: border-box;
    transition: background-color .2s, border-color .2s, color .15s;
  }
  .nxfi-nav .mono, .nxfi-sidebar .mono { font-family: 'JetBrains Mono', monospace; }

  .nxfi-nav {
    position: sticky; top: 0; z-index: 50;
    background: var(--nav-bg);
    border-bottom: 1px solid var(--nav-border);
    box-shadow: var(--nav-shadow);
    display: flex; align-items: center;
    padding: 0 2rem; height: 64px; gap: 1rem;
  }

  .nxfi-logo { display: flex; align-items: center; gap: 10px; text-decoration: none; flex-shrink: 0; }
  .nxfi-logo-icon {
    width: 34px; height: 34px; border-radius: 10px;
    background: linear-gradient(135deg, var(--brand-500), var(--brand-400));
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(21,101,192,0.3);
  }
  .nxfi-logo-text { font-weight: 800; font-size: 1.1rem; color: var(--nav-text); letter-spacing: -0.03em; }
  .nxfi-logo-text span { color: var(--brand-500); }

  .nxfi-nav-links { display: flex; align-items: center; gap: 2px; flex: 1; overflow: hidden; }
  .nxfi-nav-link {
    display: flex; align-items: center; gap: 6px;
    padding: 6px 12px; border-radius: 10px;
    text-decoration: none; font-size: 0.8rem; font-weight: 500;
    color: var(--nav-text-2); white-space: nowrap;
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
  .nxfi-nav-link .badge.green {
    background: #10b981; color: white;
  }

  .nxfi-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

  .nxfi-search-wrap { position: relative; }
  .nxfi-search {
    background: var(--nav-input-bg); border: 1.5px solid transparent;
    border-radius: 10px; padding: 7px 12px 7px 34px;
    font-size: 0.8rem; color: var(--nav-text); outline: none;
    width: 200px; transition: all 0.2s; font-family: 'Sora', sans-serif;
  }
  .nxfi-search:focus {
    border-color: var(--brand-500); background: var(--nav-bg); width: 240px;
    box-shadow: 0 0 0 3px rgba(21,101,192,0.08);
  }
  .nxfi-search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--nav-text-3); pointer-events: none; }
  .nxfi-search::placeholder { color: var(--nav-text-3); }

  .nxfi-period-stepper {
    display: flex; align-items: center; gap: 2px;
    background: var(--nav-period-bg); border-radius: 10px; padding: 2px;
  }
  .nxfi-period-stepper button {
    border: none; background: transparent; cursor: pointer; color: var(--brand-500);
    display: flex; align-items: center; justify-content: center;
    width: 26px; height: 28px; border-radius: 8px; transition: background .15s;
  }
  .nxfi-period-stepper button:hover:not(:disabled) { background: var(--nav-period-hover); }
  .nxfi-period-stepper button:disabled { opacity: .35; cursor: not-allowed; }
  .nxfi-period-current {
    display: flex; align-items: center; gap: 5px; justify-content: center;
    font-size: 0.8rem; font-weight: 600; color: var(--brand-500);
    min-width: 84px; text-align: center; font-family: 'Sora', sans-serif;
    white-space: nowrap;
  }
  .nxfi-period-stepper button.nxfi-period-current {
    width: auto; height: 28px; padding: 0 8px; background: transparent;
  }
  .nxfi-period-stepper button.nxfi-period-current:hover { background: var(--nav-period-hover); }
  .nxfi-vertical-period { padding: 14px 12px 2px; flex-shrink: 0; }
  .nxfi-vertical-period .nxfi-period-stepper { width: 100%; justify-content: space-between; padding: 3px; }
  .nxfi-vertical-period .nxfi-period-current { flex: 1; }

  .nxfi-icon-btn {
    width: 36px; height: 36px; border: none; cursor: pointer;
    border-radius: 10px; background: var(--nav-icon-bg); color: var(--nav-text-2);
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; position: relative;
  }
  .nxfi-icon-btn:hover { background: var(--nav-icon-hover); color: var(--nav-link-hover-color); }
  .nxfi-notif-dot { position: absolute; top: 7px; right: 7px; width: 7px; height: 7px; border-radius: 50%; background: #ef4444; border: 1.5px solid var(--nav-bg); }

  .nxfi-avatar-btn {
    display: flex; align-items: center; gap: 8px;
    background: none; border: none; cursor: pointer;
    padding: 4px 8px 4px 4px; border-radius: 12px; transition: background 0.15s;
  }
  .nxfi-avatar-btn:hover { background: var(--nav-link-hover-bg); }
  .nxfi-avatar {
    width: 34px; height: 34px; border-radius: 10px;
    background: linear-gradient(135deg, var(--brand-500), var(--brand-400));
    display: flex; align-items: center; justify-content: center;
    color: white; font-weight: 700; font-size: 0.875rem; flex-shrink: 0;
  }
  .nxfi-avatar-name { font-size: 0.78rem; font-weight: 600; color: var(--nav-text); line-height: 1.2; }
  .nxfi-avatar-role { font-size: 0.68rem; color: var(--nav-text-3); }

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
  .nxfi-notif-header button { font-size: 0.72rem; color: var(--brand-500); background: none; border: none; cursor: pointer; font-weight: 600; font-family: 'Sora', sans-serif; }
  .nxfi-notif-item {
    display: flex; gap: 10px; padding: 12px 16px;
    border-bottom: 1px solid var(--nav-drop-div); transition: background 0.12s; cursor: pointer;
  }
  .nxfi-notif-item:last-child { border-bottom: none; }
  .nxfi-notif-item:hover { background: var(--nav-notif-hover); }
  .nxfi-notif-dot2 { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex-shrink: 0; }
  .nxfi-notif-title { font-size: 0.78rem; font-weight: 600; color: var(--nav-text); }
  .nxfi-notif-desc  { font-size: 0.72rem; color: var(--nav-text-2); margin-top: 2px; line-height: 1.4; }
  .nxfi-notif-time  { font-size: 0.68rem; color: var(--nav-text-3); margin-top: 4px; font-family: 'JetBrains Mono', monospace; }

  .nxfi-user-drop { right: 0; width: 220px; }
  .nxfi-user-drop-header { padding: 14px 16px 12px; border-bottom: 1px solid var(--nav-drop-div); }
  .nxfi-user-drop-name  { font-size: 0.82rem; font-weight: 700; color: var(--nav-text); }
  .nxfi-user-drop-email { font-size: 0.72rem; color: var(--nav-text-3); margin-top: 2px; }
  .nxfi-drop-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 16px; font-size: 0.8rem; font-weight: 500;
    color: var(--nav-text-2); cursor: pointer; transition: all 0.12s;
    background: none; border: none; width: 100%; text-align: left;
    font-family: 'Sora', sans-serif;
  }
  .nxfi-drop-item:hover { background: var(--nav-drop-item-hover); color: var(--nav-link-hover-color); }
  .nxfi-drop-item.danger:hover { background: #fff1f2; color: #ef4444; }
  .nxfi-drop-divider { height: 1px; background: var(--nav-drop-div); margin: 4px 0; }

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
  .nxfi-sidebar-logo-text span { color: var(--brand-400); }
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
  .nxfi-sidebar-link .dot   { width: 6px; height: 6px; border-radius: 50%; background: var(--brand-400); margin-left: auto; }
  .nxfi-sidebar-link .badge { margin-left: auto; background: #ef4444; color: white; font-size: 0.65rem; font-weight: 700; padding: 1px 6px; border-radius: 100px; font-family: 'JetBrains Mono', monospace; }
  .nxfi-sidebar-link .badge.green { background: #10b981; color: white; }
  .nxfi-sidebar-footer { padding: 12px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; gap: 4px; }
  .nxfi-sidebar-footer-btn { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px; font-size: 0.82rem; font-weight: 500; cursor: pointer; width: 100%; background: none; border: none; transition: all 0.15s; font-family: 'Sora', sans-serif; color: rgba(147,197,253,0.55); }
  .nxfi-sidebar-footer-btn:hover { color: white; background: rgba(255,255,255,0.06); }
  .nxfi-sidebar-footer-btn.danger:hover { color: #fca5a5; background: rgba(239,68,68,0.08); }

  .nxfi-mobile-nav {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 40;
    background: var(--nav-bg); border-top: 1px solid var(--nav-border);
    box-shadow: var(--nav-shadow);
    display: flex; justify-content: space-around; align-items: center;
    padding: 6px 8px 10px;
    overflow-x: auto;
  }

  /* Barra superior mobile — usada no layout vertical (sidebar), onde não
     existe a .nxfi-nav pra abrigar o botão de menu. Some no desktop. */
  .nxfi-mobile-topbar {
    display: none;
    position: sticky; top: 0; z-index: 45;
    align-items: center; gap: 12px;
    height: 56px; padding: 0 16px; flex-shrink: 0;
    background: var(--nav-bg); border-bottom: 1px solid var(--nav-border);
    box-shadow: var(--nav-shadow);
  }
  .nxfi-mobile-topbar .nxfi-icon-btn { flex-shrink: 0; }
  .nxfi-mobile-link { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 12px; border-radius: 12px; text-decoration: none; transition: all 0.15s; color: var(--nav-text-3); font-size: 0.65rem; font-weight: 500; position: relative; }
  .nxfi-mobile-link:hover { color: var(--nav-link-hover-color); background: var(--nav-link-hover-bg); }
  .nxfi-mobile-link.active { color: var(--brand-500); }
  .nxfi-mobile-link .badge {
    position: absolute; top: 0; right: 4px;
    background: #ef4444; color: white; font-size: 0.65rem;
    font-weight: 700; padding: 1px 5px; border-radius: 100px;
    font-family: 'JetBrains Mono', monospace; line-height: 1;
  }
  .nxfi-mobile-link .badge.green {
    background: #10b981; color: white;
  }

  .nxfi-sidebar-vertical {
    position: fixed; top: 0; left: 0; height: 100vh; z-index: 50;
    width: var(--nav-sidebar-width); display: flex; flex-direction: column; flex-shrink: 0;
    background: var(--nav-bg);
    overflow-y: auto; overflow-x: hidden;
  }
  .nxfi-vertical-logo {
    display: flex; align-items: center; gap: 10px;
    padding: 20px; border-bottom: 1px solid var(--nav-border);
    text-decoration: none; font-weight: 800; font-size: 1.1rem;
    color: var(--nav-text); letter-spacing: -0.03em; flex-shrink: 0;
  }
  .nxfi-vertical-logo span { color: var(--brand-500); }
  .nxfi-vertical-nav { flex: 1; padding: 16px 8px; overflow-y: auto; }
  .nxfi-vertical-section {
    font-size: 0.65rem; font-weight: 700; color: var(--nav-text-3);
    letter-spacing: 0.1em; text-transform: uppercase;
    padding: 0 12px; margin: 12px 0 6px;
  }
  .nxfi-vertical-link {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; border-radius: 10px;
    text-decoration: none; font-size: 0.82rem; font-weight: 500;
    color: var(--nav-text-2); margin-bottom: 2px;
    transition: all 0.15s; border: 1.5px solid transparent;
  }
  .nxfi-vertical-link:hover { color: var(--nav-link-hover-color); background: var(--nav-link-hover-bg); }
  .nxfi-vertical-link.active {
    color: var(--nav-link-hover-color); background: var(--nav-link-active-bg);
    border-color: var(--nav-link-active-border); font-weight: 600;
  }
  .nxfi-vertical-link .badge {
    background: #ef4444; color: white; font-size: 0.65rem;
    font-weight: 700; padding: 1px 5px; border-radius: 100px;
    font-family: 'JetBrains Mono', monospace; line-height: 1.4; margin-left: auto;
  }
  .nxfi-vertical-link .badge.green {
    background: #10b981; color: white; margin-left: auto;
  }
  .nxfi-vertical-footer {
    padding: 12px 8px; border-top: 1px solid var(--nav-border);
    display: flex; flex-direction: column; gap: 2px; flex-shrink: 0;
  }
  .nxfi-vertical-footer-btn {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; border-radius: 10px; font-size: 0.82rem;
    font-weight: 500; cursor: pointer; width: 100%; background: none;
    border: none; transition: all 0.15s; font-family: 'Sora', sans-serif;
    color: var(--nav-text-2);
  }
  .nxfi-vertical-footer-btn:hover { color: var(--nav-link-hover-color); background: var(--nav-link-hover-bg); }
  .nxfi-vertical-footer-btn.danger:hover { color: #ef4444; background: rgba(239,68,68,0.08); }

  @media (max-width: 1024px) {
    .nxfi-nav-links, .nxfi-search-wrap { display: none; }
    .nxfi-avatar-info { display: none; }
    .nxfi-sidebar-vertical { display: none; }
    .nxfi-mobile-topbar { display: flex; }
  }
  @media (min-width: 1025px) {
    .nxfi-hamburger { display: none; }
    .nxfi-mobile-nav { display: none; }
    .nxfi-mobile-topbar { display: none; }
  }
`;

export default function Navbar({
  user = { displayName: "Carlos Mendes", email: "carlos@nexusfi.com" },
  activePath = "/dashboard",
  onLogout,
  hidePeriod = false,
}: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [isServico, setIsServico] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const router = useRouter();
  const { dark, toggle } = useTheme();
  const { layout, toggle: toggleLayout } = useNavbarLayout();
  const { toasts, show: showToast, remove: removeToast } = useToast();
  const { billSummary } = useBillBadges();
  const { receivableSummary } = useReceivableBadges();
  const scope = useAccountScope();
  const periodCtx = usePeriod();

  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Monitora o ramo do usuário (serviço ou outro)
  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    (async () => {
      try {
        const { getFirebase } = await import("@/lib/firebase");
        const { db, auth } = await getFirebase();
        const { onAuthStateChanged } = await import("firebase/auth");
        const { doc, getDoc } = await import("firebase/firestore");

        unsubAuth = onAuthStateChanged(auth, async (u) => {
          if (u) {
            // Tenta obter o cache do localStorage imediatamente para evitar flash/layout shift
            const cached = localStorage.getItem(`onboarding_ramo_${u.uid}`);
            if (cached) {
              try {
                const ramo = JSON.parse(cached);
                setIsServico(ramo.includes("Serviço"));
              } catch (e) {}
            }

            // Busca no Firestore para confirmar o estado real
            const snap = await getDoc(doc(db, "users", u.uid, "profile", "onboarding"));
            if (snap.exists()) {
              const answers = snap.data()?.answers;
              const ramo = answers?.ramo || [];
              const hasServico = ramo.includes("Serviço");
              setIsServico(hasServico);
              localStorage.setItem(`onboarding_ramo_${u.uid}`, JSON.stringify(ramo));
            }
          }
        });
      } catch (err) {
        console.error("Erro ao verificar ramo do usuário no Navbar:", err);
      }
    })();

    return () => unsubAuth?.();
  }, []);

  // O recuo do conteúdo para o layout vertical é feito pelo AppShell (CSS, ver globals.css .app-shell)

  const initial = user?.displayName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? "U";
  const firstName = user?.displayName?.split(" ")[0] ?? "Usuário";
  const unreadCount = notifications.length;

  // Filtra itens com base no ramo (oculta estoque para serviços) e, pra
  // membros de equipe convidados (não o dono da conta), com base na
  // permissão por categoria — "Usuários" (permKey ausente) fica sempre
  // visível, é a própria conta de quem está logado.
  const filteredNavItems = navItems.filter(item => {
    if ((item.label === "Estoque" || item.label === "Painel de vendas") && isServico) return false;
    if (item.permKey && !scope.loading && !hasPermission(scope, item.permKey)) return false;
    return true;
  });

  // Cria dinamicamente os navItems com badges reais
  const navItemsWithBadges = filteredNavItems.map(item => {
    if (item.label === "Contas a pagar") {
      return { ...item, badge: billSummary.totalPending };
    }
    if (item.label === "Contas a receber") {
      return { ...item, badge: receivableSummary.totalPending };
    }
    return item;
  });

  // Handler para logout com toast
  const handleLogout = async () => {
    showToast("Desconectando...", "info");
    setTimeout(() => {
      onLogout?.();
    }, 1500);
  };

  // Handler para marcar como lido com toast
  const handleMarkAsRead = () => {
    showToast("Notificações marcadas como lidas", "success");
    setNotifOpen(false);
  };

  // ── Seletor de período (mês) ──
  // Stepper interativo ligado ao mês global (usePeriod). Páginas sem recorte
  // mensal passam <Navbar hidePeriod /> e o controle não aparece.
  const periodControl = (block = false) => {
    if (hidePeriod) return null;
    const stepper = (
      <div className="nxfi-period-stepper">
        <button onClick={periodCtx.goPrevMonth} aria-label="Mês anterior" type="button">
          <ChevronLeft size={15} />
        </button>
        <button
          className="nxfi-period-current"
          onClick={() => setMonthPickerOpen(true)}
          type="button"
          aria-label="Escolher mês"
        >
          <Calendar size={12} />
          {periodCtx.label}
        </button>
        <button onClick={periodCtx.goNextMonth} aria-label="Próximo mês" type="button">
          <ChevronRight size={15} />
        </button>
      </div>
    );
    return block ? <div className="nxfi-vertical-period">{stepper}</div> : stepper;
  };

  // ── Sidebar vertical via Portal ──
  const sidebarJSX = (
    <>
      <style>{css}</style>
      <aside className="nxfi-sidebar-vertical">
        <a href="/dashboard" className="nxfi-vertical-logo">
          <img src={dark ? "/nexus_fi_logo_branco.png" : "/nexus_fi_logo_preto.png"} alt="NexusFi" style={{ height: 42, width: "auto" }} />
        </a>
        {periodControl(true)}
        <nav className="nxfi-vertical-nav">
          <div className="nxfi-vertical-section">Menu Principal</div>
          {navItemsWithBadges.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`nxfi-vertical-link ${activePath === item.href ? "active" : ""}`}
            >
              <item.icon size={16} />
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`badge ${item.label === "Contas a receber" ? "green" : ""}`}>{item.badge}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="nxfi-vertical-footer">
          <button onClick={toggleLayout} className="nxfi-vertical-footer-btn">
            <PanelLeft size={16} />
            <span>Layout Horizontal</span>
          </button>
          <button onClick={toggle} className="nxfi-vertical-footer-btn">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            <span>{dark ? "Modo Claro" : "Modo Escuro"}</span>
          </button>
          <button
            className="nxfi-vertical-footer-btn"
            onClick={() => router.push("/configuracoes")}
          >
            <Settings size={16} />
            <span>Configurações</span>
          </button>
          <button className="nxfi-vertical-footer-btn danger" onClick={handleLogout}>
            <LogOut size={16} />
            <span>Sair</span>
          </button>
        </div>
      </aside>
    </>
  );

  // ── Navegação mobile/tablet compartilhada (drawer + barra inferior) ──
  // Usada tanto no layout horizontal quanto no vertical: em ≤1024px a
  // sidebar (horizontal ou vertical) some e essa navegação assume.
  const mobileDrawerJSX = mobileOpen && (
    <>
      <div className="nxfi-sidebar-overlay" onClick={() => setMobileOpen(false)} />
      <aside className="nxfi-sidebar">
        <div className="nxfi-sidebar-logo">
          <div className="nxfi-sidebar-logo-inner">
            <img src="/nexus_fi_logo_branco.png" alt="NexusFi" style={{ height: 30, width: "auto" }} />
          </div>
          <button className="nxfi-sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Fechar menu">
            <X size={15} />
          </button>
        </div>
        <nav className="nxfi-sidebar-nav">
          <div className="nxfi-sidebar-section">Menu principal</div>
          {navItemsWithBadges.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`nxfi-sidebar-link ${activePath === item.href ? "active" : ""}`}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon size={16} />
              {item.label}
              {activePath === item.href && <span className="dot" />}
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`badge ${item.label === "Contas a receber" ? "green" : ""}`}>{item.badge}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="nxfi-sidebar-footer">
          <button onClick={toggleLayout} className="nxfi-sidebar-footer-btn">
            <PanelLeft size={16} />
            <span>{layout === "vertical" ? "Layout Horizontal" : "Layout Vertical"}</span>
          </button>
          <button className="nxfi-sidebar-footer-btn" onClick={toggle}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            <span>{dark ? "Modo Claro" : "Modo Escuro"}</span>
          </button>
          <button
            className="nxfi-sidebar-footer-btn"
            onClick={() => { setMobileOpen(false); router.push("/configuracoes"); }}
          >
            <Settings size={16} />
            Configurações
          </button>
          <button className="nxfi-sidebar-footer-btn danger" onClick={handleLogout}>
            <LogOut size={16} />
            Sair da conta
          </button>
        </div>
      </aside>
    </>
  );

  const mobileBottomNavJSX = (
    <nav className="nxfi-mobile-nav">
      {navItemsWithBadges.map((item) => (
        <a key={item.label} href={item.href} className={`nxfi-mobile-link ${activePath === item.href ? "active" : ""}`}>
          <div style={{ position: "relative" }}>
            <item.icon size={20} strokeWidth={activePath === item.href ? 2.5 : 1.8} />
            {item.badge !== undefined && item.badge > 0 && (
              <span className={`badge ${item.label === "Contas a receber" ? "green" : ""}`}>{item.badge}</span>
            )}
          </div>
          {item.label}
        </a>
      ))}
    </nav>
  );

  if (layout === "vertical") {
    return (
      <>
        {createPortal(sidebarJSX, document.body)}

        {/* ≤1024px: a sidebar vertical fica oculta, então mostra a barra
            superior com o botão de menu + o drawer + a barra inferior. */}
        <div className="nxfi-mobile-topbar">
          <button className="nxfi-icon-btn" onClick={() => setMobileOpen(true)} aria-label="Abrir menu">
            <Menu size={18} />
          </button>
          <a href="/dashboard" className="nxfi-logo">
            <img src={dark ? "/nexus_fi_logo_branco.png" : "/nexus_fi_logo_preto.png"} alt="NexusFi" style={{ height: 26, width: "auto" }} />
          </a>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {periodControl()}
            <button onClick={toggle} className="nxfi-icon-btn" aria-label="Alternar tema">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>

        {mobileDrawerJSX}
        {mobileBottomNavJSX}

        <ToastContainer toasts={toasts} onRemove={removeToast} />
        {!hidePeriod && (
          <MonthPickerModal
            open={monthPickerOpen}
            onClose={() => setMonthPickerOpen(false)}
            value={periodCtx.refDate}
            onSelect={periodCtx.setMonth}
          />
        )}
      </>
    );
  }

  // ── Layout Horizontal ──
  return (
    <>
      <style>{css}</style>

      <nav className="nxfi-nav">
        <button className="nxfi-icon-btn nxfi-hamburger" onClick={() => setMobileOpen(true)}>
          <Menu size={18} />
        </button>

        <a href="/dashboard" className="nxfi-logo">
          <img src={dark ? "/nexus_fi_logo_branco.png" : "/nexus_fi_logo_preto.png"} alt="NexusFi" style={{ height: 30, width: "auto" }} />
        </a>

        <div className="nxfi-nav-links">
          {navItemsWithBadges.map((item) => (
            <a key={item.label} href={item.href} className={`nxfi-nav-link ${activePath === item.href ? "active" : ""}`}>
              <item.icon size={14} />
              {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`badge ${item.label === "Contas a receber" ? "green" : ""}`}>{item.badge}</span>
              )}
            </a>
          ))}
        </div>

        <div className="nxfi-actions">
          <div className="nxfi-search-wrap">
            <Search size={13} className="nxfi-search-icon" />
            <input className="nxfi-search" placeholder="Buscar transações..." />
          </div>

          {periodControl()}

          <button onClick={toggleLayout} className="nxfi-icon-btn" title="Alternar layout">
            <PanelLeft size={16} />
          </button>

          <button onClick={toggle} className="nxfi-icon-btn">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div ref={notifRef} style={{ position: "relative" }}>
            <button className="nxfi-icon-btn" onClick={() => { setNotifOpen(!notifOpen); setUserOpen(false); }}>
              <Bell size={16} />
              {unreadCount > 0 && <span className="nxfi-notif-dot" />}
            </button>
            {notifOpen && (
              <div className="nxfi-dropdown nxfi-notif-drop">
                <div className="nxfi-notif-header">
                  <h3>Notificações <span style={{ color: "var(--nav-text-3)", fontWeight: 400 }}>({unreadCount})</span></h3>
                  <button onClick={handleMarkAsRead}>Marcar como lido</button>
                </div>
                {notifications.map((n) => (
                  <div key={n.id} className="nxfi-notif-item">
                    <span className="nxfi-notif-dot2" style={{ background: n.urgent ? "#ef4444" : "var(--brand-500)" }} />
                    <div>
                      <div className="nxfi-notif-title">{n.title}</div>
                      <div className="nxfi-notif-desc">{n.desc}</div>
                      <div className="nxfi-notif-time">{n.time}</div>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "10px 16px", borderTop: "1px solid var(--nav-drop-div)" }}>
                  <button style={{ width: "100%", background: "var(--nav-period-bg)", border: "none", borderRadius: 8, padding: "7px 0", fontSize: "0.78rem", fontWeight: 600, color: "var(--brand-500)", cursor: "pointer", fontFamily: "Sora, sans-serif" }}>
                    Ver todas as notificações
                  </button>
                </div>
              </div>
            )}
          </div>

          <div ref={userRef} style={{ position: "relative" }}>
            <button className="nxfi-avatar-btn" onClick={() => { setUserOpen(!userOpen); setNotifOpen(false); }}>
              <div className="nxfi-avatar">{initial}</div>
              <div className="nxfi-avatar-info">
                <div className="nxfi-avatar-name">{firstName}</div>
                <div className="nxfi-avatar-role">{scope.isOwner ? "Administrador" : "Membro de equipe"}</div>
              </div>
              <ChevronDown size={13} style={{ color: "var(--nav-text-3)", marginLeft: 2 }} />
            </button>
            {userOpen && (
              <div className="nxfi-dropdown nxfi-user-drop">
                <div className="nxfi-user-drop-header">
                  <div className="nxfi-user-drop-name">{user?.displayName ?? "Usuário"}</div>
                  <div className="nxfi-user-drop-email">{user?.email}</div>
                </div>
                <div style={{ padding: "6px 0" }}>
                  {[
                    { icon: UserCircle, label: "Meu perfil", action: () => router.push("/users") },
                    { icon: Zap, label: "Plano & faturamento", action: () => showToast("Abrindo plano...", "info") },
                    { icon: HelpCircle, label: "Ajuda & suporte", action: () => showToast("Redirecionando para ajuda...", "info") },
                    { icon: Settings, label: "Configurações", action: () => router.push("/configuracoes") },
                  ].map((item) => (
                    <button key={item.label} className="nxfi-drop-item" onClick={item.action}>
                      <item.icon size={14} />
                      {item.label}
                    </button>
                  ))}
                  <div className="nxfi-drop-divider" />
                  <button className="nxfi-drop-item danger" onClick={handleLogout}>
                    <LogOut size={14} />
                    Sair da conta
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {mobileDrawerJSX}
      {mobileBottomNavJSX}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}