"use client";

import { useLocale, useTranslations } from "next-intl";
import { CANAIS_VISIVEIS, CANAL_INFO, toBRL, type Canal } from "./shared";

interface LinhaCanal {
  canal: Canal;
  total: number;
  pedidos: number;
  unidades: number;
  pct: number;
}

/** Participação de cada canal no mês + status de conexão dos marketplaces. */
export function ChannelBreakdown({
  linhas, conectados, lancarNoCaixa, selecionado, onSelect,
}: {
  linhas: LinhaCanal[];
  conectados: Record<Canal, boolean>;
  lancarNoCaixa: Partial<Record<Canal, boolean>>;
  selecionado: Canal | "todos";
  onSelect: (c: Canal | "todos") => void;
}) {
  const t = useTranslations("vendas");
  const locale = useLocale();
  const label = (c: Canal) => (c === "manual" ? t("channels.manual") : CANAL_INFO[c].label);

  return (
    <section
      className="flex flex-col p-4"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)" }}
    >
      <h2 className="mb-3 text-sm font-semibold" style={{ color: "var(--text)" }}>{t("byChannel.title")}</h2>

      <ul className="flex flex-col gap-1">
        {linhas.map((l) => {
          const ativo = selecionado === l.canal;
          return (
            <li key={l.canal}>
              {/* Clicar filtra a página pelo canal (clicar de novo limpa). */}
              <button
                type="button"
                onClick={() => onSelect(ativo ? "todos" : l.canal)}
                aria-pressed={ativo}
                className="w-full cursor-pointer rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--sunken)]"
                style={ativo ? { background: "var(--brand-weak)" } : undefined}
              >
                <div className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="flex items-center gap-2" style={{ color: "var(--text)" }}>
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CANAL_INFO[l.canal].solid }} />
                    {label(l.canal)}
                  </span>
                  <span className="mono font-medium" style={{ color: "var(--text)" }}>{toBRL(l.total, locale)}</span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--sunken)" }}>
                  <div className="h-full rounded-full" style={{ width: `${l.pct}%`, background: CANAL_INFO[l.canal].solid }} />
                </div>
                <div className="mt-1 flex justify-between text-[11px]" style={{ color: "var(--text-subtle)" }}>
                  <span>{t("byChannel.ordersUnits", { orders: l.pedidos, units: l.unidades })}</span>
                  <span className="mono">{l.pct.toFixed(0)}%</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-3 text-[11px]" style={{ borderTop: "1px solid var(--border)", color: "var(--text-subtle)" }}>
        {CANAIS_VISIVEIS.map((c) => (
          <span key={c} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: conectados[c] ? "var(--pos)" : "var(--border-strong)" }} />
            {CANAL_INFO[c].label} · {conectados[c] ? t("channels.connected") : t("channels.notConnected")}
            {lancarNoCaixa[c] === false && ` · ${t("channels.offCashflow")}`}
          </span>
        ))}
      </div>
    </section>
  );
}
