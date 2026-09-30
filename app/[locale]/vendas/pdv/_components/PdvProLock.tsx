"use client";

import type { User } from "firebase/auth";
import { useTranslations } from "next-intl";
import { ArrowLeft, Lock, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import Navbar from "@/app/components/Navbar";
import { Card } from "@/app/components/ui";

/** PDV é recurso do plano Pro — quem não é Pro (inclusive em trial) vê este convite. */
export function PdvProLock({ user, onLogout }: { user: User; onLogout: () => void }) {
  const t = useTranslations("vendas.pdv.proLock");
  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)" }}>
      <Navbar activePath="/vendas" user={user} onLogout={onLogout} />
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <Card className="w-full max-w-md text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--brand-weak)" }}>
            <Lock size={20} style={{ color: "var(--brand)" }} />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--brand)" }}>{t("badge")}</span>
          <h1 className="mt-1 font-display text-lg font-bold" style={{ color: "var(--text)" }}>{t("title")}</h1>
          <p className="mb-5 mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{t("body")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href="/vendas"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-semibold no-underline"
              style={{ borderColor: "var(--border-strong)", color: "var(--text)" }}
            >
              <ArrowLeft size={14} /> {t("back")}
            </Link>
            <Link
              href="/assinatura"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold no-underline"
              style={{ background: "var(--brand)", color: "var(--brand-on)" }}
            >
              <Sparkles size={14} /> {t("cta")}
            </Link>
          </div>
        </Card>
      </main>
    </div>
  );
}
