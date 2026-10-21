"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Hourglass, CheckCircle2, Receipt, XCircle, Building2, ChevronRight } from "lucide-react";
import { Card, KpiTile, Button } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import type { PurchaseOrderDoc, SupplierDoc } from "@/lib/compras/types";
import { StatusPill, fmtDateTime } from "@/app/components/compras/shared";

interface Props {
  orders: PurchaseOrderDoc[];
  suppliers: SupplierDoc[];
  onOpen: (o: PurchaseOrderDoc) => void;
  onSeePending: () => void;
  onSeeApproved: () => void;
}

const monthKey = (ms: number | null | undefined) => (ms ? new Date(ms).toISOString().slice(0, 7) : "");

export function Overview({ orders, suppliers, onOpen, onSeePending, onSeeApproved }: Props) {
  const t = useTranslations("compras");
  const locale = useLocale();
  const money = (n: number) => formatMoney(n, locale);
  const [now] = useState(() => monthKey(Date.now()));

  const k = useMemo(() => {
    const pending = orders.filter((o) => o.status === "enviado" || o.status === "em_analise");
    const approvedMonth = orders.filter((o) => (o.status === "aprovado" || o.status === "concluido") && monthKey(o.approvedAt) === now);
    const toLaunch = orders.filter((o) => (o.status === "aprovado" || o.status === "concluido") && !o.billLink);
    const rejectedMonth = orders.filter((o) => o.status === "recusado" && monthKey(o.rejectedAt) === now);
    const sum = (l: PurchaseOrderDoc[]) => l.reduce((s, o) => s + (o.total || 0), 0);
    return {
      pending, toLaunch,
      pendingTotal: sum(pending), approvedTotal: sum(approvedMonth), approvedCount: approvedMonth.length,
      toLaunchTotal: sum(toLaunch), rejectedCount: rejectedMonth.length,
      activeSuppliers: suppliers.filter((s) => s.status === "ativo").length,
      portalSuppliers: suppliers.filter((s) => s.portal?.status === "active").length,
    };
  }, [orders, suppliers, now]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile icon={Hourglass} label={t("kpi.pending")} value={money(k.pendingTotal)} delta={t("kpi.orderCount", { count: k.pending.length })} onClick={onSeePending} />
        <KpiTile icon={CheckCircle2} label={t("kpi.approvedMonth")} value={money(k.approvedTotal)} valueTone="pos" delta={t("kpi.orderCount", { count: k.approvedCount })} onClick={onSeeApproved} />
        <KpiTile icon={Receipt} label={t("kpi.toLaunch")} value={money(k.toLaunchTotal)} delta={t("kpi.orderCount", { count: k.toLaunch.length })} deltaTone={k.toLaunch.length ? "neg" : "neutral"} />
        <KpiTile icon={Building2} label={t("kpi.suppliersActive")} value={String(k.activeSuppliers)} delta={t("kpi.suppliersPortal", { count: k.portalSuppliers })} />
      </div>
      {k.rejectedCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
          <XCircle size={13} style={{ color: "var(--neg)" }} /> {t("kpi.rejectedMonth")}: {k.rejectedCount}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <QuickList title={t("overview.pendingTitle")} empty={t("overview.noPending")} rows={k.pending.slice(0, 6)}
          onOpen={onOpen} onAll={onSeePending} allLabel={t("overview.viewAll")} money={money} locale={locale} />
        <QuickList title={t("overview.toLaunchTitle")} empty={t("overview.noToLaunch")} rows={k.toLaunch.slice(0, 6)}
          onOpen={onOpen} onAll={onSeeApproved} allLabel={t("overview.viewAll")} money={money} locale={locale} />
      </div>
    </div>
  );
}

function QuickList({ title, empty, rows, onOpen, onAll, allLabel, money, locale }: {
  title: string; empty: string; rows: PurchaseOrderDoc[]; onOpen: (o: PurchaseOrderDoc) => void;
  onAll: () => void; allLabel: string; money: (n: number) => string; locale: string;
}) {
  return (
    <Card padding="none">
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="font-display text-sm font-bold" style={{ color: "var(--text)" }}>{title}</h2>
        <Button type="button" size="sm" variant="ghost" onClick={onAll}>{allLabel}</Button>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>{empty}</p>
      ) : (
        <ul>
          {rows.map((o) => (
            <li key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <button type="button" onClick={() => onOpen(o)}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--sunken)]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="mono text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{o.numberLabel}</span>
                    <StatusPill status={o.status} />
                  </div>
                  <div className="truncate text-sm font-semibold" style={{ color: "var(--text)" }}>{o.supplierName}</div>
                  <div className="text-xs" style={{ color: "var(--text-subtle)" }}>{fmtDateTime(o.submittedAt ?? o.createdAt, locale)}</div>
                </div>
                <span className="mono text-sm font-semibold" style={{ color: "var(--text)" }}>{money(o.total)}</span>
                <ChevronRight size={16} style={{ color: "var(--text-subtle)" }} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
