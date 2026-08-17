"use client";

import Link from "next/link";
import { ArrowLeft, Terminal, Cpu, Blocks } from "lucide-react";

export default function DeveloperPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between relative overflow-hidden font-sans">
      {/* Background grids and glowing decorations */}
      <div
        className="pointer-events-none absolute inset-0 opacity-15"
        style={{
          backgroundImage:
            "linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      <div className="pointer-events-none absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-blue-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-emerald-500/10 blur-[120px]" />

      {/* Header / Logo */}
      <header className="relative z-10 max-w-7xl mx-auto w-full px-6 py-8 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <img src="/nexus_fi_logo_branco.png" alt="NexusFi" className="h-8 w-auto" />
          <span className="text-xs font-mono bg-blue-950 text-blue-400 border border-blue-900/50 px-2 py-0.5 rounded-full">
            Dev
          </span>
        </Link>
        <Link
          href="/"
          className="text-sm text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
        >
          <ArrowLeft size={16} /> Voltar ao Início
        </Link>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12 flex-1 flex flex-col lg:flex-row items-center gap-12 justify-center">
        {/* Left Side: Text and Badges */}
        <div className="flex-1 text-center lg:text-left">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-950/80 border border-blue-500/30 rounded-full mb-6">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-mono text-blue-400 uppercase tracking-wider font-semibold">
              API &amp; Integrações
            </span>
          </div>

          <h1 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-tight mb-6">
            Conectando o{" "}
            <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
              NexusFi
            </span>{" "}
            ao seu ecossistema
          </h1>

          <p className="text-slate-300 text-base lg:text-lg leading-relaxed mb-6">
            Nossa API pública e webhooks estão no nosso roadmap. No momento, estamos 
            totalmente focados em aperfeiçoar a experiência principal da plataforma (controle de fluxo de caixa, relatórios automáticos e conciliação bancária).
          </p>

          <p className="text-slate-400 text-sm leading-relaxed mb-8">
            Assim que consolidarmos essas bases, daremos início ao projeto da API para que você possa integrar seus ERPs, sistemas de cobrança e ferramentas internas de forma rápida e segura.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
            <Link
              href="/"
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/20 active:scale-[0.98]"
            >
              <ArrowLeft size={16} /> Voltar para o Início
            </Link>
          </div>
        </div>

        {/* Right Side: Sleek glowing Code Block/Terminal */}
        <div className="w-full lg:w-96 shrink-0">
          <div className="bg-slate-950/80 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-md">
            {/* Terminal Header */}
            <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80" />
                <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <span className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-xs font-mono text-slate-500 flex items-center gap-1.5">
                <Terminal size={12} /> nexusfi-api.json
              </span>
            </div>

            {/* Code display */}
            <div className="p-6 font-mono text-xs md:text-sm text-slate-300 leading-relaxed overflow-x-auto">
              <div className="text-slate-500">// GET /api/v1/status</div>
              <div>
                <span className="text-pink-400">{"{"}</span>
              </div>
              <div className="pl-4">
                <span className="text-blue-400">"status"</span>:{" "}
                <span className="text-emerald-400">"under_construction"</span>,
              </div>
              <div className="pl-4">
                <span className="text-blue-400">"project"</span>:{" "}
                <span className="text-emerald-400">"NexusFi Developer Platform"</span>,
              </div>
              <div className="pl-4">
                <span className="text-blue-400">"current_focus"</span>:{" "}
                <span className="text-pink-400">{"["}</span>
              </div>
              <div className="pl-8 text-slate-400">
                <span className="text-emerald-400">"fluxo_de_caixa"</span>,
              </div>
              <div className="pl-8 text-slate-400">
                <span className="text-emerald-400">"contas_pagar_receber"</span>,
              </div>
              <div className="pl-8 text-slate-400">
                <span className="text-emerald-400">"performance_core"</span>
              </div>
              <div className="pl-4">
                <span className="text-pink-400">{"]"}</span>,
              </div>
              <div className="pl-4">
                <span className="text-blue-400">"message"</span>:{" "}
                <span className="text-emerald-400">"Brevemente começaremos este projeto."</span>
              </div>
              <div>
                <span className="text-pink-400">{"}"}</span>
              </div>
            </div>

            {/* Info Badges */}
            <div className="bg-slate-900/50 border-t border-slate-800/80 p-4 grid grid-cols-2 gap-3 text-center">
              <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/40 flex flex-col items-center">
                <Cpu size={16} className="text-blue-400 mb-1" />
                <span className="text-[10px] text-slate-400 uppercase font-mono">Protocolo</span>
                <span className="text-xs font-semibold text-slate-200">REST &amp; Webhooks</span>
              </div>
              <div className="bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/40 flex flex-col items-center">
                <Blocks size={16} className="text-emerald-400 mb-1" />
                <span className="text-[10px] text-slate-400 uppercase font-mono">Segurança</span>
                <span className="text-xs font-semibold text-slate-200">OAuth2 / API Key</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer copyright */}
      <footer className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 text-center text-xs text-slate-500 border-t border-slate-800/50">
        &copy; {new Date().getFullYear()} NexusFi. Todos os direitos reservados.
      </footer>
    </div>
  );
}
