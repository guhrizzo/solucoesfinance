"use client";

import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button, Input } from "@/app/components/ui";
import type { Ingrediente, ItemFicha } from "@/lib/restaurante/tipos";
import { lerNumero, paraCampo, selectClass, selectStyle } from "./shared";

/** Linha da ficha no formulário (texto, pra aceitar vírgula enquanto digita). */
export interface LinhaFichaForm {
  ingredienteId: string;
  quantidade: string;
  perdaPct: string;
}

export function fichaParaForm(ficha: ItemFicha[] | undefined, locale: string): LinhaFichaForm[] {
  return (ficha ?? []).map((f) => ({ ingredienteId: f.ingredienteId, quantidade: paraCampo(f.quantidade, locale), perdaPct: paraCampo(f.perdaPct, locale) }));
}

/** Formulário → corpo da API (o servidor valida de novo). Linhas sem ingrediente são ignoradas. */
export function fichaParaPayload(linhas: LinhaFichaForm[]) {
  return linhas
    .filter((l) => l.ingredienteId)
    .map((l) => ({ ingredienteId: l.ingredienteId, quantidade: lerNumero(l.quantidade), perdaPct: lerNumero(l.perdaPct) || 0 }));
}

/**
 * Editor de ficha técnica (prato) ou de receita (preparo). Quantidade sempre
 * na unidade BASE do ingrediente (g, ml, un) — é o que a ficha guarda.
 */
export function FichaEditor({
  linhas, onChange, ingredientes, rotulo,
}: {
  linhas: LinhaFichaForm[];
  onChange: (l: LinhaFichaForm[]) => void;
  ingredientes: Ingrediente[];
  rotulo: string;
}) {
  const t = useTranslations("restaurante.ficha");
  const porId = new Map(ingredientes.map((i) => [i.id, i]));
  const set = (i: number, p: Partial<LinhaFichaForm>) => onChange(linhas.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{rotulo}</legend>
      {linhas.length === 0 && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("vazia")}</p>}
      {linhas.map((l, i) => {
        const ing = porId.get(l.ingredienteId);
        return (
          <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[1fr_8rem_6rem_auto]">
            <select
              aria-label={t("ingrediente")}
              className={`${selectClass} col-span-2 sm:col-span-1`}
              style={selectStyle}
              value={l.ingredienteId}
              onChange={(e) => set(i, { ingredienteId: e.target.value })}
            >
              <option value="">{t("escolher")}</option>
              {ingredientes.map((x) => (
                <option key={x.id} value={x.id} disabled={linhas.some((o, j) => j !== i && o.ingredienteId === x.id)}>
                  {x.nome}{x.preparo ? ` (${t("preparo")})` : ""}{!x.ativo ? ` (${t("inativo")})` : ""}
                </option>
              ))}
            </select>
            <span className="flex items-center gap-1">
              <Input aria-label={t("quantidade")} inputMode="decimal" className="!py-2 text-right" placeholder="0" value={l.quantidade} onChange={(e) => set(i, { quantidade: e.target.value })} />
              <span className="w-6 text-xs" style={{ color: "var(--text-subtle)" }}>{ing?.unidadeBase ?? ""}</span>
            </span>
            <span className="flex items-center gap-1">
              <Input aria-label={t("perda")} title={t("perdaHint")} inputMode="decimal" className="!py-2 text-right" placeholder="0" value={l.perdaPct} onChange={(e) => set(i, { perdaPct: e.target.value })} />
              <span className="text-xs" style={{ color: "var(--text-subtle)" }}>%</span>
            </span>
            <Button size="sm" variant="ghost" icon={Trash2} aria-label={t("remover")} onClick={() => onChange(linhas.filter((_, j) => j !== i))} />
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="secondary" icon={Plus} onClick={() => onChange([...linhas, { ingredienteId: "", quantidade: "", perdaPct: "" }])}>{t("adicionar")}</Button>
        <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("legenda")}</span>
      </div>
    </fieldset>
  );
}
