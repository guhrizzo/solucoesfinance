"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChefHat } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/app/hooks/useAuth";
import { useSubscription } from "@/app/hooks/useSubscription";
import { canUseRestaurante } from "@/lib/billing";
import { calcularAlertas } from "@/lib/restaurante/alertas";
import Navbar from "@/app/components/Navbar";
import AccessDenied from "@/app/components/AccessDenied";
import { Button, EmptyState, PageHeader, PageLoader, Pill } from "@/app/components/ui";
import { useRestauranteData } from "./_components/useRestauranteData";
import { PedidosTab } from "./_components/PedidosTab";
import { ProducaoTab } from "./_components/ProducaoTab";
import { IngredientesTab } from "./_components/IngredientesTab";
import { PratosTab } from "./_components/PratosTab";
import { AlertasTab } from "./_components/AlertasTab";

// Restaurante (plano Pro) — pedidos por status (quadro da cozinha), produção,
// estoque de ingredientes, pratos/ficha técnica e alertas de falta de insumo.
// A tela LÊ em tempo real (Firestore); toda escrita passa por /api/restaurante/**.
type Tab = "pedidos" | "producao" | "ingredientes" | "pratos" | "alertas";
const TABS: Tab[] = ["pedidos", "producao", "ingredientes", "pratos", "alertas"];

export default function RestaurantePage() {
  const t = useTranslations("restaurante");
  const tNav = useTranslations("nav");
  const { user, loading: authLoading } = useAuth();
  const sub = useSubscription();
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [negado, setNegado] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("pedidos");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { resolveAccountScope, hasPermission } = await import("@/lib/accountScope");
      const scope = await resolveAccountScope(db, user.uid);
      if (cancelled) return;
      const ok = hasPermission(scope, "restaurante");
      setNegado(!ok);
      if (ok) setOwnerUid(scope.ownerUid);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const habilitado = canUseRestaurante(sub);
  const dados = useRestauranteData(habilitado && !sub.loading ? ownerUid : null);
  const alertas = useMemo(() => calcularAlertas(dados.ingredientes, dados.pratos, dados.pedidos), [dados.ingredientes, dados.pratos, dados.pedidos]);

  async function handleLogout() {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  if (negado === true) return <AccessDenied category={tNav("items.restaurante")} />;
  if (authLoading || sub.loading || negado === null) return <PageLoader />;
  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "var(--bg)" }}>
      <Navbar activePath="/restaurante" user={user} onLogout={handleLogout} hidePeriod />
      <main className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6 pb-24 sm:px-6">
        <PageHeader
          title={t("title")}
          subtitle={t("subtitle")}
          badge={habilitado && alertas.total > 0 ? (
            <button type="button" className="cursor-pointer" onClick={() => setTab("alertas")} aria-label={t("alertas.verTodos")}>
              <Pill tone="neg" dot>{t("alertasBadge", { count: alertas.total })}</Pill>
            </button>
          ) : undefined}
        />

        {!habilitado ? (
          <EmptyState
            icon={ChefHat}
            title={t("lock.title")}
            description={t("lock.body")}
            action={<Link href="/assinatura"><Button>{t("lock.cta")}</Button></Link>}
          />
        ) : dados.loading ? (
          <PageLoader />
        ) : (
          <>
            {dados.erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{t("comum.erroCarregar")}</p>}
            <div role="tablist" aria-label={t("title")} className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--border)" }}>
              {TABS.map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-semibold"
                  style={{
                    color: tab === k ? "var(--brand)" : "var(--text-muted)",
                    borderBottom: `2px solid ${tab === k ? "var(--brand)" : "transparent"}`,
                    marginBottom: -1,
                  }}
                >
                  {t(`tabs.${k}`)}
                  {k === "alertas" && alertas.total > 0 && <Pill tone="neg">{alertas.total}</Pill>}
                </button>
              ))}
            </div>
            {tab === "pedidos" && <PedidosTab dados={dados} alertas={alertas} />}
            {tab === "producao" && <ProducaoTab dados={dados} />}
            {tab === "ingredientes" && <IngredientesTab dados={dados} />}
            {tab === "pratos" && <PratosTab dados={dados} alertas={alertas} />}
            {tab === "alertas" && <AlertasTab dados={dados} alertas={alertas} />}
          </>
        )}
      </main>
    </div>
  );
}
