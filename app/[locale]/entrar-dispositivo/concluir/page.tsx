"use client";

// app/[locale]/entrar-dispositivo/concluir/page.tsx
// Carregada DENTRO do app desktop depois que o navegador do sistema devolveu o
// código (?code=…). Resgata o código em /api/desktop/exchange, entra com o custom
// token do Firebase e segue pro dashboard. Ver desktop/src/device-login.ts.
export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";

export default function ConcluirDispositivoPage() {
  const t = useTranslations("auth.desktopLogin");
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  // O código é de uso único: no StrictMode (dev) o efeito roda 2x, e a 2ª chamada
  // falharia. O ref sobrevive à re-execução e trava a duplicata.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const code = new URLSearchParams(window.location.search).get("code") ?? "";
        const res = await fetch("/api/desktop/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const data = (await res.json().catch(() => ({}))) as { customToken?: string };
        if (!res.ok || !data.customToken) throw new Error("exchange");

        const { getFirebase } = await import("@/lib/firebase");
        const { signInWithCustomToken } = await import("firebase/auth");
        const { auth } = await getFirebase();
        await signInWithCustomToken(auth, data.customToken);
        router.replace("/dashboard");
      } catch {
        setFailed(true);
      }
    })();
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div
        className="w-full max-w-md rounded-2xl p-8 text-center"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
      >
        {failed ? (
          <>
            <p role="alert" style={{ color: "var(--neg)" }} className="text-sm mb-4">
              {t("finishError")}
            </p>
            <Link href="/login" className="text-sm font-semibold" style={{ color: "var(--brand)" }}>
              {t("backToLogin")}
            </Link>
          </>
        ) : (
          <p role="status" className="text-sm" style={{ color: "var(--text-muted)" }}>
            {t("finishing")}
          </p>
        )}
      </div>
    </main>
  );
}
