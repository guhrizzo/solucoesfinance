"use client";

// app/[locale]/entrar-dispositivo/page.tsx
// Aberta no NAVEGADOR DO SISTEMA pelo app desktop (?porta=…&state=…). O usuário
// entra com o Google aqui (onde o Google aceita) e a página devolve um código de
// uso único ao app, que escuta em http://127.0.0.1:<porta>. Ver lib/deviceLogin.ts
// e desktop/src/device-login.ts.
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { User } from "firebase/auth";

type Params = { porta: number; state: string };

function readParams(): Params | null {
  const sp = new URLSearchParams(window.location.search);
  const porta = Number(sp.get("porta"));
  const state = sp.get("state") ?? "";
  if (!Number.isInteger(porta) || porta < 1024 || porta > 65535) return null;
  if (!/^[0-9a-f]{16,64}$/.test(state)) return null;
  return { porta, state };
}

export default function EntrarDispositivoPage() {
  const t = useTranslations("auth.desktopLogin");
  const tErr = useTranslations("auth.errors");

  const [params, setParams] = useState<Params | null | undefined>(undefined);
  const [current, setCurrent] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setParams(readParams());
    let off: (() => void) | undefined;
    (async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { onAuthStateChanged } = await import("firebase/auth");
      const { auth } = await getFirebase();
      off = onAuthStateChanged(auth, (u) => setCurrent(u));
    })();
    return () => off?.();
  }, []);

  // Troca o ID token por um código de uso único e entrega ao app (loopback).
  const sendToApp = async (user: User) => {
    if (!params) return;
    const idToken = await user.getIdToken();
    const res = await fetch("/api/desktop/code", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
    });
    const data = (await res.json().catch(() => ({}))) as { code?: string };
    if (!res.ok || !data.code) throw new Error("code");
    window.location.href =
      `http://127.0.0.1:${params.porta}/callback?code=${data.code}&state=${params.state}`;
  };

  const run = async (fn: () => Promise<User>) => {
    setError(null);
    setBusy(true);
    try {
      await sendToApp(await fn());
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/account-exists-with-different-credential") {
        setError(t("existsWithPassword"));
      } else if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setError(tErr(code));
      } else {
        setError(t("genericError"));
      }
      setBusy(false);
    }
  };

  const loginGoogle = () =>
    run(async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { signInWithPopup } = await import("firebase/auth");
      const { auth, googleProvider } = await getFirebase();
      return (await signInWithPopup(auth, googleProvider)).user;
    });

  const continueAsCurrent = () => run(async () => current!);

  const btn =
    "w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer";

  return (
    <main className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div
        className="w-full max-w-md rounded-2xl p-8 text-center"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
      >
        <h1 className="text-xl font-semibold mb-2">{t("title")}</h1>

        {params === undefined ? null : params === null ? (
          <p role="alert" style={{ color: "var(--neg)" }} className="text-sm mt-4">
            {t("invalidLink")}
          </p>
        ) : (
          <>
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              {t("subtitle")}
            </p>

            {current?.email && (
              <button
                type="button"
                onClick={continueAsCurrent}
                disabled={busy}
                className={`${btn} mb-3`}
                style={{ background: "var(--brand)", color: "var(--brand-on)" }}
              >
                {t("continueAs", { email: current.email })}
              </button>
            )}

            <button
              type="button"
              onClick={loginGoogle}
              disabled={busy}
              className={btn}
              style={
                current?.email
                  ? { background: "var(--sunken)", color: "var(--text)" }
                  : { background: "var(--brand)", color: "var(--brand-on)" }
              }
            >
              {busy ? t("working") : current?.email ? t("useOther") : t("google")}
            </button>

            {error && (
              <p role="alert" style={{ color: "var(--neg)" }} className="text-sm mt-4">
                {error}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
