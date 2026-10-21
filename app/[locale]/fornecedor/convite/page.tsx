"use client";

export const dynamic = "force-dynamic";

// Aceite do convite do portal: /fornecedor/convite?t={token}
// O login é sempre o e-mail do convite. Sem conta → cria a senha (regras de
// senha forte do app); com conta → entra com a senha e vincula.

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Store, X } from "lucide-react";
import { Button, Card, Field, Input, PageLoader } from "@/app/components/ui";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { Link, useRouter } from "@/i18n/navigation";
import { passwordRules } from "@/lib/passwordRules";
import { fmtDateTime } from "@/app/components/compras/shared";

interface InviteInfo { companyName: string; supplierName: string; email: string; accountExists: boolean; expiresAt: number }

export default function FornecedorConvite() {
  const t = useTranslations("compras.portal");
  const tErr = useTranslations("compras.errors");
  const locale = useLocale();
  const router = useRouter();
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const tk = new URLSearchParams(window.location.search).get("t") ?? "";
    setToken(tk);
    if (!tk) { setProblem(t("invite.missingToken")); return; }
    (async () => {
      const res = await fetch("/api/compras/portal/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tk }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setProblem(tErr.has(data.code) ? tErr(data.code) : tErr("inviteInvalid")); return; }
      setInfo(data as InviteInfo);
    })().catch(() => setProblem(tErr("generic")));
  }, [t, tErr]);

  async function signIn(email: string, pass: string) {
    const [{ getFirebase }, { signInWithEmailAndPassword }] = await Promise.all([import("@/lib/firebase"), import("firebase/auth")]);
    const { auth } = await getFirebase();
    return signInWithEmailAndPassword(auth, email, pass);
  }

  async function activateNew() {
    if (!info) return;
    setError("");
    if (!passwordRules.every((r) => r.test(password))) { setError(tErr("weakPassword")); return; }
    if (password !== confirm) { setError(t("invite.passwordMismatch")); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/compras/portal/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === "accountExists") { setInfo({ ...info, accountExists: true }); setPassword(""); setConfirm(""); }
        setError(tErr.has(data.code) ? tErr(data.code) : tErr("generic"));
        return;
      }
      await signIn(info.email, password);
      router.replace("/fornecedor");
    } catch {
      setError(tErr("generic"));
    } finally {
      setLoading(false);
    }
  }

  async function activateExisting() {
    if (!info) return;
    setError("");
    setLoading(true);
    try {
      const cred = await signIn(info.email, password).catch(() => null);
      if (!cred) { setError(t("login.invalid")); return; }
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/compras/portal/accept", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(tErr.has(data.code) ? tErr(data.code) : tErr("generic")); return; }
      await cred.user.getIdToken(true);
      router.replace("/fornecedor");
    } finally {
      setLoading(false);
    }
  }

  if (!info && !problem) return <PageLoader label={t("invite.checking")} />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10" style={{ background: "var(--bg)" }}>
      <div className="absolute right-4 top-4">
        <ThemeToggle className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--sunken)]" />
      </div>
      <Card className="w-full max-w-md space-y-5" padding="lg">
        <div className="space-y-2 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "var(--brand-weak)", color: "var(--brand)" }}>
            <Store size={20} />
          </span>
          <h1 className="font-display text-lg font-bold" style={{ color: "var(--text)" }}>
            {problem ? t("invite.invalidTitle") : info?.accountExists ? t("invite.existingTitle") : t("invite.title")}
          </h1>
          {info && (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              {info.accountExists
                ? t("invite.existingDesc", { company: info.companyName })
                : t("invite.subtitle", { company: info.companyName, supplier: info.supplierName })}
            </p>
          )}
        </div>

        {problem ? (
          <div className="space-y-4 text-center">
            <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>{problem}</p>
            <Link href="/fornecedor/entrar" className="text-sm font-semibold" style={{ color: "var(--brand)" }}>{t("invite.goLogin")}</Link>
          </div>
        ) : info && (
          <form className="space-y-3" noValidate onSubmit={(e) => { e.preventDefault(); if (info.accountExists) activateExisting(); else activateNew(); }}>
            <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--sunken)", color: "var(--text-muted)" }}>
              {t("invite.emailLocked", { email: info.email })} {t("invite.expiresAt", { date: fmtDateTime(info.expiresAt, locale) })}
            </p>
            <input type="email" autoComplete="username" value={info.email} readOnly hidden />
            <Field label={info.accountExists ? t("login.password") : t("invite.createPassword")}>
              <Input type="password" autoComplete={info.accountExists ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {!info.accountExists && (
              <>
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2" aria-live="polite">
                  {passwordRules.map((r) => {
                    const ok = r.test(password);
                    return (
                      <li key={r.key} className="flex items-center gap-1.5 text-xs" style={{ color: ok ? "var(--pos)" : "var(--text-subtle)" }}>
                        {ok ? <Check size={12} /> : <X size={12} />} {t(`invite.rules.${r.key}`)}
                      </li>
                    );
                  })}
                </ul>
                <Field label={t("invite.confirmPassword")}>
                  <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </Field>
              </>
            )}
            {error && <p role="alert" className="text-sm" style={{ color: "var(--neg)" }}>{error}</p>}
            <Button type="submit" loading={loading} className="w-full">
              {info.accountExists ? t("invite.loginAndLink") : t("invite.activate")}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
