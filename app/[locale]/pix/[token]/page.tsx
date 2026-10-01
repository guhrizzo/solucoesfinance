// app/[locale]/pix/[token]/page.tsx
// Página pública aberta pelo botão "Copiar chave Pix" do e-mail de cobrança
// (e-mail não roda JS, então copiar acontece aqui). Lê o snapshot em
// pixLinks/{token} pelo Admin SDK — ver lib/pixLink.ts. Sem login, sem índice.

import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isPixLinkToken, type PixLinkDoc } from "@/lib/pixLink";
import { CopyButton } from "./CopyButton";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contasReceber.pixLink" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

type State = { kind: "ok"; link: PixLinkDoc } | { kind: "paid"; link: PixLinkDoc } | { kind: "invalid" };

async function load(token: string): Promise<State> {
  if (!isPixLinkToken(token)) return { kind: "invalid" };
  try {
    const db = await getAdminDb();
    const snap = await db.doc(`pixLinks/${token}`).get();
    if (!snap.exists) return { kind: "invalid" };
    const link = snap.data() as PixLinkDoc;
    if (!link.expiresAt || link.expiresAt < Date.now()) return { kind: "invalid" };
    // Cobrança apagada ou já recebida: não oferece mais a chave.
    const rec = await db.doc(`users/${link.ownerUid}/receivables/${link.receivableId}`).get();
    if (!rec.exists) return { kind: "invalid" };
    if (rec.data()?.status === "recebido") return { kind: "paid", link };
    return { kind: "ok", link };
  } catch (err) {
    console.error("Erro ao abrir link do Pix:", err);
    return { kind: "invalid" };
  }
}

export default async function PixLinkPage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  const t = await getTranslations({ locale, namespace: "contasReceber.pixLink" });
  const state = await load(token);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-md rounded-2xl p-6 sm:p-7 shadow-sm"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
        <div className="flex items-center gap-3 mb-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- SVG estático do public/ */}
          <img src="/pix.svg" alt="Pix" width={36} height={36} />
          <div>
            <h1 className="text-lg font-extrabold leading-tight">{t("title")}</h1>
            {state.kind !== "invalid" && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("to", { name: state.link.beneficiary })}</p>
            )}
          </div>
        </div>

        {state.kind === "invalid" && (
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{t("invalid")}</p>
        )}

        {state.kind === "paid" && (
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{t("paid")}</p>
        )}

        {state.kind === "ok" && (
          <div className="space-y-5">
            <div className="flex items-end justify-between gap-3 rounded-xl px-4 py-3" style={{ background: "var(--sunken)" }}>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{t("amount")}</p>
                <p className="text-xl font-extrabold">{state.link.amount}</p>
              </div>
              {state.link.dueDate && (
                <p className="text-xs text-right" style={{ color: "var(--text-muted)" }}>{t("due", { date: state.link.dueDate })}</p>
              )}
            </div>

            <section className="space-y-2">
              <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{t("keyLabel", { type: state.link.keyLabel })}</p>
              <p className="font-mono text-base font-bold break-all">{state.link.keyDisplay}</p>
              <CopyButton value={state.link.keyCopy} label={t("copyKey")} copiedLabel={t("copied")} primary />
            </section>

            <section className="space-y-2">
              <p className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{t("brCodeLabel")}</p>
              <p className="font-mono text-[11px] leading-relaxed break-all rounded-lg px-3 py-2"
                style={{ background: "var(--sunken)", color: "var(--text-muted)" }}>{state.link.copiaECola}</p>
              <CopyButton value={state.link.copiaECola} label={t("copyBrCode")} copiedLabel={t("copied")} />
            </section>

            <p className="text-xs leading-relaxed" style={{ color: "var(--text-subtle)" }}>{t("howTo")}</p>
          </div>
        )}

        <p className="mt-6 text-[11px]" style={{ color: "var(--text-subtle)" }}>{t("footer")}</p>
      </div>
    </main>
  );
}
