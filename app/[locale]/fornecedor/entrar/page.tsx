"use client";

export const dynamic = "force-dynamic";

// Login do portal do fornecedor (Firebase Auth, e-mail + senha). Recuperação
// de acesso pelo mesmo fluxo do app (/api/auth/reset-password), voltando pra cá.

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, LogIn, Store } from "lucide-react";
import { Button, Card, Field, Input } from "@/app/components/ui";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { useRouter } from "@/i18n/navigation";

export default function FornecedorEntrar() {
  const t = useTranslations("compras.portal");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Já logado → vai direto pro portal.
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const [{ getFirebase }, { onAuthStateChanged }] = await Promise.all([import("@/lib/firebase"), import("firebase/auth")]);
      const { auth } = await getFirebase();
      unsub = onAuthStateChanged(auth, (u) => { if (u) router.replace("/fornecedor"); });
    })();
    return () => unsub?.();
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const [{ getFirebase }, { signInWithEmailAndPassword }] = await Promise.all([import("@/lib/firebase"), import("firebase/auth")]);
      const { auth } = await getFirebase();
      await signInWithEmailAndPassword(auth, email.trim(), password);
      router.replace("/fornecedor");
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      setError(code === "auth/too-many-requests" ? t("login.tooMany") : t("login.invalid"));
    } finally {
      setLoading(false);
    }
  }

  async function forgot() {
    setError("");
    if (!email.trim()) { setError(t("login.resetNeedsEmail")); return; }
    const res = await fetch("/api/auth/reset-password", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), target: "portal" }),
    });
    if (res.status === 429) setError(t("login.tooMany"));
    else setInfo(t("login.resetSent"));
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10" style={{ background: "var(--bg)" }}>
      <div className="absolute right-4 top-4">
        <ThemeToggle className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--sunken)]" />
      </div>
      <Card className="w-full max-w-sm space-y-5" padding="lg">
        <div className="space-y-2 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "var(--brand-weak)", color: "var(--brand)" }}>
            <Store size={20} />
          </span>
          <h1 className="font-display text-lg font-bold" style={{ color: "var(--text)" }}>{t("login.title")}</h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{t("login.subtitle")}</p>
        </div>
        <form onSubmit={submit} className="space-y-3" noValidate>
          <Field label={t("login.email")}>
            <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label={t("login.password")}>
            <div className="relative">
              <Input type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required className="pr-10" />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? t("login.hidePassword") : t("login.showPassword")}
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer p-1" style={{ color: "var(--text-subtle)" }}>
                {show ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </Field>
          {error && <p role="alert" className="text-sm" style={{ color: "var(--neg)" }}>{error}</p>}
          {info && <p role="status" className="text-sm" style={{ color: "var(--pos)" }}>{info}</p>}
          <Button type="submit" icon={LogIn} loading={loading} className="w-full">{t("login.submit")}</Button>
        </form>
        <button type="button" onClick={forgot} className="w-full cursor-pointer text-center text-xs font-semibold" style={{ color: "var(--brand)" }}>
          {t("login.forgot")}
        </button>
        <p className="text-center text-xs" style={{ color: "var(--text-subtle)" }}>{t("login.noInvite")}</p>
      </Card>
    </div>
  );
}
