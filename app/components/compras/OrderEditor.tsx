"use client";

// Editor do pedido de compra (itens, ajustes, condições) — usado pelo portal do
// fornecedor (rascunho) e pela equipe (ajuste durante a análise). A prévia dos
// totais usa a MESMA função do servidor (lib/compras/calc), mas o valor
// oficial é sempre o recalculado no servidor ao salvar.

import { useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, MoneyInput, parseAmount, formatAmount } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { computeTotals } from "@/lib/compras/calc";
import { UNITS, type OrderAdjustments, type OrderEditable, type OrderItem } from "@/lib/compras/types";
import { controlClass, controlStyle } from "./shared";

export interface DraftItem {
  key: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

export interface OrderDraft {
  issueDate: string;
  validUntil: string;
  deliveryDays: string;
  paymentTerms: string;
  proposedInstallments: string;
  proposedFirstDueDays: string;
  notes: string;
  items: DraftItem[];
  adjustments: Record<keyof OrderAdjustments, string>;
}

let seq = 0;
const nextKey = () => `it${Date.now().toString(36)}${(seq++).toString(36)}`;

const moneyStr = (n: number) => (n ? formatAmount(n.toFixed(2).replace(".", ",")) : "");
const qtyStr = (n: number) => (n ? String(n).replace(".", ",") : "");
const parseQty = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;
const intOr = (s: string, d: number | null) => (s.trim() === "" ? d : Number.isFinite(Number(s)) ? Math.trunc(Number(s)) : d);

export const emptyItem = (): DraftItem => ({ key: nextKey(), description: "", quantity: "1", unit: "un", unitPrice: "" });

export function draftFromOrder(o: Partial<OrderEditable> | null, today: string): OrderDraft {
  return {
    issueDate: o?.issueDate || today,
    validUntil: o?.validUntil || "",
    deliveryDays: o?.deliveryDays != null ? String(o.deliveryDays) : "",
    paymentTerms: o?.paymentTerms || "",
    proposedInstallments: String(o?.proposedInstallments ?? 1),
    proposedFirstDueDays: String(o?.proposedFirstDueDays ?? 30),
    notes: o?.notes || "",
    items: (o?.items ?? []).map((it: OrderItem) => ({
      key: nextKey(), description: it.description, quantity: qtyStr(it.quantity), unit: it.unit, unitPrice: moneyStr(it.unitPrice),
    })),
    adjustments: {
      discount: moneyStr(o?.adjustments?.discount ?? 0),
      taxes: moneyStr(o?.adjustments?.taxes ?? 0),
      freight: moneyStr(o?.adjustments?.freight ?? 0),
      otherCosts: moneyStr(o?.adjustments?.otherCosts ?? 0),
    },
  };
}

/** Rascunho da tela → corpo da API (o servidor valida e recalcula tudo). */
export function draftToPayload(d: OrderDraft) {
  return {
    issueDate: d.issueDate,
    validUntil: d.validUntil,
    deliveryDays: intOr(d.deliveryDays, null),
    paymentTerms: d.paymentTerms,
    proposedInstallments: intOr(d.proposedInstallments, 1),
    proposedFirstDueDays: intOr(d.proposedFirstDueDays, 30),
    notes: d.notes,
    items: d.items.map((it) => ({ description: it.description, quantity: parseQty(it.quantity), unit: it.unit, unitPrice: parseAmount(it.unitPrice) })),
    adjustments: {
      discount: parseAmount(d.adjustments.discount),
      taxes: parseAmount(d.adjustments.taxes),
      freight: parseAmount(d.adjustments.freight),
      otherCosts: parseAmount(d.adjustments.otherCosts),
    },
  };
}

export function previewTotals(d: OrderDraft) {
  const p = draftToPayload(d);
  return computeTotals(p.items, p.adjustments);
}

interface Props {
  value: OrderDraft;
  onChange: (next: OrderDraft) => void;
  readOnly?: boolean;
  errors?: Record<string, string>;
}

export function OrderEditor({ value, onChange, readOnly = false, errors = {} }: Props) {
  const t = useTranslations("compras");
  const locale = useLocale();
  const uid = useId();
  const totals = previewTotals(value);
  const set = <K extends keyof OrderDraft>(k: K, v: OrderDraft[K]) => onChange({ ...value, [k]: v });
  const setItem = (i: number, patch: Partial<DraftItem>) =>
    set("items", value.items.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const money = (n: number) => formatMoney(n, locale);

  return (
    <div className="space-y-5">
      {/* Dados gerais */}
      <section aria-labelledby={`${uid}-gen`} className="space-y-3">
        <h3 id={`${uid}-gen`} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
          {t("order.general")}
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t("order.issueDate")} error={errors.issueDate}>
            <Input type="date" value={value.issueDate} disabled={readOnly} onChange={(e) => set("issueDate", e.target.value)} />
          </Field>
          <Field label={t("order.validUntil")} error={errors.validUntil}>
            <Input type="date" value={value.validUntil} disabled={readOnly} onChange={(e) => set("validUntil", e.target.value)} />
          </Field>
          <Field label={t("order.deliveryDays")} error={errors.deliveryDays}>
            <Input inputMode="numeric" value={value.deliveryDays} disabled={readOnly} maxLength={4}
              onChange={(e) => set("deliveryDays", e.target.value.replace(/\D/g, ""))} />
          </Field>
        </div>
      </section>

      {/* Itens */}
      <section aria-labelledby={`${uid}-items`} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 id={`${uid}-items`} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
            {t("order.items")}
          </h3>
          {!readOnly && (
            <Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => set("items", [...value.items, emptyItem()])}>
              {t("items.add")}
            </Button>
          )}
        </div>
        {errors.items && <p className="text-xs font-medium" style={{ color: "var(--neg)" }}>{errors.items}</p>}
        {value.items.length === 0 ? (
          <p className="rounded-xl px-4 py-6 text-center text-sm" style={{ border: "1px dashed var(--border-strong)", color: "var(--text-muted)" }}>
            {t("items.empty")}
          </p>
        ) : (
          <ol className="space-y-2">
            {value.items.map((it, i) => {
              const lt = Math.round(parseQty(it.quantity) * parseAmount(it.unitPrice) * 100) / 100;
              return (
                <li key={it.key} className="grid grid-cols-12 items-start gap-2 rounded-xl p-3"
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <div className="col-span-12 sm:col-span-5">
                    <Field label={i === 0 ? t("items.description") : undefined} error={errors[`items.${i}.description`]}>
                      <Input value={it.description} disabled={readOnly} maxLength={300}
                        aria-label={`${t("items.itemN", { n: i + 1 })} — ${t("items.description")}`}
                        onChange={(e) => setItem(i, { description: e.target.value })} />
                    </Field>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Field label={i === 0 ? t("items.quantity") : undefined} error={errors[`items.${i}.quantity`]}>
                      <Input inputMode="decimal" value={it.quantity} disabled={readOnly}
                        aria-label={`${t("items.itemN", { n: i + 1 })} — ${t("items.quantity")}`}
                        onChange={(e) => setItem(i, { quantity: e.target.value.replace(/[^\d,]/g, "") })} />
                    </Field>
                  </div>
                  <div className="col-span-3 sm:col-span-1">
                    <Field label={i === 0 ? t("items.unit") : undefined} error={errors[`items.${i}.unit`]}>
                      <select value={it.unit} disabled={readOnly} className={`${controlClass} px-2`} style={controlStyle}
                        aria-label={`${t("items.itemN", { n: i + 1 })} — ${t("items.unit")}`}
                        onChange={(e) => setItem(i, { unit: e.target.value })}>
                        {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="col-span-5 sm:col-span-2">
                    <Field label={i === 0 ? t("items.unitPrice") : undefined} error={errors[`items.${i}.unitPrice`]}>
                      <MoneyInput value={it.unitPrice} disabled={readOnly}
                        aria-label={`${t("items.itemN", { n: i + 1 })} — ${t("items.unitPrice")}`}
                        onValueChange={(v) => setItem(i, { unitPrice: v })} />
                    </Field>
                  </div>
                  <div className="col-span-12 flex items-center justify-between gap-2 sm:col-span-2 sm:flex-col sm:items-end">
                    {i === 0 && <span className="hidden text-xs font-semibold sm:block" style={{ color: "var(--text-muted)" }}>{t("items.total")}</span>}
                    <span className="mono text-sm font-semibold sm:pt-2.5" style={{ color: "var(--text)" }}>{money(lt)}</span>
                    {!readOnly && (
                      <button type="button" onClick={() => set("items", value.items.filter((_, j) => j !== i))}
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg hover:bg-[var(--neg-weak)]"
                        style={{ color: "var(--neg)" }} aria-label={t("items.remove", { n: i + 1 })}>
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Condições + totais */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <section aria-labelledby={`${uid}-cond`} className="space-y-3 lg:col-span-3">
          <h3 id={`${uid}-cond`} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
            {t("order.conditions")}
          </h3>
          <Field label={t("order.paymentTerms")} error={errors.paymentTerms}>
            <Input value={value.paymentTerms} disabled={readOnly} maxLength={500} placeholder={t("order.paymentTermsPlaceholder")}
              onChange={(e) => set("paymentTerms", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("order.proposedInstallments")} error={errors.proposedInstallments}>
              <Input inputMode="numeric" value={value.proposedInstallments} disabled={readOnly} maxLength={2}
                onChange={(e) => set("proposedInstallments", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label={t("order.proposedFirstDueDays")} error={errors.proposedFirstDueDays}>
              <Input inputMode="numeric" value={value.proposedFirstDueDays} disabled={readOnly} maxLength={3}
                onChange={(e) => set("proposedFirstDueDays", e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
          <Field label={t("order.notes")} error={errors.notes}>
            <textarea value={value.notes} disabled={readOnly} maxLength={2000} rows={3}
              className={controlClass} style={{ ...controlStyle, resize: "vertical" }}
              onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </section>

        <section aria-labelledby={`${uid}-tot`} className="space-y-2 rounded-xl p-4 lg:col-span-2"
          style={{ background: "var(--sunken)", border: "1px solid var(--border)" }}>
          <h3 id={`${uid}-tot`} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
            {t("totals.title")}
          </h3>
          <Row label={t("totals.subtotal")} value={money(totals.subtotal)} />
          {(["discount", "taxes", "freight", "otherCosts"] as const).map((k) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <label htmlFor={`${uid}-${k}`} className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                {k === "discount" ? "(−) " : "(+) "}{t(`totals.${k}`)}
              </label>
              <div className="w-36">
                <MoneyInput id={`${uid}-${k}`} value={value.adjustments[k]} disabled={readOnly}
                  aria-invalid={errors[`adjustments.${k}`] ? true : undefined}
                  onValueChange={(v) => set("adjustments", { ...value.adjustments, [k]: v })} />
              </div>
            </div>
          ))}
          {errors["adjustments.discount"] && (
            <p className="text-xs font-medium" style={{ color: "var(--neg)" }}>{errors["adjustments.discount"]}</p>
          )}
          <div className="flex items-center justify-between border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <span className="text-sm font-bold" style={{ color: "var(--text)" }}>{t("totals.total")}</span>
            <span className="mono text-lg font-bold" style={{ color: "var(--brand)" }}>{money(totals.total)}</span>
          </div>
          {errors.total && <p className="text-xs font-medium" style={{ color: "var(--neg)" }}>{errors.total}</p>}
          {!readOnly && <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{t("totals.serverNote")}</p>}
        </section>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="mono text-sm" style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}
