"use client";

import { useLocale, useTranslations } from "next-intl";
import { Mail, MessageCircle, Send } from "lucide-react";
import { Card, EmptyState, Pill, Table, type PillTone } from "@/app/components/ui";
import type { NotificationStatus } from "@/lib/compras/types";
import { fmtDateTime } from "@/app/components/compras/shared";
import type { LogRow } from "./useComprasData";

const TONE: Record<NotificationStatus, PillTone> = {
  sent: "pos", failed: "neg", not_configured: "warn", invalid_recipient: "neg", fallback_link: "warn",
};

export function LogTab({ logs }: { logs: LogRow[] }) {
  const t = useTranslations("compras");
  const locale = useLocale();
  const kindLabel = (k: string) => (k.startsWith("status_") ? `${t("log.kinds.status")} · ${t.has(`status.${k.slice(7)}`) ? t(`status.${k.slice(7)}`) : k.slice(7)}` : t.has(`log.kinds.${k}`) ? t(`log.kinds.${k}`) : k);
  return (
    <div className="space-y-3">
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>{t("log.desc")}</p>
      <Card padding="sm">
        <Table
          columns={[
            { key: "at", header: t("log.at"), width: "150px" },
            { key: "channel", header: t("log.channel"), width: "120px" },
            { key: "kind", header: t("log.kind") },
            { key: "to", header: t("log.to") },
            { key: "status", header: t("log.status"), width: "150px" },
            { key: "error", header: t("log.error") },
          ]}
          rows={logs}
          rowKey={(l) => l.id}
          renderCell={(l, key) => {
            switch (key) {
              case "at": return fmtDateTime(l.at, locale);
              case "channel": return (
                <span className="inline-flex items-center gap-1.5">
                  {l.channel === "email" ? <Mail size={13} /> : <MessageCircle size={13} />}
                  {t(`log.channels.${l.channel}`)}
                </span>
              );
              case "kind": return kindLabel(l.kind);
              case "to": return <span className="mono text-xs">{l.to}</span>;
              case "status": return <Pill tone={TONE[l.status] ?? "muted"} dot>{t(`invite.result.${l.status}`)}</Pill>;
              case "error": return <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{l.error ?? ""}</span>;
              default: return null;
            }
          }}
          empty={<EmptyState icon={Send} title={t("empty.log")} />}
        />
      </Card>
    </div>
  );
}
