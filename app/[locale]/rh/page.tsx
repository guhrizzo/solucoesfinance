"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Briefcase } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/app/hooks/useAuth";
import { useSubscription } from "@/app/hooks/useSubscription";
import { isProAccess } from "@/lib/billing";
import Navbar from "@/app/components/Navbar";
import AccessDenied from "@/app/components/AccessDenied";
import { Button, EmptyState, PageHeader, PageLoader } from "@/app/components/ui";
import { ColaboradoresTab } from "./_components/ColaboradoresTab";
import { CustoTab } from "./_components/CustoTab";
import { ComissoesTab } from "./_components/ComissoesTab";
import { EncargosTab } from "./_components/EncargosTab";
import { AuditoriaTab } from "./_components/AuditoriaTab";
import { RetornoPorPessoa } from "./_components/RetornoPorPessoa";
import { FolhaTab } from "./_components/FolhaTab";
import { MeusHolerites } from "./_components/MeusHolerites";

// RH — cadastro de colaboradores, histórico com vigência (salário, benefícios,
// encargos, alocação), custo mensal por competência e comissões. Os dados sensíveis
// só trafegam pelas rotas /api/rh/** (nada é lido direto do Firestore aqui).
type Tab = "colaboradores" | "custo" | "comissoes" | "folha" | "encargos" | "auditoria" | "retorno";
const TABS: Tab[] = ["colaboradores", "custo", "comissoes", "folha", "encargos", "auditoria"];

export default function RhPage() {
  const t = useTranslations("rh");
  const { user, loading: authLoading } = useAuth();
  const sub = useSubscription();
  // gestor = permissão "rh"; proprio = só "rh_proprio" (vê apenas os próprios indicadores).
  const [acesso, setAcesso] = useState<"gestor" | "proprio" | "negado" | null>(null);
  const [tab, setTab] = useState<Tab>("colaboradores");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { resolveAccountScope, hasPermission } = await import("@/lib/accountScope");
      const scope = await resolveAccountScope(db, user.uid);
      if (!cancelled) setAcesso(hasPermission(scope, "rh") ? "gestor" : hasPermission(scope, "rh_proprio") ? "proprio" : "negado");
    })();
    return () => { cancelled = true; };
  }, [user]);

  async function handleLogout() {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  if (acesso === "negado") return <AccessDenied category={t("title")} />;
  if (authLoading || sub.loading || acesso === null) return <PageLoader />;
  if (!user) return null;

  const isPro = isProAccess(sub);

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)" }}>
      <Navbar activePath="/rh" user={user} onLogout={handleLogout} hidePeriod={acesso === "proprio" || (tab !== "custo" && tab !== "comissoes" && tab !== "folha")} />
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 pb-24 sm:px-6">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />

        {!isPro ? (
          <EmptyState
            icon={Briefcase}
            title={t("lock.title")}
            description={t("lock.body")}
            action={<Link href="/assinatura"><Button>{t("lock.cta")}</Button></Link>}
          />
        ) : (
          acesso === "proprio" ? (
            <>
              <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("tabs.meus")}</h2>
              <MeusHolerites />
              <RetornoPorPessoa />
            </>
          ) : (
          <>
            <div role="tablist" aria-label={t("title")} className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--border)" }}>
              {TABS.map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className="cursor-pointer whitespace-nowrap px-4 py-2.5 text-sm font-semibold"
                  style={{
                    color: tab === k ? "var(--brand)" : "var(--text-muted)",
                    borderBottom: `2px solid ${tab === k ? "var(--brand)" : "transparent"}`,
                    marginBottom: -1,
                  }}
                >
                  {t(`tabs.${k}`)}
                </button>
              ))}
            </div>
            {tab === "colaboradores" && <ColaboradoresTab />}
            {tab === "custo" && <CustoTab />}
            {tab === "comissoes" && <ComissoesTab />}
            {tab === "folha" && <FolhaTab />}
            {tab === "encargos" && <EncargosTab />}
            {tab === "auditoria" && <AuditoriaTab />}
          </>
          )
        )}
      </main>
    </div>
  );
}
