"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ClipboardList, Search, SlidersHorizontal, X } from "lucide-react";
import { Card, EmptyState, Input, Table, Button, MoneyInput, parseAmount } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { onlyDigits } from "@/lib/compras/validate";
import type { OrderStatus, PurchaseOrderDoc, SupplierDoc } from "@/lib/compras/types";
import { StatusPill, fmtCnpj, fmtDate, controlClass, controlStyle } from "@/app/components/compras/shared";

export type StatusFilter = "todos" | "pendentes" | OrderStatus;

export interface OrderFilters {
  status: StatusFilter;
  supplierId: string;
  cnpj: string;
  from: string;
  to: string;
  min: string;
  max: string;
  q: string;
}

export const EMPTY_FILTERS: OrderFilters = { status: "todos", supplierId: "", cnpj: "", from: "", to: "", min: "", max: "", q: "" };

const STATUS_CHIPS: StatusFilter[] = ["todos", "pendentes", "aprovado", "recusado", "cancelado", "concluido"];

export function applyFilters(orders: PurchaseOrderDoc[], f: OrderFilters): PurchaseOrderDoc[] {
  const q = f.q.trim().toLowerCase();
  const cnpj = onlyDigits(f.cnpj);
  const min = f.min ? parseAmount(f.min) : null;
  const max = f.max ? parseAmount(f.max) : null;
  return orders.filter((o) => {
    if (f.status === "pendentes" && o.status !== "enviado" && o.status !== "em_analise") return false;
    if (f.status !== "todos" && f.status !== "pendentes" && o.status !== f.status) return false;
    if (f.supplierId && o.supplierId !== f.supplierId) return false;
    if (cnpj && !o.supplierCnpj.includes(cnpj)) return false;
    if (f.from && o.issueDate < f.from) return false;
    if (f.to && o.issueDate > f.to) return false;
    if (min !== null && o.total < min) return false;
    if (max !== null && o.total > max) return false;
    if (q) {
      const hay = `${o.numberLabel} ${o.number} ${o.supplierName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

interface Props {
  orders: PurchaseOrderDoc[];
  suppliers: SupplierDoc[];
  filters: OrderFilters;
  onFilters: (f: OrderFilters) => void;
  onOpen: (o: PurchaseOrderDoc) => void;
}

export function OrdersList({ orders, suppliers, filters, onFilters, onOpen }: Props) {
  const t = useTranslations("compras");
  const locale = useLocale();
  const [more, setMore] = useState(false);
  const rows = useMemo(() => applyFilters(orders, filters), [orders, filters]);
  const set = (patch: Partial<OrderFilters>) => onFilters({ ...filters, ...patch });
  const dirty = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS);

  return (
    <div className="space-y-3">
      <Card padding="sm" className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-subtle)" }} />
            <Input value={filters.q} onChange={(e) => set({ q: e.target.value })} placeholder={t("filters.search")}
              aria-label={t("filters.searchAria")} className="pl-9" />
          </div>
          <select value={filters.supplierId} onChange={(e) => set({ supplierId: e.target.value })}
            aria-label={t("filters.supplierAria")} className={`${controlClass} sm:w-60`} style={controlStyle}>
            <option value="">{t("filters.supplierAll")}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nomeFantasia || s.razaoSocial}</option>)}
          </select>
          <Button type="button" variant="secondary" icon={SlidersHorizontal} onClick={() => setMore((m) => !m)} aria-expanded={more}>
            {t("filters.more")}
          </Button>
        </div>

        {more && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Input value={filters.cnpj} onChange={(e) => set({ cnpj: e.target.value })} placeholder={t("filters.cnpj")} aria-label={t("filters.cnpj")} inputMode="numeric" />
            <Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} aria-label={t("filters.from")} title={t("filters.from")} />
            <Input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} aria-label={t("filters.to")} title={t("filters.to")} />
            <MoneyInput value={filters.min} onValueChange={(v) => set({ min: v })} placeholder={t("filters.minValue")} aria-label={t("filters.minValue")} />
            <MoneyInput value={filters.max} onValueChange={(v) => set({ max: v })} placeholder={t("filters.maxValue")} aria-label={t("filters.maxValue")} />
          </div>
        )}

        <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
          {STATUS_CHIPS.map((s) => {
            const active = filters.status === s;
            return (
              <button key={s} type="button" onClick={() => set({ status: s })} aria-pressed={active}
                className="shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
                style={active
                  ? { background: "var(--brand-weak)", color: "var(--brand)", borderColor: "var(--brand)" }
                  : { background: "transparent", color: "var(--text-muted)", borderColor: "var(--border)" }}>
                {s === "todos" ? t("filters.statusAll") : s === "pendentes" ? t("filters.statusPending") : t(`status.${s}`)}
              </button>
            );
          })}
          <span className="ml-auto shrink-0 text-xs" style={{ color: "var(--text-subtle)" }}>
            {t("filters.resultCount", { count: rows.length })}
          </span>
          {dirty && (
            <Button type="button" size="sm" variant="ghost" icon={X} onClick={() => onFilters(EMPTY_FILTERS)}>
              {t("filters.clear")}
            </Button>
          )}
        </div>
      </Card>

      <Card padding="sm">
        <Table
          columns={[
            { key: "number", header: t("table.number"), width: "110px" },
            { key: "supplier", header: t("table.supplier") },
            { key: "issueDate", header: t("table.issueDate"), width: "110px" },
            { key: "total", header: t("table.total"), align: "right", width: "140px" },
            { key: "status", header: t("table.status"), width: "130px" },
            { key: "bill", header: t("table.bill"), width: "120px" },
          ]}
          rows={rows}
          rowKey={(o) => o.id}
          onRowClick={onOpen}
          renderCell={(o, key) => {
            switch (key) {
              case "number": return <span className="mono font-semibold">{o.numberLabel}</span>;
              case "supplier": return (
                <div className="min-w-[160px]">
                  <div className="font-semibold">{o.supplierName}</div>
                  <div className="mono text-xs" style={{ color: "var(--text-subtle)" }}>{fmtCnpj(o.supplierCnpj)}</div>
                </div>
              );
              case "issueDate": return fmtDate(o.issueDate, locale);
              case "total": return <span className="mono">{formatMoney(o.total, locale)}</span>;
              case "status": return <StatusPill status={o.status} />;
              case "bill": return o.billLink
                ? <span className="text-xs font-semibold" style={{ color: "var(--pos)" }}>{t("table.launched")}</span>
                : <span style={{ color: "var(--text-subtle)" }}>—</span>;
              default: return null;
            }
          }}
          empty={<EmptyState icon={ClipboardList} title={t("empty.orders")} description={t("empty.ordersHint")} />}
        />
      </Card>
    </div>
  );
}
