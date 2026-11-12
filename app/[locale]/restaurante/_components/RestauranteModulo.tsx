"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChefHat } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useSubscription } from "@/app/hooks/useSubscription";
import { canUseRestaurante } from "@/lib/billing";
import { calcularAlertas } from "@/lib/restaurante/alertas";
import { Button, EmptyState, PageLoader, Pill } from "@/app/components/ui";
import { useRestauranteData } from "./useRestauranteData";
import { PedidosTab } from "./PedidosTab";
import { ProducaoTab } from "./ProducaoTab";
import { IngredientesTab } from "./IngredientesTab";
import { PratosTab } from "./PratosTab";
import { AlertasTab } from "./AlertasTab";

// Restaurante (plano Pro) — pedidos por status (quadro da cozinha), produção,
// estoque de ingredientes, pratos/ficha técnica e alertas de falta de insumo.
// Renderizado como uma visão dentro de /estoque. A tela LÊ em tempo real
// (Firestore); toda escrita passa por /api/restaurante/**.
type Tab = "pedidos" | "producao" | "ingredientes" | "pratos" | "alertas";
const TABS: Tab[] = ["pedidos", "producao", "ingredientes", "pratos", "alertas"];

export default function RestauranteModulo({ ownerUid }: { ownerUid: string }) {
  const t = useTranslations("restaurante");
  const sub = useSubscription();
  const [tab, setTab] = useState<Tab>("pedidos");

  const habilitado = canUseRestaurante(sub);
  const dados = useRestauranteData(habilitado && !sub.loading ? ownerUid : null);
  const alertas = useMemo(() => calcularAlertas(dados.ingredientes, dados.pratos, dados.pedidos), [dados.ingredientes, dados.pratos, dados.pedidos]);

  if (sub.loading) return <PageLoader />;

  if (!habilitado) {
    return (
      <EmptyState
        icon={ChefHat}
        title={t("lock.title")}
        description={t("lock.body")}
        action={<Link href="/assinatura"><Button>{t("lock.cta")}</Button></Link>}
      />
    );
  }

  if (dados.loading) return <PageLoader />;

  return (
    <section className="space-y-6" aria-label={t("title")}>
      <div>
        <h2 className="font-heading text-2xl font-bold tracking-tight" style={{ color: "var(--text)" }}>{t("title")}</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{t("subtitle")}</p>
      </div>
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
    </section>
  );
}
