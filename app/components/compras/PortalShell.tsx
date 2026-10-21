"use client";

// Moldura do portal do fornecedor — independente do app interno (sem Navbar,
// sem dados financeiros): marca, empresa compradora atual (troca, se o login
// atende mais de uma), tema e sair. Também cuida dos estados de bloqueio
// (e-mail não verificado, acesso revogado).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LogOut, MailCheck, ShieldAlert, Store, RefreshCw } from "lucide-react";
import { Button, Card, PageLoader } from "@/app/components/ui";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { portalApi } from "./api";
import { errorText, controlClass, controlStyle } from "./shared";
import type { usePortalSession } from "./usePortalSession";

type Session = ReturnType<typeof usePortalSession>;

export function PortalHeader({ session }: { session: Session }) {
  const t = useTranslations("compras.portal");
  const links = session.me?.links ?? [];
  return (
    <header className="sticky top-0 z-30" style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--brand-weak)", color: "var(--brand)" }}>
          <Store size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-bold leading-tight" style={{ color: "var(--text)" }}>{t("brand")}</p>
          <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{t("poweredBy")}</p>
        </div>
        {links.length > 1 ? (
          <select aria-label={t("switchCompany")} value={session.me?.current ?? ""} onChange={(e) => session.switchCompany(e.target.value)}
            className={`${controlClass} hidden max-w-[220px] py-1.5 text-xs sm:block`} style={controlStyle}>
            {links.map((l) => <option key={l.key} value={l.key}>{l.companyName}</option>)}
          </select>
        ) : session.company ? (
          <span className="hidden max-w-[220px] truncate text-xs font-semibold sm:block" style={{ color: "var(--text-muted)" }} title={t("company")}>
            {session.company}
          </span>
        ) : null}
        <ThemeToggle className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--sunken)]" />
        {session.user && (
          <Button type="button" variant="ghost" size="sm" icon={LogOut} onClick={session.logout} aria-label={t("logout")}>
            <span className="hidden sm:inline">{t("logout")}</span>
          </Button>
        )}
      </div>
      {links.length > 1 && (
        <div className="px-4 pb-3 sm:hidden">
          <select aria-label={t("switchCompany")} value={session.me?.current ?? ""} onChange={(e) => session.switchCompany(e.target.value)}
            className={`${controlClass} py-1.5 text-xs`} style={controlStyle}>
            {links.map((l) => <option key={l.key} value={l.key}>{l.companyName}</option>)}
          </select>
        </div>
      )}
    </header>
  );
}

export function PortalShell({ session, children }: { session: Session; children: React.ReactNode }) {
  const t = useTranslations("compras.portal");
  const tErr = useTranslations("compras.errors");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  if (session.state === "loading") return <PageLoader />;

  async function resend() {
    setSending(true);
    setMsg("");
    try {
      await portalApi("/verify-email", { method: "POST" });
      setMsg(t("verify.sent"));
    } catch (err) {
      setMsg(errorText(tErr, err));
    } finally {
      setSending(false);
    }
  }

  let body: React.ReactNode = children;
  if (session.state === "unverified") {
    body = (
      <Gate icon={MailCheck} title={t("verify.title")} desc={t("verify.desc", { email: session.me?.email ?? "" })}>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="secondary" loading={sending} onClick={resend}>{t("verify.resend")}</Button>
          <Button type="button" icon={RefreshCw} onClick={session.refreshVerification}>{t("verify.checkAgain")}</Button>
        </div>
        {msg && <p role="status" className="text-sm" style={{ color: "var(--text-muted)" }}>{msg}</p>}
      </Gate>
    );
  } else if (session.state === "noAccess" || session.state === "error") {
    body = (
      <Gate icon={ShieldAlert} title={t("noAccess.title")} desc={session.state === "error" ? session.error : t("noAccess.desc")}>
        <Button type="button" variant="secondary" icon={LogOut} onClick={session.logout}>{t("logout")}</Button>
      </Gate>
    );
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)" }}>
      <PortalHeader session={session} />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-4 py-6 pb-24 sm:px-6">{body}</main>
    </div>
  );
}

function Gate({ icon: Icon, title, desc, children }: { icon: typeof Store; title: string; desc: string; children: React.ReactNode }) {
  return (
    <Card className="mx-auto mt-10 max-w-md space-y-4 text-center" padding="lg">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--brand-weak)", color: "var(--brand)" }}>
        <Icon size={22} />
      </span>
      <h1 className="font-display text-lg font-bold" style={{ color: "var(--text)" }}>{title}</h1>
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>{desc}</p>
      {children}
    </Card>
  );
}
