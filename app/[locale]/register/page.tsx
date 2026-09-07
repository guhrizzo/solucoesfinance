"use client";

// app/register/page.tsx
export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import {
  Eye, EyeOff,
  ArrowRight,
  Shield,
  Lock,
  Mail,
  User,
  AlertCircle,
  Check,
  Building2,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { extractPendingGoogleLink } from "@/lib/authLink";
import { passwordRules } from "@/lib/passwordRules";

const KNOWN_ERROR_CODES = new Set([
  "auth/email-already-in-use",
  "auth/invalid-email",
  "auth/weak-password",
  "auth/password-does-not-meet-requirements",
  "auth/network-request-failed",
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

// ── Firebase lazy helpers ─────────────────────────────────────────────────────
async function registerWithEmail(name: string, email: string, password: string) {
  const { getFirebase } = await import("@/lib/firebase");
  const { createUserWithEmailAndPassword, updateProfile } = await import("firebase/auth");
  const { auth } = await getFirebase();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  return cred;
}

async function registerWithGoogle() {
  const { getFirebase } = await import("@/lib/firebase");
  const { signInWithPopup } = await import("firebase/auth");
  const { auth, googleProvider } = await getFirebase();
  return signInWithPopup(auth, googleProvider);
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function RegisterPage() {
  const router = useRouter();
  const t = useTranslations("auth.register");
  const tErr = useTranslations("auth.errors");
  const tRules = useTranslations("auth.passwordRules");

  const getErrorMessage = (code: string) =>
    KNOWN_ERROR_CODES.has(code) ? tErr(code) : tErr("unexpected");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  // ?plano= escolhido na landing — carregado pro link de login também.
  const [planoParam, setPlanoParam] = useState("");
  useEffect(() => {
    setPlanoParam(new URLSearchParams(window.location.search).get("plano") || "");
  }, []);
  const loginHref = planoParam ? `/login?plano=${encodeURIComponent(planoParam)}` : "/login";

  const passOk = passwordRules.every((r) => r.test(password));
  const confirmOk = password === confirm && confirm.length > 0;
  const formOk = name.trim() && email && passOk && confirmOk && agreed;

  // Se veio da landing com um plano escolhido (?plano=basico-mensal|…), manda
  // pro aceite do contrato + pagamento logo após criar a conta; senão, direto
  // pro dashboard (trial).
  const goAfterSignup = () => {
    const plano =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("plano")
        : null;
    router.push(
      plano ? `/assinatura/contrato?plano=${encodeURIComponent(plano)}` : "/dashboard",
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formOk) return;
    setError(null);
    setLoading(true);
    try {
      await registerWithEmail(name.trim(), email, password);
      goAfterSignup();
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
      await registerWithGoogle();
      goAfterSignup();
    } catch (err: any) {
      const pending = await extractPendingGoogleLink(err);
      if (pending) {
        // Já existe conta com senha para esse e-mail — não cria um 2º
        // usuário. O vínculo é concluído na tela de login, digitando a senha.
        setError(t("googleAlreadyRegistered", { email: pending.email }));
      } else {
        setError(getErrorMessage(err.code));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex overflow-hidden">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        * { font-family: 'Sora', sans-serif; box-sizing: border-box; }
        .mono { font-family: 'JetBrains Mono', monospace; }

        /* ── Painel esquerdo ── */
        .reg-hero {
          background: linear-gradient(160deg, #0a1628 0%, #0d2247 45%, #0e3a7a 75%, #1565c0 100%);
          position: relative; overflow: hidden;
        }
        .reg-grid {
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .reg-glow-1 {
          position: absolute; top: -60px; right: -60px;
          width: 360px; height: 360px; border-radius: 50%;
          background: radial-gradient(circle, rgba(66,165,245,0.22) 0%, transparent 70%);
        }
        .reg-glow-2 {
          position: absolute; bottom: -40px; left: -40px;
          width: 260px; height: 260px; border-radius: 50%;
          background: radial-gradient(circle, rgba(21,101,192,0.18) 0%, transparent 70%);
        }

        /* ── Features cards ── */
        .feature-card {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 14px;
          padding: 14px 16px;
          display: flex; align-items: flex-start; gap: 12px;
          transition: background 0.2s;
        }
        .feature-card:hover { background: rgba(255,255,255,0.08); }
        .feature-icon {
          width: 36px; height: 36px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        /* ── Formulário ── */
        .input-wrap {
          position: relative;
        }
        .reg-input {
          width: 100%;
          background: #f8faff;
          border: 1.5px solid #e2e8f8;
          border-radius: 12px;
          padding: 11px 16px 11px 42px;
          font-size: 14px;
          color: #0d2247;
          outline: none;
          transition: all 0.2s ease;
          font-family: 'Sora', sans-serif;
        }
        .reg-input:focus {
          border-color: #1565c0;
          background: #fff;
          box-shadow: 0 0 0 3px rgba(21,101,192,0.08);
        }
        .reg-input.has-error { border-color: #f43f5e; }
        .reg-input.has-ok    { border-color: #10b981; }
        .input-icon {
          position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
          color: #94a3b8; pointer-events: none;
        }
        .input-action {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer;
          color: #94a3b8; display: flex; align-items: center;
          transition: color 0.15s;
        }
        .input-action:hover { color: #1565c0; }

        /* ── Password strength ── */
        .pass-rule {
          display: flex; align-items: center; gap: 6px;
          font-size: 11px; transition: color 0.2s;
        }
        .pass-rule.ok  { color: #10b981; }
        .pass-rule.nok { color: #94a3b8; }
        .rule-dot {
          width: 14px; height: 14px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0; transition: all 0.2s;
        }
        .rule-dot.ok  { background: #10b981; }
        .rule-dot.nok { background: #e2e8f0; }

        /* ── Botões ── */
        .btn-primary {
          background: linear-gradient(135deg, #1565c0, #0d47a1);
          color: #fff; border: none; border-radius: 12px;
          padding: 13px 24px; font-family: 'Sora', sans-serif;
          font-weight: 700; font-size: 14px; width: 100%;
          cursor: pointer; display: flex; align-items: center;
          justify-content: center; gap: 8px;
          transition: all 0.2s ease;
        }
        .btn-primary:hover:not(:disabled) {
          box-shadow: 0 8px 28px rgba(21,101,192,0.45);
          transform: translateY(-1px);
        }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }

        .btn-social {
          background: #fff; border: 1.5px solid #e2e8f0; border-radius: 12px;
          padding: 11px; font-family: 'Sora', sans-serif; font-size: 13px;
          font-weight: 600; color: #374151; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          transition: all 0.2s ease; width: 100%;
        }
        .btn-social:hover:not(:disabled) { border-color: #1565c0; background: #f0f5ff; }
        .btn-social:disabled { opacity: 0.55; cursor: not-allowed; }

        /* ── Animations ── */
        .fade-up   { animation: fadeUp 0.55s ease both; }
        .fade-up-1 { animation: fadeUp 0.55s 0.08s ease both; }
        .fade-up-2 { animation: fadeUp 0.55s 0.16s ease both; }
        .fade-up-3 { animation: fadeUp 0.55s 0.24s ease both; }
        .fade-up-4 { animation: fadeUp 0.55s 0.32s ease both; }
        .fade-up-5 { animation: fadeUp 0.55s 0.40s ease both; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .pulse-dot { animation: pulseDot 2s ease-in-out infinite; }
        @keyframes pulseDot {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.4; transform:scale(0.7); }
        }

        .spinner {
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%; width: 16px; height: 16px;
          animation: spin 0.7s linear infinite; flex-shrink: 0;
        }
        .spinner-blue {
          border: 2px solid #dbeafe; border-top-color: #1565c0;
          border-radius: 50%; width: 14px; height: 14px;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .error-box {
          background: #fff1f2; border: 1px solid #fecdd3;
          border-radius: 12px; animation: fadeUp 0.3s ease;
        }

        .divider { flex: 1; height: 1px; background: #e8eef8; }

        .checkbox-custom {
          width: 18px; height: 18px; border-radius: 5px;
          border: 1.5px solid #cbd5e1; background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s; flex-shrink: 0;
        }
        .checkbox-custom.checked {
          background: #1565c0; border-color: #1565c0;
        }

        /* Scrollbar */
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #d0daf0; border-radius: 4px; }
      `}</style>

      {/* ══════════════════════════════════════════════════════════
          PAINEL ESQUERDO — hero decorativo
      ══════════════════════════════════════════════════════════ */}
      <div className="reg-hero hidden lg:flex lg:w-[44%] flex-col justify-between p-12">
        <div className="reg-grid" />
        <div className="reg-glow-1" />
        <div className="reg-glow-2" />

        {/* Logo */}
        <div className="relative flex items-center">
          <img src="/nexus_fi_logo_branco.png" alt="NexusFi" className="h-11 w-auto" />
        </div>

        {/* Centro */}
        <div className="relative">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-400/20 rounded-full px-4 py-1.5 mb-8">
            <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
            <span className="text-blue-300 text-xs font-medium mono">{t("sidebar.badge")}</span>
          </div>

          <h2 className="text-4xl font-extrabold text-white leading-[1.15] mb-5">
            {t("sidebar.titleLine1")}<br />
            <span className="text-transparent bg-clip-text"
              style={{ backgroundImage: "linear-gradient(90deg, #42a5f5, #90caf9)" }}>
              {t("sidebar.titleLine2")}
            </span>
          </h2>

          <p className="text-blue-200/55 text-sm leading-relaxed mb-10 max-w-xs">
            {t("sidebar.body")}
          </p>

          {/* Feature cards */}
          <div className="space-y-3 max-w-xs">
            {[
              { icon: <TrendingUpIcon />, bg: "rgba(21,101,192,0.2)" },
              { icon: <BarIcon />, bg: "rgba(16,185,129,0.18)" },
              { icon: <ShieldIcon />, bg: "rgba(245,158,11,0.18)" },
            ].map((f, i) => {
              const feat = (t.raw("sidebar.features") as { title: string; desc: string }[])[i];
              return (
                <div key={i} className="feature-card">
                  <div className="feature-icon" style={{ background: f.bg }}>
                    {f.icon}
                  </div>
                  <div>
                    <p className="text-white text-xs font-semibold mb-0.5">{feat.title}</p>
                    <p className="text-blue-200/50 text-xs leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rodapé */}
        <div className="relative flex items-center gap-3 flex-wrap">
          {(t.raw("sidebar.tags") as string[]).map((tag) => (
            <div key={tag} className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5">
              <Check size={10} className="text-emerald-400" strokeWidth={3} />
              <span className="text-blue-300/60 text-xs">{tag}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          PAINEL DIREITO — formulário
      ══════════════════════════════════════════════════════════ */}
      <div className="flex-1 bg-white flex items-start justify-center overflow-y-auto px-6 py-10">
        <div className="w-full max-w-105">

          {/* Logo mobile */}
          <div className="flex items-center mb-8 lg:hidden">
            <img src="/nexus_fi_logo_preto.png" alt="NexusFi" className="h-9 w-auto" />
          </div>

          {/* Cabeçalho */}
          <div className="fade-up mb-7">
            <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-full px-3 py-1 mb-4">
              <Sparkles size={11} className="text-blue-500" />
              <span className="text-blue-600 text-xs font-semibold">{t("badge")}</span>
            </div>
            <h1 className="text-[28px] font-extrabold text-blue-950 leading-tight mb-1.5">
              {t("title")}
            </h1>
            <p className="text-slate-400 text-sm">
              {t("hasAccount")}{" "}
              <Link href={loginHref} className="text-blue-600 font-semibold hover:text-blue-800 transition-colors">
                {t("hasAccountCta")}
              </Link>
            </p>
          </div>

          {/* Erro global */}
          {error && (
            <div className="error-box flex items-start gap-3 px-4 py-3 mb-5">
              <AlertCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
              <p className="text-rose-600 text-sm">{error}</p>
            </div>
          )}

          {/* ── Google ── */}
          <div className="fade-up-1 mb-5">
            <button
              onClick={handleGoogle}
              disabled={loading || googleLoading}
              className="btn-social"
            >
              {googleLoading ? (
                <span className="spinner-blue" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              {t("googleCta")}
            </button>
          </div>

          {/* Divisor */}
          <div className="fade-up-1 flex items-center gap-3 mb-5">
            <span className="divider" />
            <span className="text-slate-400 text-xs whitespace-nowrap">{t("orFillForm")}</span>
            <span className="divider" />
          </div>

          {/* ── Formulário ── */}
          <form onSubmit={handleSubmit}>

            {/* Nome */}
            <div className="fade-up-2 mb-4">
              <label htmlFor="reg-name" className="block text-blue-950 text-xs font-semibold mb-1.5 tracking-wide uppercase">
                {t("nameLabel")}
              </label>
              <div className="input-wrap">
                <User size={15} className="input-icon" />
                <input
                  id="reg-name"
                  type="text"
                  className={`reg-input ${name && name.trim().length < 3 ? "has-error" : name.trim().length >= 3 ? "has-ok" : ""}`}
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(null); }}
                  autoComplete="name"
                  required
                />
              </div>
            </div>

            {/* E-mail */}
            <div className="fade-up-2 mb-4">
              <label htmlFor="reg-email" className="block text-blue-950 text-xs font-semibold mb-1.5 tracking-wide uppercase">
                {t("emailLabel")}
              </label>
              <div className="input-wrap">
                <Mail size={15} className="input-icon" />
                <input
                  id="reg-email"
                  type="email"
                  className={`reg-input ${/e-?mail|correo/i.test(error ?? "") ? "has-error" : ""}`}
                  placeholder={t("emailPlaceholder")}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            {/* Senha */}
            <div className="fade-up-3 mb-2">
              <label htmlFor="reg-password" className="block text-blue-950 text-xs font-semibold mb-1.5 tracking-wide uppercase">
                {t("passwordLabel")}
              </label>
              <div className="input-wrap">
                <Lock size={15} className="input-icon" />
                <input
                  id="reg-password"
                  type={showPass ? "text" : "password"}
                  className={`reg-input pr-10 ${password && !passOk ? "has-error" : passOk ? "has-ok" : ""}`}
                  placeholder={t("passwordPlaceholder")}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? t("hidePassword") : t("showPassword")}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Indicador de força da senha */}
            {(passwordFocused || password) && (
              <div className="mb-4 px-1 space-y-1.5">
                {passwordRules.map((rule) => {
                  const ok = rule.test(password);
                  return (
                    <div key={rule.key} className={`pass-rule ${ok ? "ok" : "nok"}`}>
                      <div className={`rule-dot ${ok ? "ok" : "nok"}`}>
                        {ok && <Check size={8} color="white" strokeWidth={3} />}
                      </div>
                      {tRules(rule.key)}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Confirmar senha */}
            <div className="fade-up-3 mb-5">
              <label htmlFor="reg-confirm" className="block text-blue-950 text-xs font-semibold mb-1.5 tracking-wide uppercase">
                {t("confirmLabel")}
              </label>
              <div className="input-wrap">
                <Lock size={15} className="input-icon" />
                <input
                  id="reg-confirm"
                  type={showConfirm ? "text" : "password"}
                  className={`reg-input pr-10 ${confirm && !confirmOk ? "has-error" : confirmOk ? "has-ok" : ""}`}
                  placeholder={t("confirmPlaceholder")}
                  value={confirm}
                  onChange={(e) => { setConfirm(e.target.value); setError(null); }}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="input-action"
                  onClick={() => setShowConfirm(!showConfirm)}
                  aria-label={showConfirm ? t("hidePassword") : t("showPassword")}
                >
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {confirm && !confirmOk && (
                <p className="text-rose-500 text-xs mt-1.5 flex items-center gap-1">
                  <AlertCircle size={11} /> {t("passwordsDontMatch")}
                </p>
              )}
            </div>

            {/* Termos */}
            <div className="fade-up-4 mb-6">
              <div className="flex items-start gap-3">
                <div
                  role="checkbox"
                  aria-checked={agreed}
                  aria-labelledby="reg-terms-label"
                  tabIndex={0}
                  className={`checkbox-custom mt-0.5 ${agreed ? "checked" : ""}`}
                  onClick={() => setAgreed(!agreed)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setAgreed(!agreed);
                    }
                  }}
                >
                  {agreed && <Check size={10} color="white" strokeWidth={3} />}
                </div>
                <p id="reg-terms-label" className="text-slate-500 text-xs leading-relaxed">
                  {t.rich("terms", {
                    // eslint-disable-next-line jsx-a11y/anchor-is-valid -- ainda não existe página de Termos de Uso; conteúdo jurídico é trabalho à parte
                    terms: (c) => <a href="#" className="text-blue-600 font-semibold hover:underline">{c}</a>,
                    privacy: (c) => <Link href="/privacidade" className="text-blue-600 font-semibold hover:underline">{c}</Link>,
                  })}
                </p>
              </div>
            </div>

            {/* Submit */}
            <div className="fade-up-5">
              <button
                type="submit"
                disabled={!formOk || loading || googleLoading}
                className="btn-primary"
              >
                {loading ? (
                  <><span className="spinner" /> {t("submitting")}</>
                ) : (
                  <>{t("submit")} <ArrowRight size={16} /></>
                )}
              </button>
            </div>
          </form>

          {/* Rodapé de segurança */}
          <div className="fade-up-5 mt-6 flex items-center justify-center gap-2">
            <Shield size={11} className="text-slate-400" />
            <span className="text-slate-400 text-xs">{t("dataProtected")}</span>
          </div>

          {/* Avaliações */}
          <div className="fade-up-5 mt-6 pt-6 border-t border-slate-100 flex items-center justify-center gap-4">
            <div className="flex -space-x-2">
              {["#1565c0", "#42a5f5", "#0d47a1", "#1976d2"].map((c, i) => (
                <div key={i} className="w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-bold"
                  style={{ background: c }}>
                  {["R", "A", "M", "J"][i]}
                </div>
              ))}
            </div>
            <p className="text-slate-400 text-xs">
              {t.rich("socialProof", {
                strong: (c) => <span className="font-semibold text-blue-950">{c}</span>,
              })}
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}

// ── Mini ícones SVG inline ────────────────────────────────────────────────────
function TrendingUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#42a5f5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}
function BarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}