"use client";

// app/components/CreatePasswordGate.tsx
// Gate bloqueante (sem fechar) exibido no Dashboard para contas que
// entraram só pelo Google e nunca definiram uma senha. Ver spec:
// docs/superpowers/specs/2026-08-24-criar-user-senha-google-design.md

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, User, Eye, EyeOff, AlertCircle, ShieldCheck, Check } from "lucide-react";
import { linkPasswordToCurrentUser } from "@/lib/authLink";
import { passwordRules } from "@/lib/passwordRules";

const KNOWN_ERROR_CODES = new Set([
  "auth/weak-password",
  "auth/password-does-not-meet-requirements",
  "auth/network-request-failed",
]);

interface CreatePasswordGateProps {
  open: boolean;
  email: string | null;
  suggestedName: string | null;
  onComplete: () => void;
}

export default function CreatePasswordGate({ open, email, suggestedName, onComplete }: CreatePasswordGateProps) {
  const t = useTranslations("auth.createPasswordGate");
  const tErr = useTranslations("auth.errors");
  const tRules = useTranslations("auth.passwordRules");

  const getErrorMessage = (code: string) => {
    if (code === "auth/requires-recent-login") return t("errRecentLogin");
    if (KNOWN_ERROR_CODES.has(code)) return tErr(code);
    return tErr("unexpected");
  };

  const [name, setName] = useState(suggestedName ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordFocused, setPasswordFocused] = useState(false);

  if (!open) return null;

  const passOk = passwordRules.every((r) => r.test(password));
  const confirmOk = password === confirmPassword && confirmPassword.length > 0;
  const nameOk = name.trim().length >= 2;
  const canSubmit = nameOk && passOk && confirmOk;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || saving || !email) return;
    setError(null);
    setSaving(true);
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { updateProfile } = await import("firebase/auth");
      const { auth } = await getFirebase();
      if (!auth.currentUser) return;

      await updateProfile(auth.currentUser, { displayName: name.trim() });
      await linkPasswordToCurrentUser(auth.currentUser, email, password);
      onComplete();
    } catch (err: any) {
      setError(getErrorMessage(err.code));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center p-4"
      style={{ background: "rgba(10, 22, 40, 0.72)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&display=swap');
        .cpg * { font-family: 'Sora', sans-serif; box-sizing: border-box; }
        .cpg-input {
          width: 100%; background: #f8faff; border: 1.5px solid #e2e8f8;
          border-radius: 12px; padding: 11px 16px 11px 40px; font-size: 14px;
          color: #0d2247; outline: none; transition: all 0.2s ease;
        }
        .cpg-input:focus { border-color: #1565c0; background: #fff; box-shadow: 0 0 0 3px rgba(21,101,192,0.08); }
        .cpg-icon { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }
        .cpg-btn {
          background: linear-gradient(135deg, #1565c0, #0d47a1); color: #fff; border: none;
          border-radius: 12px; padding: 12px 24px; font-weight: 700; font-size: 14px;
          width: 100%; cursor: pointer; transition: all 0.2s ease;
        }
        .cpg-btn:hover:not(:disabled) { box-shadow: 0 8px 24px rgba(21,101,192,0.4); transform: translateY(-1px); }
        .cpg-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        .cpg-rule-dot { width: 14px; height: 14px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.2s; }
      `}</style>

      <div
        className="cpg w-full max-w-md rounded-2xl overflow-hidden"
        style={{ background: "#fff", boxShadow: "0 32px 80px rgba(0,0,0,0.45), 0 8px 24px rgba(0,0,0,0.25)" }}
      >
        <div className="px-7 pt-7 pb-5" style={{ background: "linear-gradient(135deg, #0a1628, #1565c0)" }}>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: "rgba(255,255,255,0.12)" }}>
            <ShieldCheck size={22} className="text-white" />
          </div>
          <h1 className="text-lg font-extrabold text-white leading-snug">{t("title")}</h1>
          <p className="text-blue-200/70 text-xs mt-1 leading-relaxed">
            {t("subtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-7 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl text-sm" style={{ background: "#fff1f2", border: "1px solid #fecdd3", color: "#e11d48" }}>
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#0d2247" }}>{t("nameLabel")}</label>
            <div className="relative">
              <User size={15} className="cpg-icon" />
              <input
                type="text"
                className="cpg-input"
                placeholder={t("namePlaceholder")}
                value={name}
                onChange={(e) => { setName(e.target.value); setError(null); }}
                autoComplete="name"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#0d2247" }}>{t("passwordLabel")}</label>
            <div className="relative">
              <Lock size={15} className="cpg-icon" />
              <input
                type={showPass ? "text" : "password"}
                className="cpg-input pr-10"
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
                onClick={() => setShowPass(!showPass)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 cursor-pointer"
                style={{ color: "#94a3b8" }}
              >
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {(passwordFocused || password) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1">
              {passwordRules.map((rule) => {
                const ok = rule.test(password);
                return (
                  <div key={rule.key} className="flex items-center gap-1.5 text-xs" style={{ color: ok ? "#10b981" : "#94a3b8" }}>
                    <div className="cpg-rule-dot" style={{ background: ok ? "#10b981" : "#e2e8f0" }}>
                      {ok && <Check size={8} color="white" strokeWidth={3} />}
                    </div>
                    {tRules(rule.key)}
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: "#0d2247" }}>{t("confirmLabel")}</label>
            <div className="relative">
              <Lock size={15} className="cpg-icon" />
              <input
                type={showPass ? "text" : "password"}
                className="cpg-input"
                placeholder={t("confirmPlaceholder")}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                autoComplete="new-password"
                required
              />
            </div>
            {confirmPassword && !confirmOk && (
              <p className="text-xs mt-1.5" style={{ color: "#e11d48" }}>{t("passwordsDontMatch")}</p>
            )}
          </div>

          <button type="submit" disabled={!canSubmit || saving} className="cpg-btn">
            {saving ? t("submitting") : t("submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
