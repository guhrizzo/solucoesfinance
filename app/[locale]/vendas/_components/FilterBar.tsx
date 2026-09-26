"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Calendar, ChevronLeft, ChevronRight, FilterX } from "lucide-react";
import { CANAIS_QUEBRA, CANAL_INFO, type Canal, type VendasFiltros } from "./shared";

interface FilterBarProps {
  periodLabel: string;
  isCurrentMonth: boolean;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  filtros: VendasFiltros;
  onChange: (f: VendasFiltros) => void;
  produtos: { sku: string; name: string }[];
}

const fieldStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border-strong)",
  color: "var(--text)",
} as const;

/**
 * Barra de filtros no estilo SAP Fiori: fica logo abaixo do cabeçalho e os
 * valores escolhidos valem pra página inteira (KPIs, gráfico, rankings, lista).
 */
export function FilterBar({
  periodLabel, isCurrentMonth, onPrevMonth, onNextMonth, filtros, onChange, produtos,
}: FilterBarProps) {
  const t = useTranslations("vendas.filters");
  const tNav = useTranslations("nav");
  const tCh = useTranslations("vendas.channels");
  const canalId = useId();
  const skuId = useId();
  const ativo = filtros.canal !== "todos" || filtros.sku !== "";

  return (
    <div
      className="flex flex-wrap items-end gap-x-5 gap-y-3 px-4 py-3"
      style={{ background: "var(--sunken)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)" }}
    >
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{t("period")}</span>
        <div className="flex h-9 items-center overflow-hidden rounded-lg" style={fieldStyle}>
          <button
            type="button"
            onClick={onPrevMonth}
            aria-label={tNav("period.prevMonth")}
            className="grid h-full w-8 cursor-pointer place-items-center transition-colors hover:bg-[var(--sunken)]"
            style={{ color: "var(--text-muted)" }}
          >
            <ChevronLeft size={15} />
          </button>
          <span className="mono flex select-none items-center gap-1.5 px-2 text-[13px] font-medium">
            <Calendar size={13} style={{ color: "var(--text-subtle)" }} /> {periodLabel}
          </span>
          <button
            type="button"
            onClick={onNextMonth}
            disabled={isCurrentMonth}
            aria-label={tNav("period.nextMonth")}
            className="grid h-full w-8 cursor-pointer place-items-center transition-colors hover:bg-[var(--sunken)] disabled:cursor-not-allowed disabled:opacity-30"
            style={{ color: "var(--text-muted)" }}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={canalId} className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{t("channel")}</label>
        <select
          id={canalId}
          value={filtros.canal}
          onChange={(e) => onChange({ ...filtros, canal: e.target.value as Canal | "todos" })}
          className="h-9 min-w-[160px] cursor-pointer rounded-lg px-2.5 text-[13px] outline-none"
          style={fieldStyle}
        >
          <option value="todos">{t("allChannels")}</option>
          {CANAIS_QUEBRA.map((c) => (
            <option key={c} value={c}>{c === "manual" ? tCh("manual") : CANAL_INFO[c].label}</option>
          ))}
        </select>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={skuId} className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{t("product")}</label>
        <select
          id={skuId}
          value={filtros.sku}
          onChange={(e) => onChange({ ...filtros, sku: e.target.value })}
          className="h-9 w-full max-w-[260px] min-w-[180px] cursor-pointer rounded-lg px-2.5 text-[13px] outline-none"
          style={fieldStyle}
        >
          <option value="">{t("allProducts")}</option>
          {produtos.map((p) => (
            <option key={p.sku} value={p.sku}>{p.name === p.sku ? p.sku : `${p.name} · ${p.sku}`}</option>
          ))}
        </select>
      </div>

      <span className="self-center text-[12px]" style={{ color: "var(--text-subtle)" }}>
        {t("compareHint")}
      </span>

      {ativo && (
        <button
          type="button"
          onClick={() => onChange({ canal: "todos", sku: "" })}
          className="ml-auto flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--surface)]"
          style={{ color: "var(--brand)" }}
        >
          <FilterX size={14} /> {t("clear")}
        </button>
      )}
    </div>
  );
}
