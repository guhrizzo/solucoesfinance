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
  Bell,
  Menu,
  X,
  Globe,
  PieChart,
  Activity,
  Star,
} from "lucide-react";

const stats = [
  { label: "Ativos sob gestão", value: "R$ 4.8B", change: "+12.4%", up: true },
  { label: "Usuários ativos", value: "248K", change: "+8.1%", up: true },
  { label: "Transações/dia", value: "1.2M", change: "+22.7%", up: true },
  { label: "Retorno médio", value: "18.3%", change: "-1.2%", up: false },
];

const features = [
  {
    icon: BarChart2,
    title: "Análise em tempo real",
    desc: "Dashboards dinâmicos com dados atualizados ao vivo do mercado brasileiro e global.",
  },
  {
    icon: Shield,
    title: "Segurança de nível bancário",
    desc: "Criptografia AES-256, autenticação multifator e conformidade com regulações do Banco Central.",
  },
  {
    icon: PieChart,
    title: "Portfólio inteligente",
    desc: "Diversifique seus investimentos com recomendações baseadas em IA e seu perfil de risco.",
  },
  {
    icon: Zap,
    title: "Execução instantânea",
    desc: "Ordens executadas em milissegundos com acesso direto às principais bolsas do mundo.",
  },
  {
    icon: Globe,
    title: "Mercados globais",
    desc: "Invista em mais de 50 países, incluindo B3, NYSE, NASDAQ e mercados emergentes.",
  },
  {
    icon: Activity,
    title: "Alertas personalizados",
    desc: "Configure notificações inteligentes para preços, variações e eventos de mercado.",
  },
];

const testimonials = [
  {
    name: "Fernanda Lopes",
    role: "Investidora independente",
    text: "Triplicar meu patrimônio em dois anos não seria possível sem as ferramentas da plataforma.",
    stars: 5,
  },
  {
    name: "Ricardo Alves",
    role: "Gerente de fundos",
    text: "A análise em tempo real e os relatórios automáticos revolucionaram nossa gestão de carteiras.",
    stars: 5,
  },
  {
    name: "Camila Souza",
    role: "Pequena empresária",
    text: "Finalmente consegui entender onde meu dinheiro estava indo e como fazê-lo trabalhar por mim.",
    stars: 5,
  },
];

const tickers = [
  { symbol: "PETR4", price: "R$ 38.42", change: "+1.23%", up: true },
  { symbol: "VALE3", price: "R$ 62.10", change: "-0.45%", up: false },
  { symbol: "ITUB4", price: "R$ 29.87", change: "+0.88%", up: true },
  { symbol: "BBDC4", price: "R$ 14.55", change: "+2.10%", up: true },
  { symbol: "MGLU3", price: "R$ 8.22", change: "-1.34%", up: false },
  { symbol: "WEGE3", price: "R$ 51.90", change: "+0.67%", up: true },
  { symbol: "BTC/BRL", price: "R$ 498K", change: "+3.40%", up: true },
  { symbol: "USD/BRL", price: "R$ 5.14", change: "-0.12%", up: false },
];

export default function FinanceHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [tickerPos, setTickerPos] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTickerPos((p) => p - 1);
    }, 20);
    return () => clearInterval(interval);
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
          animation: ticker 35s linear infinite;
        }
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .fade-in {
          animation: fadeUp 0.7s ease both;
        }
        .fade-in-delay-1 { animation: fadeUp 0.7s 0.15s ease both; }
        .fade-in-delay-2 { animation: fadeUp 0.7s 0.3s ease both; }
        .fade-in-delay-3 { animation: fadeUp 0.7s 0.45s ease both; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .chart-bar {
          animation: growBar 1.2s ease both;
          transform-origin: bottom;
        }
        @keyframes growBar {
          from { transform: scaleY(0); }
          to { transform: scaleY(1); }
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
        .feature-card:hover { border-color: #1565c0; transform: translateY(-2px); transition: all 0.25s ease; }
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
          background-image: radial-gradient(ellipse at 20% 50%, rgba(21,101,192,0.15) 0%, transparent 60%),
                            radial-gradient(ellipse at 80% 20%, rgba(66,165,245,0.1) 0%, transparent 50%);
        }
      `}</style>

      {/* Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? "nav-blur" : "bg-transparent"}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <TrendingUp size={16} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">Nexus<span className="text-blue-400">Fi</span></span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {["Mercados", "Investir", "Carteira", "Análises", "Sobre"].map((item) => (
              <a key={item} href="#" className="text-blue-100/70 hover:text-white text-sm font-medium transition-colors">
                {item}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button className="btn-outline text-white text-sm px-5 py-2 rounded-full font-medium">
              Entrar
            </button>
            <button className="btn-primary text-white text-sm px-5 py-2.5 rounded-full font-semibold">
              Criar conta
            </button>
          </div>

          <button className="md:hidden text-white" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden nav-blur px-6 pb-6 flex flex-col gap-4">
            {["Mercados", "Investir", "Carteira", "Análises", "Sobre"].map((item) => (
              <a key={item} href="#" className="text-blue-100/70 hover:text-white text-sm font-medium py-1 transition-colors">
                {item}
              </a>
            ))}
            <div className="flex gap-3 pt-2">
              <button className="btn-outline text-white text-sm px-5 py-2 rounded-full font-medium flex-1">Entrar</button>
              <button className="btn-primary text-white text-sm px-5 py-2.5 rounded-full font-semibold flex-1">Criar conta</button>
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
                <span className="text-blue-300 text-xs font-medium mono">Mercados abertos · B3 +1.2%</span>
              </div>

              <h1 className="text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-6 fade-in-delay-1">
                Seu dinheiro
                <br />
                <span className="text-transparent bg-clip-text" style={{ backgroundImage: "linear-gradient(90deg, #42a5f5, #90caf9)" }}>
                  trabalhando mais
                </span>
                <br />
                inteligente.
              </h1>

              <p className="text-blue-200/70 text-lg leading-relaxed mb-8 max-w-lg fade-in-delay-2">
                Plataforma completa para investir, acompanhar e crescer seu patrimônio com dados em tempo real e inteligência artificial.
              </p>

              <div className="flex flex-wrap gap-4 fade-in-delay-3">
                <button className="btn-primary text-white font-semibold px-7 py-3.5 rounded-xl flex items-center gap-2">
                  Começar agora <ArrowRight size={16} />
                </button>
                <button className="btn-outline text-white font-medium px-7 py-3.5 rounded-xl flex items-center gap-2">
                  Ver demonstração
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
                  <span className="text-white font-semibold">+248 mil</span> investidores confiam na NexusFi
                </p>
              </div>
            </div>

            {/* Right — fake dashboard card */}
            <div className="hidden lg:block">
              <div className="card-glass rounded-2xl p-6 glow-blue">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-blue-300/60 text-xs mono uppercase tracking-widest">Patrimônio total</p>
                    <p className="text-white text-3xl font-bold mt-1">R$ 142.840,00</p>
                  </div>
                  <span className="bg-green-500/20 text-green-400 text-sm font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                    <TrendingUp size={13} /> +18.3%
                  </span>
                </div>

                {/* Fake sparkline */}
                <div className="relative h-24 mb-4">
                  <svg viewBox="0 0 300 80" className="w-full h-full" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#42a5f5" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#42a5f5" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0 60 C30 55, 50 45, 80 48 C110 51, 120 35, 150 30 C180 25, 200 38, 220 28 C240 18, 260 10, 300 5" fill="none" stroke="#42a5f5" strokeWidth="2" />
                    <path d="M0 60 C30 55, 50 45, 80 48 C110 51, 120 35, 150 30 C180 25, 200 38, 220 28 C240 18, 260 10, 300 5 L300 80 L0 80Z" fill="url(#lineGrad)" />
                  </svg>
                </div>

                {/* Mini positions */}
                <div className="space-y-3">
                  {[
                    { name: "PETR4", alloc: "32%", val: "R$ 45.7K", up: true, change: "+4.2%" },
                    { name: "VALE3", alloc: "24%", val: "R$ 34.2K", up: false, change: "-0.8%" },
                    { name: "FII KNRI11", alloc: "18%", val: "R$ 25.7K", up: true, change: "+1.1%" },
                  ].map((p) => (
                    <div key={p.name} className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                        <DollarSign size={13} className="text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-white font-medium">{p.name}</span>
                          <span className="text-blue-300/60">{p.val}</span>
                        </div>
                        <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: p.alloc }} />
                        </div>
                      </div>
                      <span className={`text-xs font-medium mono ${p.up ? "text-green-400" : "text-red-400"}`}>{p.change}</span>
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
              <div key={i} className="flex items-center gap-2 flex-shrink-0">
                <span className="text-white text-xs font-semibold mono">{t.symbol}</span>
                <span className="text-blue-200/60 text-xs mono">{t.price}</span>
                <span className={`text-xs mono font-medium flex items-center gap-0.5 ${t.up ? "text-green-400" : "text-red-400"}`}>
                  {t.up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                  {t.change}
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
                  {s.change} <span className="text-slate-400 font-normal">últimos 12 meses</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-xl mb-14 section-line">
            <h2 className="text-4xl font-extrabold text-blue-950 leading-tight">
              Tudo que você precisa para investir melhor
            </h2>
            <p className="text-slate-500 mt-4 leading-relaxed">
              Ferramentas profissionais acessíveis para qualquer nível de investidor.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="feature-card bg-white rounded-2xl p-6 border border-slate-100 shadow-sm cursor-pointer">
                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                  <f.icon size={20} className="text-blue-600" />
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
          <p className="text-blue-300 text-sm font-medium mono uppercase tracking-widest mb-4">Comece hoje</p>
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white leading-tight mb-6">
            Seu portfólio dos sonhos
            <br />
            está a um clique de distância.
          </h2>
          <p className="text-blue-200/70 text-lg mb-10 max-w-xl mx-auto">
            Crie sua conta gratuitamente, sem taxa de adesão. Invista a partir de R$ 1,00.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button className="btn-primary text-white font-semibold px-8 py-4 rounded-xl flex items-center gap-2 text-base">
              Abrir conta grátis <ArrowRight size={17} />
            </button>
            <button className="btn-outline text-white font-medium px-8 py-4 rounded-xl text-base">
              Falar com especialista
            </button>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-xl mb-14 section-line">
            <h2 className="text-4xl font-extrabold text-blue-950 leading-tight">
              Quem investe com a NexusFi
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
      <footer className="bg-blue-950 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-10 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
                  <TrendingUp size={14} className="text-white" />
                </div>
                <span className="text-white font-bold">Nexus<span className="text-blue-400">Fi</span></span>
              </div>
              <p className="text-blue-300/50 text-sm leading-relaxed">
                Plataforma de investimentos para o Brasil e o mundo.
              </p>
            </div>
            {[
              { title: "Produto", links: ["Mercados", "Portfólio", "Análises", "API"] },
              { title: "Empresa", links: ["Sobre", "Blog", "Carreiras", "Imprensa"] },
              { title: "Suporte", links: ["Central de ajuda", "Contato", "Status", "Segurança"] },
            ].map((col) => (
              <div key={col.title}>
                <p className="text-white font-semibold text-sm mb-4">{col.title}</p>
                <ul className="space-y-2">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a href="#" className="text-blue-300/50 hover:text-white text-sm transition-colors">{l}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-blue-300/30 text-xs">© 2025 NexusFi. Todos os direitos reservados. Investimentos sujeitos a riscos.</p>
            <div className="flex items-center gap-1 text-blue-300/30 text-xs">
              <Shield size={12} /> Regulado pelo Banco Central do Brasil
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}