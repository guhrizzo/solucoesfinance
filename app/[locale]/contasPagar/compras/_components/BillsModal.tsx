"use client";

// "Gerar lançamento no Contas a Pagar" — etapa separada da aprovação. A prévia
// das parcelas usa a mesma divisão do servidor (lib/compras/calc); o servidor
// recalcula o total a partir dos itens e grava com IDs determinísticos.

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Receipt } from "lucide-react";
import { Button, Field, Input, Modal } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { splitInstallments, addDaysIso } from "@/lib/compras/calc";
import { addMonthsClamped } from "@/lib/dateSeries";
import { CASHFLOW_CATEGORIES, categoryLabel } from "@/lib/cashflowCategories";
import { PAYMENT_METHODS, PAYMENT_METHOD_META } from "@/app/types/payment";
import { MAX_INSTALLMENTS, type PurchaseOrderDoc } from "@/lib/compras/types";
import { internalApi } from "@/app/components/compras/api";
import { errorText, fmtDate, controlClass, controlStyle } from "@/app/components/compras/shared";
import type { CostCenterLite } from "./useComprasData";

interface Props {
  order: PurchaseOrderDoc | null;
  costCenters: CostCenterLite[];
  onClose: () => void;
  toast: (msg: string, type?: "success" | "error" | "warning" | "info") => void;
}

export function BillsModal({ order, costCenters, onClose, toast }: Props) {
  const t = useTranslations("compras");
  const tErr = useTranslations("compras.errors");
  const tCats = useTranslations("categories");
  const locale = useLocale();
  const [installments, setInstallments] = useState("1");
  const [firstDue, setFirstDue] = useState("");
  const [category, setCategory] = useState("Fornecedores");
  const [costCenterId, setCostCenterId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!order) return;
    setInstallments(String(order.proposedInstallments || 1));
    setFirstDue(addDaysIso(order.issueDate, order.proposedFirstDueDays ?? 30));
    setCategory(order.category && CASHFLOW_CATEGORIES.saida.includes(order.category) ? order.category : "Fornecedores");
    setCostCenterId(order.costCenterId ?? "");
    setPaymentMethod("");
  }, [order]);

  const n = Math.min(MAX_INSTALLMENTS, Math.max(1, Number(installments) || 1));
  const preview = useMemo(() => {
    if (!order || !/^\d{4}-\d{2}-\d{2}$/.test(firstDue)) return [];
    return splitInstallments(order.total, n).map((amount, i) => ({ amount, due: addMonthsClamped(firstDue, i) }));
  }, [order, firstDue, n]);

  if (!order) return null;

  async function generate() {
    if (!order) return;
    setSaving(true);
    try {
      const r = await internalApi<{ already: boolean }>(`/orders/${order.id}/bills`, {
        method: "POST",
        json: { installments: n, firstDueDate: firstDue, category, costCenterId: costCenterId || null, paymentMethod: paymentMethod || null },
      });
      toast(r.already ? t("bills.already") : t("bills.done"), r.already ? "info" : "success");
      onClose();
    } catch (err) {
      toast(errorText(tErr, err), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={t("bills.title", { number: order.numberLabel })} size="md" closeDisabled={saving} mobileSheet>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("bills.desc", { count: n })}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("bills.installments")}>
            <Input inputMode="numeric" value={installments} maxLength={2} onChange={(e) => setInstallments(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label={t("bills.firstDueDate")}>
            <Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
          </Field>
          <Field label={t("bills.category")} className="col-span-2">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={controlClass} style={controlStyle}>
              {CASHFLOW_CATEGORIES.saida.map((c) => <option key={c} value={c}>{categoryLabel(c, tCats)}</option>)}
            </select>
          </Field>
          <Field label={t("bills.costCenter")}>
            <select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)} className={controlClass} style={controlStyle}>
              <option value="">{t("bills.noCostCenter")}</option>
              {costCenters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label={t("bills.paymentMethod")}>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={controlClass} style={controlStyle}>
              <option value="">{t("bills.noPaymentMethod")}</option>
              {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_META[m].label}</option>)}
            </select>
          </Field>
        </div>

        <div className="rounded-xl p-3" style={{ background: "var(--sunken)", border: "1px solid var(--border)" }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{t("bills.preview")}</p>
          <ul className="space-y-1">
            {preview.map((p, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--text-muted)" }}>{t("bills.installmentN", { n: i + 1 })} · {fmtDate(p.due, locale)}</span>
                <span className="mono font-semibold" style={{ color: "var(--text)" }}>{formatMoney(p.amount, locale)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
        <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>{t("confirm.back")}</Button>
        <Button type="button" icon={Receipt} loading={saving} disabled={preview.length === 0} onClick={generate}>{t("bills.generate")}</Button>
      </div>
    </Modal>
  );
}
