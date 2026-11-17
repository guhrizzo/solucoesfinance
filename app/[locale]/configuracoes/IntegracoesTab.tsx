"use client";

// app/configuracoes/IntegracoesTab.tsx
// Aba Integrações (só o dono da conta): marketplaces (mesmo componente do
// Estoque) e bancos/pagamentos (somente leitura). O adm supremo recebe, abaixo,
// o painel de operação da equipe via `adminSlot`.

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import MarketplaceConnections, { useIntegrationReturnToast } from "@/app/components/integracoes/MarketplaceConnections";
import BancosPagamentosSection from "./BancosPagamentosSection";

type ShowToast = (msg: string, type?: "success" | "error" | "info" | "warning") => void;

export default function IntegracoesTab({
  ownerUid,
  isPro,
  isAdmin,
  showToast,
  adminSlot,
}: {
  ownerUid: string;
  isPro: boolean;
  isAdmin: boolean;
  showToast: ShowToast;
  adminSlot?: ReactNode;
}) {
  const t = useTranslations("configuracoes.integracoes");
  // Retorno do OAuth (?integration=…): esta página não é o Estoque, então o toast é por conta daqui.
  useIntegrationReturnToast(showToast);

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>{t("marketplacesTitle")}</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>{t("marketplacesDesc")}</p>
        </div>
        <div className="rounded-2xl p-5" style={{ background: "var(--cf-card)", border: "1px solid var(--cf-border)" }}>
          <MarketplaceConnections ownerUid={ownerUid} returnTo="/configuracoes" showToast={showToast} />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>{t("banksTitle")}</h2>
          <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>{t("banksDesc")}</p>
        </div>
        <BancosPagamentosSection ownerUid={ownerUid} isPro={isPro} />
      </section>

      {isAdmin && adminSlot && (
        <section className="space-y-3 pt-6" style={{ borderTop: "1px solid var(--cf-border)" }}>
          <h2 className="text-sm font-bold" style={{ color: "var(--db-text)" }}>{t("adminTitle")}</h2>
          {adminSlot}
        </section>
      )}
    </div>
  );
}
