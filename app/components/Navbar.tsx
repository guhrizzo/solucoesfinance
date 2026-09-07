"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  LayoutDashboard, TrendingUp, FileText, CreditCard, DollarSign,
  BarChart2, Users, Bell, Search, ChevronDown, ChevronLeft, ChevronRight,
  Calendar, Settings, LogOut, Menu, X, HelpCircle, UserCircle, Moon, Sun,
  Zap, PanelLeft, Landmark, Boxes, ShoppingCart,
} from "lucide-react";
import { Avatar } from "./ui";
import { useTheme } from "../hooks/useTheme";
import { useNavbarLayout } from "../hooks/useNavbarLayout";
import { useProfilePhoto } from "../hooks/useProfilePhoto";
import { useToast } from "./useToast";
import { ToastContainer } from "./ToastContainer";
import { useBillBadges } from "./Usebillbadges";
import { useReceivableBadges } from "./useReceivableBadges";
import { useAccountScope, hasPermission } from "../hooks/useAccountScope";
import { usePeriod } from "../hooks/usePeriod";
import { MonthPickerModal } from "./MonthPickerModal";
import type { PermissionKey } from "@/lib/accountScope";
import "./Navbar.css";

interface NavItem { key: string; icon: React.ElementType; href: string; badge?: number; permKey?: PermissionKey; }
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
// `key` é o id estável: liga o item ao rótulo em messages/*/nav.json
// (nav.items.<key>), à lógica de filtro/badge abaixo e ao `permKey` de
// app/lib/accountScope.ts. NUNCA comparar pelo texto exibido (traduzido).
const navItems: NavItem[] = [
  { key: "dashboard", icon: LayoutDashboard, href: "/dashboard", permKey: "dashboard" },
  { key: "fluxoCaixa", icon: TrendingUp, href: "/fluxo-caixa", permKey: "fluxoCaixa" },
  { key: "relatorios", icon: FileText, href: "/relatorios", permKey: "relatorios" },
  { key: "contasPagar", icon: CreditCard, href: "/contasPagar", permKey: "contasPagar" },
  { key: "impostos", icon: Landmark, href: "/impostos", permKey: "impostos" },
  { key: "contasReceber", icon: DollarSign, href: "/contasReceber", permKey: "contasReceber" },
  { key: "centroCustos", icon: BarChart2, href: "/costCenter", permKey: "centroCustos" },
  { key: "estoque", icon: Boxes, href: "/estoque", permKey: "estoque" },
  { key: "vendas", icon: ShoppingCart, href: "/vendas", permKey: "vendas" },
  { key: "usuarios", icon: Users, href: "/users" },
];

// Notificações de demonstração — id/urgent ficam no código; texto vem de
// nav.notifications.items (mesma ordem).
const NOTIF_META = [
  { id: 1, urgent: true },
  { id: 2, urgent: false },
  { id: 3, urgent: false },
];

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

  const t = useTranslations("nav");
  const notifItems = t.raw("notifications.items") as { title: string; desc: string; time: string }[];
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
  const notifBtnRef = useRef<HTMLButtonElement>(null);
  const userBtnRef = useRef<HTMLButtonElement>(null);

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Esc fecha o dropdown aberto (notificação ou usuário) e devolve o foco
  // pro botão que abriu.
  useEffect(() => {
    if (!notifOpen && !userOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (notifOpen) {
        setNotifOpen(false);
        notifBtnRef.current?.focus();
      }
      if (userOpen) {
        setUserOpen(false);
        userBtnRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [notifOpen, userOpen]);

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

  const firstName = user?.displayName?.split(" ")[0] ?? t("userMenu.fallbackUser");
  const avatar = useProfilePhoto();
  const unreadCount = NOTIF_META.length;

  // Filtra itens com base no ramo (oculta estoque para serviços) e, pra
  // membros de equipe convidados (não o dono da conta), com base na
  // permissão por categoria — "Usuários" (permKey ausente) fica sempre
  // visível, é a própria conta de quem está logado.
  const filteredNavItems = navItems.filter(item => {
    if ((item.key === "estoque" || item.key === "vendas") && isServico) return false;
    if (item.permKey && !scope.loading && !hasPermission(scope, item.permKey)) return false;
    return true;
  });

  // Cria dinamicamente os navItems com badges reais
  const navItemsWithBadges = filteredNavItems.map(item => {
    if (item.key === "contasPagar") {
      return { ...item, badge: billSummary.totalPending };
    }
    if (item.key === "contasReceber") {
      return { ...item, badge: receivableSummary.totalPending };
    }
    return item;
  });

  // Handler para logout com toast
  const handleLogout = async () => {
    showToast(t("loggingOut"), "info");
    setTimeout(() => {
      onLogout?.();
    }, 1500);
  };

  // Handler para marcar como lido com toast
  const handleMarkAsRead = () => {
    showToast(t("notifications.markedRead"), "success");
    setNotifOpen(false);
  };

  // ── Seletor de período (mês) ──
  // Stepper interativo ligado ao mês global (usePeriod). Páginas sem recorte
  // mensal passam <Navbar hidePeriod /> e o controle não aparece.
  const periodControl = (block = false) => {
    if (hidePeriod) return null;
    const stepper = (
      <div className="nxfi-period-stepper">
        <button onClick={periodCtx.goPrevMonth} aria-label={t("period.prevMonth")} type="button">
          <ChevronLeft size={15} />
        </button>
        <button
          className="nxfi-period-current"
          onClick={() => setMonthPickerOpen(true)}
          type="button"
          aria-label={t("period.chooseMonth")}
        >
          <Calendar size={12} />
          {periodCtx.label}
        </button>
        <button onClick={periodCtx.goNextMonth} aria-label={t("period.nextMonth")} type="button">
          <ChevronRight size={15} />
        </button>
      </div>
    );
    return block ? <div className="nxfi-vertical-period">{stepper}</div> : stepper;
  };

  // ── Sidebar vertical via Portal ──
  const sidebarJSX = (
    <>
      <aside className="nxfi-sidebar-vertical">
        <a href="/dashboard" className="nxfi-vertical-logo">
          <img src={dark ? "/nexus_fi_logo_branco.png" : "/nexus_fi_logo_preto.png"} alt="NexusFi" style={{ height: 42, width: "auto" }} />
        </a>
        {periodControl(true)}
        <nav className="nxfi-vertical-nav">
          <div className="nxfi-vertical-section">{t("menuMain")}</div>
          {navItemsWithBadges.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className={`nxfi-vertical-link ${activePath === item.href ? "active" : ""}`}
            >
              <item.icon size={16} />
              <span style={{ flex: 1 }}>{t(`items.${item.key}`)}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`badge ${item.key === "contasReceber" ? "green" : ""}`}>{item.badge}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="nxfi-vertical-footer">
          <button onClick={toggleLayout} className="nxfi-vertical-footer-btn">
            <PanelLeft size={16} />
            <span>{t("layoutHorizontal")}</span>
          </button>
          <button onClick={toggle} className="nxfi-vertical-footer-btn">
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            <span>{dark ? t("lightMode") : t("darkMode")}</span>
          </button>
          <button
            className="nxfi-vertical-footer-btn"
            onClick={() => router.push("/configuracoes")}
          >
            <Settings size={16} />
            <span>{t("settings")}</span>
          </button>
          <button className="nxfi-vertical-footer-btn danger" onClick={handleLogout}>
            <LogOut size={16} />
            <span>{t("logout")}</span>
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
      {/* Fechar no clique fora é conveniência de mouse — o drawer já tem um
          botão "Fechar menu" com aria-label, totalmente operável por teclado. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="nxfi-sidebar-overlay" onClick={() => setMobileOpen(false)} />
      <aside className="nxfi-sidebar">
        <div className="nxfi-sidebar-logo">
          <div className="nxfi-sidebar-logo-inner">
            <img src="/nexus_fi_logo_branco.png" alt="NexusFi" style={{ height: 30, width: "auto" }} />
          </div>
          <button className="nxfi-sidebar-close" onClick={() => setMobileOpen(false)} aria-label={t("closeMenu")}>
            <X size={15} />
          </button>
        </div>
        <nav className="nxfi-sidebar-nav">
          <div className="nxfi-sidebar-section">{t("menuMain")}</div>
          {navItemsWithBadges.map((item) => (
            <a
              key={item.key}
              href={item.href}
              className={`nxfi-sidebar-link ${activePath === item.href ? "active" : ""}`}
              onClick={() => setMobileOpen(false)}
            >
              <item.icon size={16} />
              {t(`items.${item.key}`)}
              {activePath === item.href && <span className="dot" />}
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`badge ${item.key === "contasReceber" ? "green" : ""}`}>{item.badge}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="nxfi-sidebar-footer">
          <button onClick={toggleLayout} className="nxfi-sidebar-footer-btn">
            <PanelLeft size={16} />
            <span>{layout === "vertical" ? t("layoutHorizontal") : t("layoutVertical")}</span>
          </button>
          <button className="nxfi-sidebar-footer-btn" onClick={toggle}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            <span>{dark ? t("lightMode") : t("darkMode")}</span>
          </button>
          <button
            className="nxfi-sidebar-footer-btn"
            onClick={() => { setMobileOpen(false); router.push("/configuracoes"); }}
          >
            <Settings size={16} />
            {t("settings")}
          </button>
          <button className="nxfi-sidebar-footer-btn danger" onClick={handleLogout}>
            <LogOut size={16} />
            {t("logoutAccount")}
          </button>
        </div>
      </aside>
    </>
  );

  const mobileBottomNavJSX = (
    <nav className="nxfi-mobile-nav">
      {navItemsWithBadges.map((item) => (
        <a key={item.key} href={item.href} className={`nxfi-mobile-link ${activePath === item.href ? "active" : ""}`}>
          <div style={{ position: "relative" }}>
            <item.icon size={20} strokeWidth={activePath === item.href ? 2.5 : 1.8} />
            {item.badge !== undefined && item.badge > 0 && (
              <span className={`badge ${item.key === "contasReceber" ? "green" : ""}`}>{item.badge}</span>
            )}
          </div>
          {t(`items.${item.key}`)}
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
          <button className="nxfi-icon-btn" onClick={() => setMobileOpen(true)} aria-label={t("openMenu")}>
            <Menu size={18} />
          </button>
          <a href="/dashboard" className="nxfi-logo">
            <img src={dark ? "/nexus_fi_logo_branco.png" : "/nexus_fi_logo_preto.png"} alt="NexusFi" style={{ height: 26, width: "auto" }} />
          </a>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {periodControl()}
            <button onClick={toggle} className="nxfi-icon-btn" aria-label={t("toggleTheme")}>
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
      <nav className="nxfi-nav">
        <button className="nxfi-icon-btn nxfi-hamburger" onClick={() => setMobileOpen(true)} aria-label={t("openMenu")}>
          <Menu size={18} />
        </button>

        <a href="/dashboard" className="nxfi-logo">
          <img src={dark ? "/nexus_fi_logo_branco.png" : "/nexus_fi_logo_preto.png"} alt="NexusFi" style={{ height: 30, width: "auto" }} />
        </a>

        <div className="nxfi-nav-links">
          {navItemsWithBadges.map((item) => (
            <a key={item.key} href={item.href} className={`nxfi-nav-link ${activePath === item.href ? "active" : ""}`}>
              <item.icon size={14} />
              {t(`items.${item.key}`)}
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`badge ${item.key === "contasReceber" ? "green" : ""}`}>{item.badge}</span>
              )}
            </a>
          ))}
        </div>

        <div className="nxfi-actions">
          <div className="nxfi-search-wrap">
            <Search size={13} className="nxfi-search-icon" />
            <input className="nxfi-search" placeholder={t("search")} />
          </div>

          {periodControl()}

          <button onClick={toggleLayout} className="nxfi-icon-btn" title={t("toggleLayout")} aria-label={t("toggleLayout")}>
            <PanelLeft size={16} />
          </button>

          <button onClick={toggle} className="nxfi-icon-btn" aria-label={t("toggleTheme")}>
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <div ref={notifRef} style={{ position: "relative" }}>
            <button
              ref={notifBtnRef}
              className="nxfi-icon-btn"
              onClick={() => { setNotifOpen(!notifOpen); setUserOpen(false); }}
              aria-label={t("notifications.label")}
              aria-haspopup="menu"
              aria-expanded={notifOpen}
            >
              <Bell size={16} />
              {unreadCount > 0 && <span className="nxfi-notif-dot" />}
            </button>
            {notifOpen && (
              <div className="nxfi-dropdown nxfi-notif-drop" role="menu">
                <div className="nxfi-notif-header">
                  <h3>{t("notifications.title")} <span style={{ color: "var(--nav-text-3)", fontWeight: 400 }}>({unreadCount})</span></h3>
                  <button onClick={handleMarkAsRead}>{t("notifications.markRead")}</button>
                </div>
                {NOTIF_META.map((n, i) => (
                  <div key={n.id} className="nxfi-notif-item">
                    <span className="nxfi-notif-dot2" style={{ background: n.urgent ? "var(--neg)" : "var(--brand)" }} />
                    <div>
                      <div className="nxfi-notif-title">{notifItems[i]?.title}</div>
                      <div className="nxfi-notif-desc">{notifItems[i]?.desc}</div>
                      <div className="nxfi-notif-time">{notifItems[i]?.time}</div>
                    </div>
                  </div>
                ))}
                <div style={{ padding: "10px 16px", borderTop: "1px solid var(--nav-drop-div)" }}>
                  <button style={{ width: "100%", background: "var(--nav-period-bg)", border: "none", borderRadius: 8, padding: "7px 0", fontSize: "0.78rem", fontWeight: 600, color: "var(--brand-500)", cursor: "pointer", fontFamily: "Sora, sans-serif" }}>
                    {t("notifications.seeAll")}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div ref={userRef} style={{ position: "relative" }}>
            <button
              ref={userBtnRef}
              className="nxfi-avatar-btn"
              onClick={() => { setUserOpen(!userOpen); setNotifOpen(false); }}
              aria-label={t("userMenu.label")}
              aria-haspopup="menu"
              aria-expanded={userOpen}
            >
              <Avatar src={avatar.src} initial={avatar.initial} size={34} radius={8} />
              <div className="nxfi-avatar-info">
                <div className="nxfi-avatar-name">{firstName}</div>
                <div className="nxfi-avatar-role">{scope.isOwner ? t("userMenu.roleOwner") : t("userMenu.roleMember")}</div>
              </div>
              <ChevronDown size={13} style={{ color: "var(--nav-text-3)", marginLeft: 2 }} />
            </button>
            {userOpen && (
              <div className="nxfi-dropdown nxfi-user-drop" role="menu">
                <div className="nxfi-user-drop-header">
                  <div className="nxfi-user-drop-name">{user?.displayName ?? t("userMenu.fallbackUser")}</div>
                  <div className="nxfi-user-drop-email">{user?.email}</div>
                </div>
                <div style={{ padding: "6px 0" }}>
                  {[
                    { key: "profile", icon: UserCircle, action: () => router.push("/users") },
                    { key: "billing", icon: Zap, action: () => showToast(t("userMenu.billingOpening"), "info") },
                    { key: "help", icon: HelpCircle, action: () => showToast(t("userMenu.helpOpening"), "info") },
                    { key: "settings", icon: Settings, action: () => router.push("/configuracoes") },
                  ].map((item) => (
                    <button key={item.key} className="nxfi-drop-item" onClick={item.action}>
                      <item.icon size={14} />
                      {t(`userMenu.${item.key}`)}
                    </button>
                  ))}
                  <div className="nxfi-drop-divider" />
                  <button className="nxfi-drop-item danger" onClick={handleLogout}>
                    <LogOut size={14} />
                    {t("logoutAccount")}
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