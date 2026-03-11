"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart2,
  Shield,
  Zap,
  ArrowRight,
  ChevronRight,
  Menu,
  X,
  Globe,
  PieChart,
  Activity,
  Star,
  FileText,
  Users,
  CreditCard,
  ClipboardList,
  CheckCircle,
} from "lucide-react";
import Footer from "./components/Footer";
import Link from "next/link";

const stats = [
  { label: "Empresas atendidas", value: "12.4K", change: "+18.2%", up: true },
  { label: "Volume gerenciado", value: "R$ 9.1B", change: "+31.4%", up: true },
  { label: "Relatórios gerados/mês", value: "890K", change: "+14.7%", up: true },
  { label: "Redução de custos", value: "23%", change: "+3.1%", up: true },
];

const features = [
  {
    icon: BarChart2,
    title: "Fluxo de caixa em tempo real",
    desc: "Visualize entradas, saídas e projeções do fluxo de caixa da sua empresa com painéis atualizados automaticamente.",
  },
  {
    icon: FileText,
    title: "Relatórios financeiros automáticos",
    desc: "DRE, Balanço Patrimonial e relatórios gerenciais gerados automaticamente com base nos seus lançamentos.",
  },
  {
    icon: CreditCard,
    title: "Contas a pagar e receber",
    desc: "Gerencie vencimentos, emita cobranças e controle inadimplência tudo em um só lugar, com alertas inteligentes.",
  },
  {
    icon: PieChart,
    title: "Centro de custos e orçamento",
    desc: "Categorize despesas por departamento, defina metas orçamentárias e monitore desvios em tempo real.",
  },
  {
    icon: Users,
    title: "Multi-usuário e permissões",
    desc: "Controle de acesso por perfil: administrador, financeiro, gestor. Cada colaborador vê apenas o que precisa.",
  },
  {
    icon: Shield,
    title: "Conformidade fiscal e segurança",
    desc: "Integração com obrigações fiscais brasileiras, criptografia de ponta e backups automáticos na nuvem.",
  },
];

const testimonials = [
  {
    name: "Marcos Oliveira",
    role: "CFO — Construtora Delta",
    text: "Eliminamos planilhas manuais e reduzimos em 40% o tempo gasto com fechamento mensal. Visibilidade total do negócio.",
    stars: 5,
  },
  {
    name: "Patrícia Mendes",
    role: "Diretora financeira — Grupo Viva",
    text: "O controle de centros de custo nos ajudou a identificar onde estávamos perdendo margem. Resultado: 23% de redução de despesas.",
    stars: 5,
  },
  {
    name: "Bruno Castilho",
    role: "Sócio — Castilho Advogados",
    text: "Perfeito para escritórios. Emito relatórios para os sócios em minutos, com dados confiáveis e visualmente claros.",
    stars: 5,
  },
];

const painPoints = [
  "Planilhas descentralizadas e propensas a erros",
  "Fechamento mensal demorado e manual",
  "Falta de visibilidade do fluxo de caixa",
  "Dificuldade em controlar custos por área",
];

const tickers = [
  { label: "Receita do mês", value: "R$ 1.24M", up: true },
  { label: "Despesas do mês", value: "R$ 890K", up: false },
  { label: "Margem líquida", value: "28.2%", up: true },
  { label: "Inadimplência", value: "3.1%", up: false },
  { label: "Fluxo projetado", value: "+ R$ 340K", up: true },
  { label: "Contas vencendo hoje", value: "12", up: false },
  { label: "NPS clientes", value: "74", up: true },
  { label: "Custo operacional", value: "R$ 412K", up: false },
];

export default function FinanceHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white font-sans overflow-x-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        * { font-family: 'Sora', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .hero-gradient {
          background: linear-gradient(135deg, #0a1628 0%, #0d2247 40%, #0e3a7a 70%, #1565c0 100%);
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
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <ClipboardList size={16} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">Nexus<span className="text-blue-400">Fi</span></span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {["Funcionalidades", "Planos", "Integrações", "Casos de uso", "Contato"].map((item) => (
              <a key={item} href="#" className="text-blue-100/70 hover:text-white text-sm font-medium transition-colors">
                {item}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login">
              <button className="btn-outline text-white text-sm px-5 py-2 cursor-pointer rounded-full font-medium">
                Entrar
              </button>
            </Link>
            <Link href="/register">
              <button className="btn-primary text-white text-sm px-5 py-2.5 rounded-full font-semibold cursor-pointer">
                Testar grátis
              </button>
            </Link>
          </div>

          <button className="md:hidden text-white" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden nav-blur px-6 pb-6 flex flex-col gap-4">
            {["Funcionalidades", "Planos", "Integrações", "Casos de uso", "Contato"].map((item) => (
              <a key={item} href="#" className="text-blue-100/70 hover:text-white text-sm font-medium py-1 transition-colors">
                {item}
              </a>
            ))}
            <div className="flex gap-3 pt-2">
              <button className="btn-outline text-white text-sm px-5 py-2 rounded-full font-medium flex-1">Entrar</button>
              <button className="btn-primary text-white text-sm px-5 py-2.5 rounded-full font-semibold flex-1">Testar grátis</button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="hero-gradient min-h-screen flex flex-col relative overflow-hidden">
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)", backgroundSize: "60px 60px" }} />

        {/* Glow orbs */}
        <div className="absolute top-32 right-16 w-96 h-96 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #42a5f5 0%, transparent 70%)" }} />
        <div className="absolute bottom-20 left-8 w-64 h-64 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #1565c0 0%, transparent 70%)" }} />

        <div className="flex-1 flex items-center max-w-7xl mx-auto px-6 pt-28 pb-16 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center w-full">
            {/* Left */}
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/20 rounded-full px-4 py-1.5 mb-6 fade-in">
                <span className="w-2 h-2 rounded-full bg-green-400 pulse-dot" />
                <span className="text-blue-300 text-xs font-medium mono">Novo · Integração com ERP e contabilidade</span>
              </div>

              <h1 className="text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6 fade-in-delay-1">
                Gestão financeira
                <br />
                <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg, #42a5f5, #90caf9)" }}>
                  que sua empresa
                </span>
                <br />
                merece.
              </h1>

              <p className="text-blue-200/70 text-lg leading-relaxed mb-8 max-w-lg fade-in-delay-2">
                Centralize o financeiro da sua empresa: fluxo de caixa, contas a pagar e receber, relatórios automáticos e controle de custos — tudo em uma plataforma simples e poderosa.
              </p>

              <div className="flex flex-wrap gap-4 fade-in-delay-3">
                <Link href="/register">
                  <button className="btn-primary text-white font-semibold px-7 py-3.5 rounded-xl flex items-center gap-2 cursor-pointer">
                    Testar 3 dias grátis <ArrowRight size={16} />
                  </button>
                </Link>
                <button className="btn-outline text-white font-medium px-7 py-3.5 rounded-xl flex items-center gap-2 cursor-pointer">
                  Agendar demonstração
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
                  <span className="text-white font-semibold">+ 500 empresas</span> já organizam suas finanças com a NexusFi
                </p>
              </div>
            </div>

            {/* Right — fake dashboard */}
            <div className="hidden lg:block">
              <div className="card-glass rounded-2xl p-6 glow-blue">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-blue-300/60 text-xs mono uppercase tracking-widest">Fluxo de caixa — Outubro</p>
                    <p className="text-white text-3xl font-bold mt-1">+ R$ 348.200</p>
                  </div>
                  <span className="bg-green-500/20 text-green-400 text-sm font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                    <TrendingUp size={13} /> +12.8%
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
                  <span>Jan</span><span>Mar</span><span>Mai</span><span>Jul</span><span>Set</span><span>Out</span>
                </div>

                {/* Mini KPIs */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Receita bruta", val: "R$ 1.24M", up: true },
                    { label: "Despesas totais", val: "R$ 890K", up: false },
                    { label: "Margem líquida", val: "28.2%", up: true },
                    { label: "Inadimplência", val: "3.1%", up: false },
                  ].map((k) => (
                    <div key={k.label} className="bg-white/5 rounded-xl p-3">
                      <p className="text-blue-300/50 text-xs mb-1">{k.label}</p>
                      <p className="text-white font-bold text-sm mono">{k.val}</p>
                      <span className={`text-xs flex items-center gap-0.5 mt-0.5 ${k.up ? "text-green-400" : "text-red-400"}`}>
                        {k.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                        {k.up ? "dentro da meta" : "atenção"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ticker */}
        <div className="bg-blue-950/60 border-t border-white/5 py-3 overflow-hidden">
          <div className="ticker-track">
            {[...tickers, ...tickers].map((t, i) => (
              <div key={i} className="flex items-center gap-2 shrink-0">
                <span className="text-blue-300/50 text-xs mono">{t.label}</span>
                <span className="text-white text-xs font-semibold mono">{t.value}</span>
                <span className={`text-xs mono ${t.up ? "text-green-400" : "text-red-400"}`}>
                  {t.up ? "▲" : "▼"}
                </span>
                <span className="text-white/10 text-xs">|</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-16 bg-white mesh-bg">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((s) => (
              <div key={s.label} className="stat-card bg-white rounded-2xl p-6 border border-blue-50 shadow-sm shadow-blue-50">
                <p className="text-slate-400 text-xs font-medium mb-2">{s.label}</p>
                <p className="text-blue-900 text-3xl font-extrabold mb-1">{s.value}</p>
                <span className={`text-xs font-semibold flex items-center gap-1 ${s.up ? "text-green-500" : "text-red-500"}`}>
                  {s.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {s.change} <span className="text-slate-400 font-normal">vs. ano anterior</span>
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
                Chega de planilhas.
                <br />
                Assuma o controle.
              </h2>
              <p className="text-slate-500 leading-relaxed mb-8">
                A maioria das empresas ainda gerencia o financeiro em planilhas descentralizadas, com risco de erros, retrabalho e falta de visibilidade. A NexusFi resolve isso de uma vez.
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
              <p className="text-blue-600 text-sm font-semibold mono uppercase tracking-widest mb-6">Com a NexusFi</p>
              <div className="space-y-5">
                {[
                  { label: "Dados financeiros centralizados", pct: 100 },
                  { label: "Relatórios automáticos e precisos", pct: 100 },
                  { label: "Fluxo de caixa sempre visível", pct: 100 },
                  { label: "Controle de custos por centro", pct: 100 },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-blue-950 font-medium flex items-center gap-2">
                        <CheckCircle size={14} className="text-green-500" /> {item.label}
                      </span>
                    </div>
                    <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                      <div className="progress-bar h-full bg-linear-to-r from-blue-500 to-blue-400 rounded-full" style={{ width: `${item.pct}%` }} />
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
              Tudo que o financeiro da sua empresa precisa
            </h2>
            <p className="text-slate-500 mt-4 leading-relaxed">
              Módulos integrados pensados para PMEs, startups e empresas em crescimento.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="group feature-card bg-white rounded-2xl p-6 border border-slate-100 shadow-sm cursor-pointer transition-all duration-300 ease-in-out hover:border-[#1565c0] hover:shadow-[0_8px_30px_rgba(21,101,192,0.1)] hover:-translate-y-1">
                <div className="relative w-11 h-11 mb-4 flex items-center justify-center group">

                  {/* Fundo que gira */}
                  <div className="absolute inset-0 rounded-xl bg-blue-50 border border-blue-100/40 transition-transform duration-300 group-hover:rotate-15 group-hover:scale-105"></div>

                  {/* Ícone fixo */}
                  <f.icon size={20} className="relative text-blue-600 scale-100 z-10 group-hover:scale-105 ease-in-out duration-200" />

                </div>
                <h3 className="text-blue-950 font-bold mb-2">{f.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
                <div className="flex items-center gap-1 mt-4 text-blue-500 text-sm font-medium">
                  Saiba mais <ChevronRight size={14} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24" style={{ background: "linear-gradient(135deg, #0d2247 0%, #0e3a7a 50%, #1565c0 100%)" }}>
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-blue-300 text-sm font-medium mono uppercase tracking-widest mb-4">Sem cartão de crédito</p>
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-6">
            Organize o financeiro
            <br />
            da sua empresa hoje.
          </h2>
          <p className="text-blue-200/70 text-lg mb-10 max-w-xl mx-auto">
            3 dias grátis, configuração em menos de 5 minutos, suporte humano incluído.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/register">
              <button className="btn-primary text-white font-semibold px-8 py-4 rounded-xl flex items-center gap-2 cursor-pointer text-base">
                Começar teste grátis <ArrowRight size={17} />
              </button>
            </Link>
            <button className="btn-outline text-white font-medium px-8 py-4 rounded-xl cursor-pointer text-base">
              Falar com consultor
            </button>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-xl mb-14 section-line">
            <h2 className="text-4xl font-extrabold text-blue-950 leading-tight">
              Empresas que transformaram seu financeiro
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t) => (
              <div key={t.name} className="bg-slate-50 rounded-2xl p-7 border border-slate-100">
                <div className="flex gap-0.5 mb-4">
                  {Array(t.stars).fill(0).map((_, i) => (
                    <Star key={i} size={14} className="fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-slate-600 leading-relaxed mb-5 text-sm">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-sm">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="text-blue-950 font-semibold text-sm">{t.name}</p>
                    <p className="text-slate-400 text-xs">{t.role}</p>
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