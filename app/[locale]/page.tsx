"use client";

import { useState, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";

const MODAL_FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// true só no client — sem setState em effect (lint: react-hooks/set-state-in-effect).
const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
import {
  TrendingUp,
  TrendingDown,
  BarChart2,
  Zap,
  ArrowRight,
  ChevronRight,
  Menu,
  X,
  Globe,
  PieChart,
  Star,
  FileText,
  Users,
  CreditCard,
  CheckCircle,
  ChevronDown,
  Check,
} from "lucide-react";
import Footer from "@/app/components/Footer";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/app/components/LocaleSwitcher";
import { formatMoneyFromCents } from "@/lib/format";
import {
  PLAN_TIERS,
  BILLING_PERIODS,
  planFor,
  monthlyEquivalentCents,
  annualSavingsCents,
  type BillingPeriod,
} from "@/lib/billingPlans";

// Ícones das funcionalidades — o texto vem de messages/*/landing.json
// (features.items), na mesma ordem.
const FEATURE_ICONS = [BarChart2, FileText, CreditCard, PieChart, Users, Globe];

type StatItem = { label: string; value: string; change: string };
type FeatureItem = { title: string; desc: string };
type TestimonialItem = { name: string; role: string; text: string };

const NAV_ITEMS = ["features", "plans", "integrations", "useCases", "contact"] as const;
const TICKER_KEYS = [
  "monthRevenue",
  "monthExpenses",
  "netMargin",
  "defaultRate",
  "projectedFlow",
  "dueToday",
  "clientNps",
  "opCost",
] as const;
const TICKER_VALUES: Record<(typeof TICKER_KEYS)[number], { value: string; up: boolean }> = {
  monthRevenue: { value: "R$ 1.24M", up: true },
  monthExpenses: { value: "R$ 890K", up: false },
  netMargin: { value: "28.2%", up: true },
  defaultRate: { value: "3.1%", up: false },
  projectedFlow: { value: "+ R$ 340K", up: true },
  dueToday: { value: "12", up: false },
  clientNps: { value: "74", up: true },
  opCost: { value: "R$ 412K", up: false },
};

export default function FinanceHome() {
  const t = useTranslations("landing");
  const tPlans = useTranslations("plans");
  const locale = useLocale();

  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);

  // Planos e preços: período de cobrança escolhido via modal (Mensal | Anual).
  const [period, setPeriod] = useState<BillingPeriod>("mensal");
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const mounted = useMounted();
  const periodLabel = tPlans(`period.${period}.label`);

  const stats = t.raw("stats.items") as StatItem[];
  const features = t.raw("features.items") as FeatureItem[];
  const testimonials = t.raw("testimonials.items") as TestimonialItem[];
  const painPoints = t.raw("problem.painPoints") as string[];
  const solutionPoints = t.raw("problem.solutionPoints") as string[];

  // Dialog acessível pro modal de período — mesma técnica de
  // app/components/ui/Modal.tsx (role/foco/Esc/focus trap), só que inline:
  // manter a estilização atual (light-only, cores fixas) em vez de puxar o
  // Modal compartilhado, que usa tokens de tema e ficaria ilegível se o
  // visitante tiver o modo escuro salvo de uma visita anterior ao app.
  const periodModalTitleId = useId();
  const periodModalRef = useRef<HTMLDivElement>(null);
  const periodModalPreviouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!periodModalOpen) return;

    periodModalPreviouslyFocused.current = document.activeElement as HTMLElement | null;
    // O portal já está montado no DOM quando este efeito roda (useEffect
    // dispara depois do commit inteiro) — sem requestAnimationFrame, que
    // nunca dispara com a aba/janela em segundo plano.
    const node = periodModalRef.current;
    const first = node?.querySelector<HTMLElement>(MODAL_FOCUSABLE_SELECTOR);
    (first ?? node)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPeriodModalOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const node = periodModalRef.current;
      if (!node) return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      periodModalPreviouslyFocused.current?.focus?.();
    };
  }, [periodModalOpen]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // ── Reveal fade/blur das seções — forçado via JS ──────────────────────────
  // O usuário pediu explicitamente para MANTER as animações mesmo com
  // "desempenho melhorado" / prefers-reduced-motion ligado, então não há
  // guarda de reduce-motion aqui. A rolagem suave de <a href="#..."> e o
  // patch de scroll-behavior vivem em <ForceMotion/> (montado no layout).
  useEffect(() => {
    const page = pageRef.current;
    if (page) {
      page.style.opacity = "0";
      page.style.filter = "blur(14px)";
      page.style.transition = "opacity 0.6s ease, filter 0.6s ease";
      requestAnimationFrame(() => {
        page.style.opacity = "1";
        page.style.filter = "blur(0px)";
      });
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          el.style.opacity = "1";
          el.style.filter = "blur(0px)";
          el.style.transform = "none";
          observer.unobserve(el);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -8% 0px" }
    );

    document.querySelectorAll<HTMLElement>("section").forEach((el) => {
      const r = el.getBoundingClientRect();
      const alreadyVisible = r.top < window.innerHeight * 0.9 && r.bottom > 0;
      if (alreadyVisible) return; // hero / primeira dobra ficam intactos
      el.style.opacity = "0";
      el.style.filter = "blur(12px)";
      el.style.transform = "translateY(28px)";
      el.style.transition =
        "opacity 0.7s ease, filter 0.7s ease, transform 0.7s ease";
      observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={pageRef} className="min-h-screen bg-white font-sans overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        * { font-family: 'Sora', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .hero-gradient {
          background: linear-gradient(135deg, #0a1628 0%, #0d2247 40%, #0e3a7a 70%, #1565c0 100%);
        }
        .hero-video-overlay {
          background: linear-gradient(135deg, rgba(10,22,40,0.92) 0%, rgba(13,34,71,0.85) 40%, rgba(14,58,122,0.78) 70%, rgba(21,101,192,0.72) 100%);
        }
        .hero-video {
          animation: heroZoom 24s ease-in-out infinite alternate;
        }
        @keyframes heroZoom {
          0% { transform: scale(1); }
          100% { transform: scale(1.08); }
        }
        .card-glass {
          background: rgba(255,255,255,0.07);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.12);
        }
        .glow-blue {
          box-shadow: 0 0 60px rgba(21, 101, 192, 0.4), 0 0 120px rgba(21, 101, 192, 0.15);
        }
        .ticker-track {
          display: flex;
          gap: 3rem;
          white-space: nowrap;
          animation: ticker 40s linear infinite;
        }
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .fade-in { animation: fadeUp 0.7s ease both; }
        .fade-in-delay-1 { animation: fadeUp 0.7s 0.15s ease both; }
        .fade-in-delay-2 { animation: fadeUp 0.7s 0.3s ease both; }
        .fade-in-delay-3 { animation: fadeUp 0.7s 0.45s ease both; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .pulse-dot {
          animation: pulseDot 2s ease-in-out infinite;
        }
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }
        .nav-blur {
          backdrop-filter: blur(20px);
          background: rgba(10, 22, 40, 0.85);
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .stat-card:hover { transform: translateY(-4px); transition: transform 0.25s ease; }
        /* Compensa a navbar fixa quando <ForceMotion/> rola até uma âncora (#planos). */
        section[id] { scroll-margin-top: 96px; }

        .btn-primary {
          background: linear-gradient(135deg, #1565c0, #0d47a1);
          transition: all 0.2s ease;
        }
        .btn-primary:hover {
          background: linear-gradient(135deg, #1976d2, #1565c0);
          box-shadow: 0 8px 30px rgba(21, 101, 192, 0.5);
          transform: translateY(-1px);
        }
        .btn-outline {
          border: 1.5px solid rgba(255,255,255,0.3);
          transition: all 0.2s ease;
        }
        .btn-outline:hover {
          border-color: rgba(255,255,255,0.7);
          background: rgba(255,255,255,0.08);
        }
        .section-line::before {
          content: '';
          display: block;
          width: 40px;
          height: 3px;
          background: linear-gradient(90deg, #1565c0, #42a5f5);
          margin-bottom: 16px;
          border-radius: 2px;
        }
        .mesh-bg {
          background-image: radial-gradient(ellipse at 20% 50%, rgba(21,101,192,0.12) 0%, transparent 60%),
                            radial-gradient(ellipse at 80% 20%, rgba(66,165,245,0.08) 0%, transparent 50%);
        }
        .progress-bar {
          animation: fillBar 1.4s ease both;
          animation-delay: 0.5s;
        }
        @keyframes fillBar {
          from { width: 0; }
        }
      `}</style>

      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "nav-blur" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center">
            <img src="/nexus_fi_logo_branco.png" alt="NexusFi" className="h-12 w-auto" />
          </div>

          <div className="hidden md:flex items-center gap-8">
            {NAV_ITEMS.map((item) => (
              <a key={item} href={item === "plans" ? "#planos" : "#"} className="text-blue-100/70 hover:text-white text-sm font-medium transition-colors">
                {t(`nav.${item}`)}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <LocaleSwitcher className="text-white mr-1" />
            <Link href="/login">
              <button className="btn-outline text-white text-sm px-5 py-2 cursor-pointer rounded-full font-medium">
                {t("nav.login")}
              </button>
            </Link>
            <Link href="/register">
              <button className="btn-primary text-white text-sm px-5 py-2.5 rounded-full font-semibold cursor-pointer">
                {t("nav.tryFree")}
              </button>
            </Link>
          </div>

          <button
            className="md:hidden text-white"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden nav-blur px-6 pb-6 flex flex-col gap-4">
            {NAV_ITEMS.map((item) => (
              <a key={item} href={item === "plans" ? "#planos" : "#"} className="text-blue-100/70 hover:text-white text-sm font-medium py-1 transition-colors">
                {t(`nav.${item}`)}
              </a>
            ))}
            <LocaleSwitcher className="text-white py-1" />
            <div className="flex gap-3 pt-2">
              <Link href="/login">
                <button className="btn-outline text-white text-sm px-5 py-2 rounded-full font-medium flex-1">{t("nav.login")}</button>
              </Link>
              <Link href="/register">
                <button className="btn-primary text-white text-sm px-5 py-2.5 rounded-full font-semibold flex-1">{t("nav.tryFree")}</button>
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="hero-gradient min-h-screen flex flex-col relative overflow-hidden">
        {/* Video background */}
        <video
          className="hero-video absolute inset-0 w-full h-full object-cover"
          src="https://firebasestorage.googleapis.com/v0/b/finance-add95.firebasestorage.app/o/video-background.mp4?alt=media&token=93c7066d-a23b-4e66-a683-f481725c65d5"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />

        {/* Dark gradient overlay for readability */}
        <div className="hero-video-overlay absolute inset-0" />

        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

        {/* Glow orbs */}
        <div className="absolute top-32 right-16 w-96 h-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #42a5f5 0%, transparent 70%)" }} />
        <div className="absolute bottom-20 left-8 w-64 h-64 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #1565c0 0%, transparent 70%)" }} />

        <div className="relative z-10 flex-1 flex items-center max-w-7xl mx-auto px-6 pt-28 pb-16 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center w-full">
            {/* Left */}
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/20 rounded-full px-4 py-1.5 mb-6 fade-in">
                <span className="w-2 h-2 rounded-full bg-green-400 pulse-dot" />
                <span className="text-blue-100 text-xs font-medium mono">{t("hero.badge")}</span>
              </div>

              <h1 className="text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6 fade-in-delay-1">
                {t("hero.titleLine1")}
                <br />
                <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg, #42a5f5, #90caf9)" }}>
                  {t("hero.titleLine2")}
                </span>
                <br />
                {t("hero.titleLine3")}
              </h1>

              <p className="text-blue-200/70 text-lg leading-relaxed mb-8 max-w-lg fade-in-delay-2">
                {t("hero.subtitle")}
              </p>

              <div className="flex flex-wrap gap-4 fade-in-delay-3">
                <Link href="/register">
                  <button className="btn-primary text-white font-semibold px-7 py-3.5 rounded-xl flex items-center gap-2 cursor-pointer">
                    {t("hero.ctaPrimary")} <ArrowRight size={16} />
                  </button>
                </Link>
                <button className="btn-outline text-white font-medium px-7 py-3.5 rounded-xl flex items-center gap-2 cursor-pointer">
                  {t("hero.ctaSecondary")}
                </button>
              </div>

              <div className="flex items-center gap-6 mt-10 pt-10 border-t border-white/10 fade-in-delay-3">
                <div className="flex -space-x-2">
                  {["bg-blue-400", "bg-indigo-400", "bg-sky-400", "bg-blue-600"].map((c, i) => (
                    <div key={i} className={`w-8 h-8 rounded-full ${c} border-2 border-blue-900 flex items-center justify-center text-white text-xs font-bold`}>
                      {String.fromCharCode(65 + i)}
                    </div>
                  ))}
                </div>
                <p className="text-blue-200/60 text-sm">
                  {t.rich("hero.socialProof", {
                    strong: (chunks) => <span className="text-white font-semibold">{chunks}</span>,
                  })}
                </p>
              </div>
            </div>

            {/* Right — fake dashboard */}
            <div className="hidden lg:block">
              <div className="card-glass rounded-2xl p-6 glow-blue">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-blue-300/60 text-xs mono uppercase tracking-widest">{t("heroWidget.cashFlowLabel")}</p>
                    <p className="text-white text-3xl font-bold mt-1">{t("heroWidget.cashFlowValue")}</p>
                  </div>
                  <span className="bg-green-500/20 text-green-400 text-sm font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                    <TrendingUp size={13} /> {t("heroWidget.cashFlowDelta")}
                  </span>
                </div>

                {/* Fake bar chart */}
                <div className="flex items-end gap-2 h-20 mb-5">
                  {[55, 70, 45, 80, 60, 90, 75, 85, 65, 95, 78, 88].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t-sm" style={{
                      height: `${h}%`,
                      background: i === 10 || i === 11
                        ? "linear-gradient(180deg, #42a5f5, #1565c0)"
                        : "rgba(255,255,255,0.12)"
                    }} />
                  ))}
                </div>
                <div className="flex justify-between text-blue-300/40 text-xs mono mb-5">
                  <span>{t("heroWidget.months.jan")}</span><span>{t("heroWidget.months.mar")}</span><span>{t("heroWidget.months.may")}</span><span>{t("heroWidget.months.jul")}</span><span>{t("heroWidget.months.sep")}</span><span>{t("heroWidget.months.oct")}</span>
                </div>

                {/* Mini KPIs */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: t("heroWidget.kpiGrossRevenue"), val: "R$ 1.24M", up: true },
                    { label: t("heroWidget.kpiTotalExpenses"), val: "R$ 890K", up: false },
                    { label: t("heroWidget.kpiNetMargin"), val: "28.2%", up: true },
                    { label: t("heroWidget.kpiDefaultRate"), val: "3.1%", up: false },
                  ].map((k) => (
                    <div key={k.label} className="bg-white/5 rounded-xl p-3">
                      <p className="text-blue-300/75 text-xs mb-1">{k.label}</p>
                      <p className="text-white font-bold text-sm mono">{k.val}</p>
                      <span className={`text-xs flex items-center gap-0.5 mt-0.5 ${k.up ? "text-green-400" : "text-red-400"}`}>
                        {k.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {k.up ? t("heroWidget.onTarget") : t("heroWidget.attention")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ticker */}
        <div className="relative z-10 bg-blue-950/60 border-t border-white/5 py-3 overflow-hidden">
          <div className="ticker-track">
            {[...TICKER_KEYS, ...TICKER_KEYS].map((key, i) => {
              const tk = TICKER_VALUES[key];
              return (
                <div key={i} className="flex items-center gap-2 shrink-0">
                  <span className="text-blue-300/75 text-xs mono">{t(`ticker.${key}`)}</span>
                  <span className="text-white text-xs font-semibold mono">{tk.value}</span>
                  <span className={`text-xs mono ${tk.up ? "text-green-400" : "text-red-400"}`}>
                    {tk.up ? "▲" : "▼"}
                  </span>
                  <span className="text-white/10 text-xs">|</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-white mesh-bg">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((s) => (
              <div key={s.label} className="stat-card bg-white rounded-2xl p-6 border border-blue-50 shadow-sm shadow-blue-50">
                <p className="text-slate-500 text-xs font-medium mb-2">{s.label}</p>
                <p className="text-blue-900 text-3xl font-extrabold mb-1">{s.value}</p>
                <span className="text-xs font-semibold flex items-center gap-1 text-green-500">
                  <TrendingUp size={12} />
                  {s.change} <span className="text-slate-500 font-normal">{t("stats.vsPreviousYear")}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problem → Solution */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="section-line">
              <h2 className="text-4xl font-extrabold text-blue-950 leading-tight mb-6">
                {t("problem.titleLine1")}
                <br />
                {t("problem.titleLine2")}
              </h2>
              <p className="text-slate-500 leading-relaxed mb-8">
                {t("problem.body")}
              </p>
              <ul className="space-y-3">
                {painPoints.map((p) => (
                  <li key={p} className="flex items-center gap-3 text-slate-600 text-sm">
                    <X size={16} className="text-red-400 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-50 rounded-2xl p-8 border border-slate-100">
              <p className="text-blue-600 text-sm font-semibold mono uppercase tracking-widest mb-6">{t("problem.solutionLabel")}</p>
              <div className="space-y-5">
                {solutionPoints.map((label) => (
                  <div key={label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-blue-950 font-medium flex items-center gap-2">
                        <CheckCircle size={14} className="text-green-500" /> {label}
                      </span>
                    </div>
                    <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                      <div className="progress-bar h-full bg-linear-to-r from-blue-500 to-blue-400 rounded-full" style={{ width: "100%" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-xl mb-14 section-line">
            <h2 className="text-4xl font-extrabold text-blue-950 leading-tight">
              {t("features.title")}
            </h2>
            <p className="text-slate-500 mt-4 leading-relaxed">
              {t("features.subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => {
              const Icon = FEATURE_ICONS[i] ?? BarChart2;
              return (
                <div key={f.title} className="group feature-card bg-white rounded-2xl p-6 border border-slate-100 shadow-sm cursor-pointer transition-all duration-300 ease-in-out hover:border-[#1565c0] hover:shadow-[0_8px_30px_rgba(21,101,192,0.1)] hover:-translate-y-1">
                  <div className="relative w-11 h-11 mb-4 flex items-center justify-center group">
                    {/* Fundo que gira */}
                    <div className="absolute inset-0 rounded-xl bg-blue-50 border border-blue-100/40 transition-transform duration-300 group-hover:rotate-15 group-hover:scale-105"></div>
                    {/* Ícone fixo */}
                    <Icon size={20} className="relative text-blue-600 scale-100 z-10 group-hover:scale-105 ease-in-out duration-200" />
                  </div>
                  <h3 className="text-blue-950 font-bold mb-2">{f.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
                  <div className="flex items-center gap-1 mt-4 text-blue-500 text-sm font-medium">
                    {t("features.learnMore")} <ChevronRight size={14} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="py-24 bg-white" id="planos">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-xl mx-auto text-center mb-14">
            <p className="text-blue-600 text-sm font-semibold mono uppercase tracking-widest mb-3">{t("pricing.eyebrow")}</p>
            <h2 className="text-4xl font-extrabold text-blue-950 leading-tight">
              {t("pricing.title")}
            </h2>
            <p className="text-slate-500 mt-4 leading-relaxed">
              {t.rich("pricing.subtitle", {
                accent: (chunks) => <span className="text-blue-600 font-semibold">{chunks}</span>,
              })}
            </p>
          </div>

          {/* Seletor de período — abre o modal Mensal | Anual */}
          <div className="flex justify-center mb-10">
            <button
              type="button"
              onClick={() => setPeriodModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-950 shadow-sm transition-colors hover:border-blue-300 cursor-pointer"
            >
              {t("pricing.billingLabel")} <span className="text-blue-600">{periodLabel}</span>
              {period === "anual" && (
                <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">
                  {t("pricing.annualDiscountBadge")}
                </span>
              )}
              <ChevronDown size={15} className="text-slate-400" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto items-stretch">
            {PLAN_TIERS.map((tier) => {
              const plan = planFor(tier.id, period);
              const destaque = !!tier.highlight;
              const savings = annualSavingsCents(tier.id);
              const tierLabel = tPlans(`tier.${tier.id}.label`);
              const tierFeatures = tPlans.raw(`tier.${tier.id}.features`) as string[];
              const tierFeaturesLead =
                tier.id === "pro" ? tPlans(`tier.pro.featuresLead`) : null;
              return (
                <div
                  key={tier.id}
                  className={`relative bg-white rounded-2xl p-8 flex flex-col transition-all duration-300 hover:-translate-y-1 ${
                    destaque
                      ? "border-2 border-blue-500 shadow-lg shadow-blue-500/10 hover:shadow-xl hover:shadow-blue-500/15 z-10"
                      : "border border-slate-200 shadow-sm hover:shadow-md"
                  }`}
                >
                  {destaque && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                      <span className="bg-linear-to-r from-blue-700 to-blue-600 text-white text-xs font-semibold px-4 py-1 rounded-full shadow-md whitespace-nowrap">
                        {t("pricing.mostComplete")}
                      </span>
                    </div>
                  )}
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center mb-5 ${
                      destaque ? "bg-blue-600" : "bg-blue-50 border border-blue-100/40"
                    }`}
                  >
                    {destaque ? (
                      <BarChart2 size={20} className="text-white" />
                    ) : (
                      <Zap size={20} className="text-blue-600" />
                    )}
                  </div>
                  <h3 className="text-blue-950 text-xl font-bold mb-1">{t("pricing.planName", { name: tierLabel })}</h3>
                  <p className="text-slate-500 text-sm mb-5">{tPlans(`tier.${tier.id}.blurb`)}</p>
                  <div className="mb-1 flex items-end gap-1">
                    <span className="text-blue-950 text-4xl font-extrabold">
                      {formatMoneyFromCents(plan.priceCents, locale)}
                    </span>
                    <span className="text-slate-500 text-sm font-medium mb-1">
                      {period === "anual" ? t("pricing.perYear") : t("pricing.perMonth")}
                    </span>
                  </div>
                  {period === "anual" ? (
                    <p className="text-slate-500 text-xs mb-1">
                      {t("pricing.annualEquivalent", { value: formatMoneyFromCents(monthlyEquivalentCents(plan), locale) })}
                    </p>
                  ) : (
                    <p className="text-slate-500 text-xs mb-1">
                      {t("pricing.annualHint", { value: formatMoneyFromCents(planFor(tier.id, "anual").priceCents, locale) })}
                    </p>
                  )}
                  {period === "anual" && savings > 0 && (
                    <p className="text-green-700 text-xs font-semibold mb-1">
                      {t("pricing.annualSavings", { value: formatMoneyFromCents(savings, locale) })}
                    </p>
                  )}
                  <p className="text-green-700 text-xs font-semibold mt-3 mb-6 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 pulse-dot" />
                    {t("pricing.trialNote")}
                  </p>
                  <ul className="space-y-3 mb-8 flex-1">
                    {tierFeaturesLead && (
                      <li className="text-blue-950 text-sm font-semibold">{tierFeaturesLead}</li>
                    )}
                    {tierFeatures.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-slate-600 text-sm">
                        <CheckCircle size={15} className="text-green-500 shrink-0 mt-0.5" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link href={`/register?plano=${plan.id}`} className="w-full mt-auto">
                    <button
                      className={`w-full py-3 rounded-xl font-semibold text-sm transition-all cursor-pointer ${
                        destaque
                          ? "bg-linear-to-r from-blue-700 to-blue-600 text-white hover:from-blue-800 hover:to-blue-700 shadow-md hover:shadow-lg"
                          : "border border-blue-200 text-blue-600 hover:bg-blue-50"
                      }`}
                    >
                      {t("pricing.subscribe", { name: tierLabel })}
                    </button>
                  </Link>
                </div>
              );
            })}
          </div>

          {/* Modal: período de cobrança — em portal no <body> pra não herdar o
              transform das seções animadas (quebraria o position: fixed). */}
          {mounted &&
            periodModalOpen &&
            createPortal(
            <div
              className="fixed inset-0 z-[999] flex items-center justify-center p-4"
              style={{ background: "rgba(10, 22, 40, 0.55)", backdropFilter: "blur(2px)" }}
              // Fechar no clique do backdrop é conveniência de mouse — Esc
              // (tratado no useEffect acima) e o botão "Fechar" (aria-label)
              // já cobrem teclado.
              onClick={(e) => {
                if (e.target === e.currentTarget) setPeriodModalOpen(false);
              }}
            >
              <div
                ref={periodModalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={periodModalTitleId}
                tabIndex={-1}
                className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
              >
                <div className="flex items-start justify-between mb-1">
                  <h3 id={periodModalTitleId} className="text-lg font-bold text-blue-950">{t("pricing.modal.title")}</h3>
                  <button
                    type="button"
                    onClick={() => setPeriodModalOpen(false)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={t("pricing.modal.close")}
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="text-slate-500 text-sm mb-5">
                  {t("pricing.modal.body")}
                </p>
                <div className="space-y-2.5">
                  {BILLING_PERIODS.map((p) => {
                    const active = p.id === period;
                    const pLabel = tPlans(`period.${p.id}.label`);
                    const pNote = tPlans(`period.${p.id}.note`);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setPeriod(p.id);
                          setPeriodModalOpen(false);
                        }}
                        className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors cursor-pointer ${
                          active
                            ? "border-blue-500 bg-blue-50"
                            : "border-slate-200 hover:border-blue-300"
                        }`}
                      >
                        <span>
                          <span className="block font-semibold text-blue-950">{pLabel}</span>
                          {pNote && (
                            <span className="block text-xs font-medium text-green-700">{pNote}</span>
                          )}
                        </span>
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                            active ? "border-blue-500 bg-blue-500" : "border-slate-300"
                          }`}
                        >
                          {active && <Check size={12} className="text-white" strokeWidth={3} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24" style={{ background: "linear-gradient(135deg, #0d2247 0%, #0e3a7a 50%, #1565c0 100%)" }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-blue-300 text-sm font-medium mono uppercase tracking-widest mb-4">{t("cta.eyebrow")}</p>
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-6">
            {t("cta.titleLine1")}
            <br />
            {t("cta.titleLine2")}
          </h2>
          <p className="text-blue-200/70 text-lg mb-10 max-w-xl mx-auto">
            {t("cta.body")}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/register">
              <button className="btn-primary text-white font-semibold px-8 py-4 rounded-xl flex items-center gap-2 cursor-pointer text-base">
                {t("cta.primary")} <ArrowRight size={17} />
              </button>
            </Link>
            <button className="btn-outline text-white font-medium px-8 py-4 rounded-xl cursor-pointer text-base">
              {t("cta.secondary")}
            </button>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-xl mb-14 section-line">
            <h2 className="text-4xl font-extrabold text-blue-950 leading-tight">
              {t("testimonials.title")}
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((tm) => (
              <div key={tm.name} className="bg-slate-50 rounded-2xl p-7 border border-slate-100">
                <div className="flex gap-0.5 mb-4">
                  {Array(5).fill(0).map((_, i) => (
                    <Star key={i} size={14} className="fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-slate-600 leading-relaxed mb-5 text-sm">&ldquo;{tm.text}&rdquo;</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                    {tm.name[0]}
                  </div>
                  <div>
                    <p className="text-blue-950 font-semibold text-sm">{tm.name}</p>
                    <p className="text-slate-500 text-xs">{tm.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}
