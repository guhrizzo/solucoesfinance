"use client";

import { useLocale, useTranslations } from "next-intl";
import { BellRing, CheckCircle2 } from "lucide-react";
import { Card, EmptyState, Pill } from "@/app/components/ui";
import type { Alertas } from "@/lib/restaurante/alertas";
import type { RestauranteData } from "./useRestauranteData";
import { fmtQtd } from "./shared";

/** Painel de alertas de falta de insumo (calculado ao vivo — lib/restaurante/alertas.ts). */
export function AlertasTab({ dados, alertas }: { dados: RestauranteData; alertas: Alertas }) {
  const t = useTranslations("restaurante");
  const locale = useLocale();
  const unidades = new Map(dados.ingredientes.map((i) => [i.id, i.unidadeExibicao]));

  if (alertas.total === 0) {
    return <EmptyState icon={CheckCircle2} title={t("alertas.vazio")} description={t("alertas.vazioDesc")} />;
  }

  return (
    <div className="space-y-6">
      {alertas.ingredientes.length > 0 && (
        <Card className="space-y-3">
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("alertas.ingredientesTitulo")}</h2>
          <ul className="space-y-2">
            {alertas.ingredientes.map((a) => {
              const u = unidades.get(a.ingredienteId) ?? a.unidadeBase;
              return (
                <li key={`${a.tipo}-${a.ingredienteId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-3" style={{ border: "1px solid var(--border)" }}>
                  <span className="flex flex-wrap items-center gap-2">
                    <Pill tone={a.tipo === "abaixo_minimo" ? "warn" : "neg"} dot>{t(`alertas.tipo.${a.tipo}`)}</Pill>
                    <span className="font-semibold">{a.nome}</span>
                  </span>
                  <span className="mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {t("alertas.saldo")}: {fmtQtd(a.saldo, u, locale)}
                    {a.tipo === "abaixo_minimo" && ` · ${t("alertas.minimo")}: ${fmtQtd(a.minimo, u, locale)}`}
                    {a.tipo === "nao_cobre_pedidos" && ` · ${t("alertas.necessario")}: ${fmtQtd(a.necessario ?? 0, u, locale)}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      {alertas.pratosIndisponiveis.length > 0 && (
        <Card className="space-y-3">
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("alertas.pratosTitulo")}</h2>
          <ul className="space-y-2">
            {alertas.pratosIndisponiveis.map((p) => (
              <li key={p.pratoId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-3" style={{ border: "1px solid var(--border)" }}>
                <span className="flex items-center gap-2"><Pill tone="neg">{t("pratos.indisponivel")}</Pill><span className="font-semibold">{p.nome}</span></span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{t("alertas.faltam")}: {p.faltam.map((f) => f.nome).join(", ")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="flex items-start gap-2 text-xs" style={{ color: "var(--text-subtle)" }}>
        <BellRing size={14} aria-hidden="true" className="mt-0.5 shrink-0" /> {t("alertas.whatsappHint")}
      </p>
    </div>
  );
}
