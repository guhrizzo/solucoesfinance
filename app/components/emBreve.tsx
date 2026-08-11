"use client"
import { useState, useEffect } from "react";
import { TrendingUp, ArrowRight, CheckCircle } from "lucide-react";

const TARGET = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).getTime();

function pad(n:any) {
  return String(n).padStart(2, "0");
}

function getTimeLeft() {
  const diff = Math.max(0, TARGET - Date.now());
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };
}

function CountBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5 min-w-16">
      <span className="font-mono text-2xl font-medium text-slate-900 leading-none tabular-nums">
        {pad(value)}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
        {label}
      </span>
    </div>
  );
}

export default function ComingSoon() {
  const [time, setTime] = useState(getTimeLeft());
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [shake, setShake] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setTime(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  function handleNotify() {
    if (!email.includes("@")) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    setDone(true);
    setEmail("");
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-5 relative overflow-hidden">

      {/* grid */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(59,130,246,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,.04) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />

      {/* blobs */}
      <div className="pointer-events-none fixed -top-36 -left-24 w-120 h-120 rounded-full bg-blue-400/10 blur-[90px]" />
      <div className="pointer-events-none fixed -bottom-24 -right-20 w-95 h-95 rounded-full bg-emerald-400/8 blur-[90px]" />

      {/* card */}
      <div className="relative z-10 w-full max-w-105 bg-white border border-slate-200 rounded-3xl p-10 text-center shadow-xl shadow-slate-900/5">

        {/* logo */}
        <div className="flex items-center justify-center gap-2.5 mb-9">
          <div className="w-8 h-8 rounded-[10px] bg-blue-600 flex items-center justify-center shrink-0">
            <TrendingUp size={14} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-extrabold text-slate-900 tracking-tight">
            Nexus<span className="text-blue-500">Fi</span>
          </span>
        </div>

        {/* animated icon */}
        <div className="w-16 h-16 rounded-[20px] bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-6">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <rect x="2" y="2" width="10" height="10" rx="3" fill="#bfdbfe">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" begin="0s" repeatCount="indefinite"/>
            </rect>
            <rect x="16" y="2" width="10" height="10" rx="3" fill="#93c5fd">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" begin="0.4s" repeatCount="indefinite"/>
            </rect>
            <rect x="16" y="16" width="10" height="10" rx="3" fill="#1d4ed8">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" begin="0.8s" repeatCount="indefinite"/>
            </rect>
            <rect x="2" y="16" width="10" height="10" rx="3" fill="#93c5fd">
              <animate attributeName="opacity" values="0.3;1;0.3" dur="1.6s" begin="1.2s" repeatCount="indefinite"/>
            </rect>
          </svg>
        </div>

        {/* badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-[11px] font-bold text-blue-700 tracking-wide uppercase">Em breve</span>
        </div>

        {/* headline */}
        <h1 className="text-[28px] font-extrabold text-slate-900 leading-[1.15] tracking-tight mb-3">
          Algo incrível<br />
          está{" "}
          <span className="bg-linear-to-r from-blue-600 to-blue-400 bg-clip-text text-transparent">
            chegando
          </span>
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-8">
          Estamos finalizando esta funcionalidade.<br />
          Deixe seu e-mail e te avisamos assim que lançar.
        </p>

        {/* countdown */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <CountBlock value={time.d} label="Dias" />
          <span className="font-mono text-xl text-slate-300 pb-3.5">:</span>
          <CountBlock value={time.h} label="Horas" />
          <span className="font-mono text-xl text-slate-300 pb-3.5">:</span>
          <CountBlock value={time.m} label="Min" />
          <span className="font-mono text-xl text-slate-300 pb-3.5">:</span>
          <CountBlock value={time.s} label="Seg" />
        </div>

        {/* notify */}
        {!done ? (
          <>
            <div className={`flex gap-2 mb-2 ${shake ? "animate-[shake_.4s_ease]" : ""}`}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleNotify()}
                placeholder="seu@email.com.br"
                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all"
              />
              <button
                onClick={handleNotify}
                className="bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl px-4 py-2.5 text-sm font-bold flex items-center gap-1.5 transition-all shadow-lg shadow-blue-600/25 cursor-pointer"
              >
                Notificar <ArrowRight size={13} />
              </button>
            </div>
            <p className="text-[11px] text-slate-400">Sem spam. Só quando estiver pronto.</p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm">
              <CheckCircle size={16} />
              Inscrito com sucesso!
            </div>
            <p className="text-[11px] text-slate-400">Perfeito! Te avisamos assim que lançar.</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-6px); }
          40%      { transform: translateX(6px); }
          60%      { transform: translateX(-4px); }
          80%      { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}