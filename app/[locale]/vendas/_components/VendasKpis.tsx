"use client";

import { useLocale, useTranslations } from "next-intl";
import { DollarSign, Wallet, ShoppingCart, Receipt, Target } from "lucide-react";
import { KpiTile } from "@/app/components/ui";
import { pctChange, toBRL } from "./shared";
import type { Resumo } from "./useVendasData";

interface PontoEquilibrio {
  meta: number; vendido: number; pct: number; atingido: boolean; falta: number; superavit: number;
}

/** Linha de KPIs: bruto, líquido, pedidos, ticket e ponto de equilíbrio. */
export function VendasKpis({ atual, anterior, pe }: { atual: Resumo; anterior: Resumo; pe: PontoEquilibrio }) {
  const t = useTranslations("vendas.kpi");

  // "▲ 12% vs. mês anterior" — sem base de comparação vira "sem histórico".
  const delta = (cur: number, prev: number) => {
    const p = pctChange(cur, prev);
    if (p === null) return { text: cur > 0 ? t("noHistory") : undefined, tone: "neutral" as const };
    const arrow = p > 0.5 ? "▲" : p < -0.5 ? "▼" : "•";
    return {
      text: t("vsPrev", { value: `${arrow} ${Math.abs(p).toFixed(0)}%` }),
      tone: p > 0.5 ? ("pos" as const) : p < -0.5 ? ("neg" as const) : ("neutral" as const),
    };
  };

  const dBruto = delta(atual.bruto, anterior.bruto);
  const dLiq = delta(atual.liquido, anterior.liquido);
  const dPed = delta(atual.pedidos, anterior.pedidos);
  const dTicket = delta(atual.ticket, anterior.ticket);
  const locale = useLocale();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <KpiTile icon={DollarSign} label={t("gross")} value={toBRL(atual.bruto, locale)} delta={dBruto.text} deltaTone={dBruto.tone} />
      <KpiTile
        icon={Wallet}
        label={t("net")}
        value={toBRL(atual.liquido, locale)}
        delta={atual.taxas > 0 ? t("feesHint", { value: toBRL(atual.taxas, locale) }) : dLiq.text}
        deltaTone={atual.taxas > 0 ? "neutral" : dLiq.tone}
      />
      <KpiTile
        icon={ShoppingCart}
        label={t("orders")}
        value={`${atual.pedidos}`}
        delta={dPed.text ?? t("unitsHint", { count: atual.unidades })}
        deltaTone={dPed.tone}
      />
      <KpiTile icon={Receipt} label={t("avgTicket")} value={toBRL(atual.ticket, locale)} delta={dTicket.text} deltaTone={dTicket.tone} />
      <BreakEvenTile pe={pe} />
    </div>
  );
}

// Ponto de equilíbrio do mês: faturamento necessário pra cobrir o orçamento
// (centros de custo + contas a pagar + impostos que vencem no mês — mesma
// conta do KPI "Orçamento" do Fluxo de Caixa).
function BreakEvenTile({ pe }: { pe: PontoEquilibrio }) {
  const t = useTranslations("vendas.breakEven");
  const locale = useLocale();

  return (
    <div
      className="flex flex-col gap-1.5 p-4 sm:col-span-2 xl:col-span-1"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)" }}
      title={t("subtitle")}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        <Target size={14} /> {t("title")}
      </span>
      {pe.meta <= 0 ? (
        <span className="text-xs leading-snug" style={{ color: "var(--text-subtle)" }}>{t("noBudgetShort")}</span>
      ) : (
        <>
          <span className="mono text-xl font-medium tracking-tight" style={{ color: pe.atingido ? "var(--pos)" : "var(--text)" }}>
            {pe.pct.toFixed(0)}%
            <span className="ml-1.5 text-xs font-normal" style={{ color: "var(--text-subtle)" }}>
              {t("ofTarget", { value: toBRL(pe.meta, locale) })}
            </span>
          </span>
          <div
            className="h-1.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--sunken)" }}
            role="progressbar"
            aria-valuenow={Math.round(pe.pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("title")}
          >
            <div className="h-full rounded-full" style={{ width: `${pe.pct}%`, background: pe.atingido ? "var(--pos)" : "var(--brand)" }} />
          </div>
          <span className="text-xs font-semibold" style={{ color: pe.atingido ? "var(--pos)" : "var(--text-subtle)" }}>
            {pe.atingido ? t("surplusShort", { value: toBRL(pe.superavit, locale) }) : t("missingShort", { value: toBRL(pe.falta, locale) })}
          </span>
        </>
      )}
    </div>
  );
}
