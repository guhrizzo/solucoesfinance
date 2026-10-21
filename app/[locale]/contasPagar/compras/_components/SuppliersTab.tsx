"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Building2, Search } from "lucide-react";
import { Card, EmptyState, Input, Pill, Table, type PillTone } from "@/app/components/ui";
import { maskPhone } from "@/lib/compras/validate";
import type { PortalStatus, SupplierDoc } from "@/lib/compras/types";
import { fmtCnpj } from "@/app/components/compras/shared";

export const PORTAL_TONE: Record<PortalStatus, PillTone> = { none: "muted", invited: "info", active: "pos", revoked: "neg" };

interface Props {
  suppliers: SupplierDoc[];
  orderCount: Map<string, number>;
  onOpen: (s: SupplierDoc) => void;
}

export function SuppliersTab({ suppliers, orderCount, onOpen }: Props) {
  const t = useTranslations("compras");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, "");
    if (!s) return suppliers;
    return suppliers.filter((x) =>
      `${x.razaoSocial} ${x.nomeFantasia} ${x.categoria} ${x.email}`.toLowerCase().includes(s) || (digits.length >= 3 && x.cnpj.includes(digits)));
  }, [suppliers, q]);

  return (
    <div className="space-y-3">
      <Card padding="sm">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-subtle)" }} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("supplier.searchPlaceholder")} aria-label={t("supplier.searchPlaceholder")} className="pl-9" />
        </div>
      </Card>
      <Card padding="sm">
        <Table
          columns={[
            { key: "name", header: t("table.supplier") },
            { key: "category", header: t("table.category") },
            { key: "contact", header: t("table.contact") },
            { key: "portal", header: t("table.portal"), width: "150px" },
            { key: "orders", header: t("table.orders"), align: "right", width: "90px" },
          ]}
          rows={rows}
          rowKey={(s) => s.id}
          onRowClick={onOpen}
          renderCell={(s, key) => {
            switch (key) {
              case "name": return (
                <div className="min-w-[180px]">
                  <div className="flex items-center gap-2 font-semibold">
                    {s.nomeFantasia || s.razaoSocial}
                    {s.status === "inativo" && <Pill tone="muted">{t("supplierStatus.inativo")}</Pill>}
                  </div>
                  <div className="mono text-xs" style={{ color: "var(--text-subtle)" }}>{fmtCnpj(s.cnpj)}</div>
                </div>
              );
              case "category": return s.categoria;
              case "contact": return (
                <div className="min-w-[160px] text-xs">
                  <div>{s.responsavel}</div>
                  <div style={{ color: "var(--text-subtle)" }}>{s.email} · {maskPhone(s.telefone)}</div>
                </div>
              );
              case "portal": return <Pill tone={PORTAL_TONE[s.portal?.status ?? "none"]} dot>{t(`portalStatus.${s.portal?.status ?? "none"}`)}</Pill>;
              case "orders": return <span className="mono">{orderCount.get(s.id) ?? 0}</span>;
              default: return null;
            }
          }}
          empty={<EmptyState icon={Building2} title={t("empty.suppliers")} description={t("empty.suppliersHint")} />}
        />
      </Card>
    </div>
  );
}
