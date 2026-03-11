"use client";

// app/login/page.tsx
export const dynamic = "force-dynamic"; // nunca faz prerender

import { useState } from "react";
import {
  ClipboardList, Eye, EyeOff, ArrowRight,
  Shield, TrendingUp, Lock, Mail, AlertCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";

// ── Mensagens de erro Firebase → PT-BR ───────────────────────────────────────
const firebaseErrorMap: Record<string, string> = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/user-not-found": "Nenhuma conta encontrada com este e-mail.",
  "auth/wrong-password": "Senha incorreta. Tente novamente.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos.",
  "auth/user-disabled": "Esta conta foi desativada.",
  "auth/network-request-failed": "Falha de rede. Verifique sua conexão.",
  "auth/popup-closed-by-user": "Login cancelado. Tente novamente.",
  "auth/cancelled-popup-request": "Login cancelado. Tente novamente.",
};

const getErrorMessage = (code: string) =>
  firebaseErrorMap[code] ?? "Ocorreu um erro inesperado. Tente novamente.";

// ── Helpers Firebase (lazy) ───────────────────────────────────────────────────
// Toda interação com o Firebase acontece DENTRO de event handlers,
// nunca no corpo do módulo — isso evita o erro de prerender.

async function loginWithEmail(email: string, password: string) {
  const { getFirebase } = await import("../lib/firebase");
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  const { auth } = await getFirebase();
  return signInWithEmailAndPassword(auth, email, password);
}

async function loginWithGoogle() {
  const { getFirebase } = await import("../lib/firebase");
  const { signInWithPopup } = await import("firebase/auth");
  const { auth, googleProvider } = await getFirebase();
  return signInWithPopup(auth, googleProvider);
}

async function resetPassword(email: string) {
  const { getFirebase } = await import("../lib/firebase");
  const { sendPasswordResetEmail } = await import("firebase/auth");
  const { auth } = await getFirebase();
  return sendPasswordResetEmail(auth, email);
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const router = useRouter();

  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(getErrorMessage(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      router.push("/dashboard");
    } catch (err: any) {
      setError(getErrorMessage(err.code));
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Digite seu e-mail acima para receber o link de recuperação.");
      return;
    }
    setError(null);
    try {
      await resetPassword(email);
      setResetSent(true);
    } catch (err: any) {
      setError(getErrorMessage(err.code));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        * { font-family: 'Sora', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .hero-gradient {
          background: linear-gradient(135deg, #0a1628 0%, #0d2247 40%, #0e3a7a 70%, #1565c0 100%);
        }
        .btn-primary {
          background: linear-gradient(135deg, #1565c0, #0d47a1);
          transition: all 0.2s ease;
        }
        .btn-primary:hover:not(:disabled) {
          background: linear-gradient(135deg, #1976d2, #1565c0);
          box-shadow: 0 8px 30px rgba(21,101,192,0.5);
          transform: translateY(-1px);
        }
        .btn-primary:disabled { opacity: 0.7; cursor: not-allowed; }
        .input-field {
          background: #f8faff; border: 1.5px solid #e2e8f8;
          transition: all 0.2s ease; outline: none;
        }
        .input-field:focus {
          border-color: #1565c0; background: #fff;
          box-shadow: 0 0 0 3px rgba(21,101,192,0.08);
        }
        .input-field.error { border-color: #f43f5e; }
        .fade-in   { animation: fadeUp 0.6s ease both; }
        .fade-in-1 { animation: fadeUp 0.6s 0.1s ease both; }
        .fade-in-2 { animation: fadeUp 0.6s 0.2s ease both; }
        .fade-in-3 { animation: fadeUp 0.6s 0.3s ease both; }
        .fade-in-4 { animation: fadeUp 0.6s 0.4s ease both; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .pulse-dot { animation: pulseDot 2s ease-in-out infinite; }
        @keyframes pulseDot {
          0%,100% { opacity:1; transform:scale(1); }
          50%     { opacity:0.4; transform:scale(0.75); }
        }
        .card-glass {
          background: rgba(255,255,255,0.06);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255,255,255,0.1);
        }
        .spinner {
          border: 2px solid rgba(255,255,255,0.3); border-top-color:#fff;
          border-radius:50%; width:16px; height:16px;
          animation: spin 0.7s linear infinite;
        }
        .spinner-blue {
          border: 2px solid #dbeafe; border-top-color:#1565c0;
          border-radius:50%; width:14px; height:14px;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .divider-line { flex:1; height:1px; background:#e2e8f0; }
        .social-btn {
          border: 1.5px solid #e2e8f0; transition: all 0.2s ease; background:#fff;
        }
        .social-btn:hover:not(:disabled) { border-color:#1565c0; background:#f0f5ff; }
        .social-btn:disabled { opacity:0.6; cursor:not-allowed; }
        .error-box {
          background:#fff1f2; border:1px solid #fecdd3;
          border-radius:12px; animation: fadeUp 0.3s ease both;
        }
        .success-box {
          background:#f0fdf4; border:1px solid #bbf7d0;
          border-radius:12px; animation: fadeUp 0.3s ease both;
        }
      `}</style>

      {/* ── Painel esquerdo ── */}
      <div className="hidden lg:flex lg:w-1/2 hero-gradient flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.4) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.4) 1px,transparent 1px)", backgroundSize: "50px 50px" }} />
        <div className="absolute top-20 right-10 w-80 h-80 rounded-full opacity-20"
          style={{ background: "radial-gradient(circle,#42a5f5 0%,transparent 70%)" }} />
        <div className="absolute bottom-16 left-6 w-56 h-56 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle,#1565c0 0%,transparent 70%)" }} />

        {/* Logo */}
        <div className="relative flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-blue-500 flex items-center justify-center">
            <ClipboardList size={18} className="text-white" />
          </div>
          <span className="text-white font-bold text-xl tracking-tight">
            Nexus<span className="text-blue-400">Fi</span>
          </span>
        </div>

        {/* Centro */}
        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-green-400 pulse-dot" />
            <span className="text-blue-300 text-xs font-medium mono">Sistema operacional · Dados seguros</span>
          </div>
          <h2 className="text-4xl font-extrabold text-white leading-tight mb-4">
            Bem-vindo de<br />
            <span className="text-transparent bg-clip-text"
              style={{ backgroundImage: "linear-gradient(90deg,#42a5f5,#90caf9)" }}>
              volta ao controle.
            </span>
          </h2>
          <p className="text-blue-200/60 leading-relaxed max-w-sm">
            Acesse o painel financeiro da sua empresa e tenha visibilidade total em tempo real.
          </p>

          <div className="card-glass rounded-2xl p-5 mt-10 max-w-sm">
            <p className="text-blue-300/50 text-xs mono uppercase tracking-widest mb-3">Resumo do dia</p>
            <div className="space-y-3">
              {[
                { label: "Entradas previstas", val: "R$ 84.200", color: "bg-green-400" },
                { label: "Saídas agendadas", val: "R$ 31.500", color: "bg-red-400" },
                { label: "Saldo projetado", val: "R$ 52.700", color: "bg-blue-400" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span className="text-blue-200/60 text-xs">{item.label}</span>
                  </div>
                  <span className="text-white text-xs font-semibold mono">{item.val}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2">
              <TrendingUp size={13} className="text-green-400" />
              <span className="text-green-400 text-xs font-medium">Fluxo positivo hoje</span>
            </div>
          </div>
        </div>

        {/* Badges */}
        <div className="relative flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
            <Shield size={12} className="text-blue-400" />
            <span className="text-blue-300/60 text-xs">Criptografia AES-256</span>
          </div>
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
            <Lock size={12} className="text-blue-400" />
            <span className="text-blue-300/60 text-xs">Autenticação segura</span>
          </div>
        </div>
      </div>

      {/* ── Painel direito (formulário) ── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-md">

          {/* Logo mobile */}
          <div className="flex items-center gap-2 mb-10 lg:hidden">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <ClipboardList size={16} className="text-white" />
            </div>
            <span className="text-blue-950 font-bold text-lg tracking-tight">
              Nexus<span className="text-blue-500">Fi</span>
            </span>
          </div>

          <div className="fade-in">
            <h1 className="text-3xl font-extrabold text-blue-950 mb-1">Entrar na conta</h1>
            <p className="text-slate-400 text-sm mb-8">Digite suas credenciais para acessar o painel.</p>
          </div>

          {error && (
            <div className="error-box flex items-start gap-3 px-4 py-3 mb-5">
              <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
              <p className="text-rose-600 text-sm">{error}</p>
            </div>
          )}

          {resetSent && (
            <div className="success-box flex items-start gap-3 px-4 py-3 mb-5">
              <Shield size={16} className="text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-emerald-700 text-sm">
                Link enviado para <strong>{email}</strong>. Verifique sua caixa de entrada.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* E-mail */}
            <div className="fade-in-1">
              <label className="block text-blue-950 text-sm font-semibold mb-1.5">E-mail corporativo</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  placeholder="voce@empresa.com.br"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); setResetSent(false); }}
                  className={`input-field w-full rounded-xl pl-10 pr-4 py-3 text-blue-950 text-sm placeholder-slate-400 ${error ? "error" : ""}`}
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Senha */}
            <div className="fade-in-2">
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-blue-950 text-sm font-semibold">Senha</label>
                <button type="button" onClick={handleForgotPassword}
                  className="text-blue-500 text-xs font-medium hover:text-blue-700 transition-colors">
                  Esqueci a senha
                </button>
              </div>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  className={`input-field w-full rounded-xl pl-10 pr-11 py-3 text-blue-950 text-sm placeholder-slate-400 ${error ? "error" : ""}`}
                  required
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 transition-colors">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Lembrar */}
            <div className="fade-in-2 flex items-center gap-2">
              <input type="checkbox" id="remember" className="w-4 h-4 rounded accent-blue-600 cursor-pointer" />
              <label htmlFor="remember" className="text-slate-500 text-sm cursor-pointer select-none">
                Manter conectado por 30 dias
              </label>
            </div>

            {/* Submit */}
            <div className="fade-in-3">
              <button type="submit" disabled={loading || googleLoading}
                className="btn-primary w-full text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm cursor-pointer">
                {loading ? <><span className="spinner" /> Entrando...</> : <>Acessar painel <ArrowRight size={16} /></>}
              </button>
            </div>
          </form>

          {/* Divisor */}
          <div className="fade-in-3 flex items-center gap-3 my-6">
            <span className="divider-line" />
            <span className="text-slate-400 text-xs whitespace-nowrap">ou entre com</span>
            <span className="divider-line" />
          </div>

          {/* Social */}
          <div className="fade-in-4 grid grid-cols-2 gap-3">
            <button onClick={handleGoogle} disabled={loading || googleLoading}
              className="social-btn rounded-xl py-2.5 flex items-center justify-center gap-2 text-slate-600 text-sm font-medium cursor-pointer">
              {googleLoading ? <span className="spinner-blue" /> : (
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              Google
            </button>
            <button disabled
              className="social-btn rounded-xl py-2.5 flex items-center justify-center gap-2 text-slate-400 text-sm font-medium opacity-50 cursor-not-allowed">
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path fill="#F25022" d="M1 1h10v10H1z" />
                <path fill="#7FBA00" d="M13 1h10v10H13z" />
                <path fill="#00A4EF" d="M1 13h10v10H1z" />
                <path fill="#FFB900" d="M13 13h10v10H13z" />
              </svg>
              Microsoft
            </button>
          </div>

          <p className="fade-in-4 text-center text-slate-400 text-sm mt-8">
            Ainda não tem conta?{" "}
            <a href="/register" className="text-blue-600 font-semibold hover:text-blue-800 transition-colors">
              Testar 14 dias grátis
            </a>
          </p>

          <div className="fade-in-4 mt-6 flex items-center justify-center gap-2">
            <Shield size={12} className="text-slate-300" />
            <span className="text-slate-300 text-xs">Conexão segura com criptografia AES-256</span>
          </div>
        </div>
      </div>
    </div>
  );
}