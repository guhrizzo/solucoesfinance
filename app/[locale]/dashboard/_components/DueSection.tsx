"use client";

import { AlertCircle, CalendarClock, Clock, HandCoins } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { DueBucket, DueSummary, OpenItem } from "@/lib/dashboardInsights";
import { EmptyLine, Money, SectionCard, SectionStatus, type SourceState } from "./shared";

interface Props {
  due: DueSummary;
  hide: boolean;
  payablesState: SourceState | null;
  receivablesState: SourceState | null;
}

const HREF: Record<OpenItem["kind"], string> = {
  bill: "/contasPagar", tax: "/impostos", expense: "/costCenter", receivable: "/contasReceber",
};

function BucketCell({ label, bucket, tone, hide, icon: Icon }: { label: string; bucket: DueBucket; tone: "neg" | "warn" | "muted"; hide: boolean; icon: typeof Clock }) {
  const t = useTranslations("dashboard.dueSection");
  const color = bucket.count === 0 ? "var(--text-subtle)" : tone === "neg" ? "var(--neg)" : tone === "warn" ? "var(--warn)" : "var(--text)";
  return (
    <div className="rounded-xl p-2.5 min-w-0" style={{ background: "var(--sunken)" }}>
      <p className="flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        <Icon size={11} aria-hidden="true" /> {label}
      </p>
      <p className="mono text-sm font-semibold truncate" style={{ color }}><Money value={bucket.total} hide={hide} /></p>
      <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{t("count", { count: bucket.count })}</p>
    </div>
  );
}

function ItemList({ items, overdueTone, hide }: { items: Array<OpenItem & { diffDays: number }>; overdueTone: string; hide: boolean }) {
  const t = useTranslations("dashboard.dueSection");
  const locale = useLocale();
  const fallback = t("noTitle");
  return (
    <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
      {items.map((i) => {
        const overdue = i.diffDays < 0;
        const when = overdue ? t("overdueDays", { days: Math.abs(i.diffDays) })
          : i.diffDays === 0 ? t("today")
          : t("inDays", { days: i.diffDays, date: new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit" }).format(new Date(i.dueDate + "T12:00:00")) });
        return (
          <li key={i.key} style={{ borderColor: "var(--border)" }}>
            <Link href={HREF[i.kind]} className="flex items-center justify-between gap-3 py-2 transition-colors hover:bg-[var(--sunken)] rounded-lg px-1.5 -mx-1.5">
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: "var(--text)" }}>{i.label || fallback}</p>
                <p className="text-[11px] flex items-center gap-1" style={{ color: overdue ? overdueTone : "var(--text-muted)" }}>
                  {overdue && <AlertCircle size={11} aria-hidden="true" />}{when}
                  <span style={{ color: "var(--text-subtle)" }}> · {t(`kind.${i.kind}`)}</span>
                </p>
              </div>
              <span className="mono text-xs font-bold shrink-0" style={{ color: overdue ? overdueTone : "var(--text)" }}><Money value={i.open} hide={hide} /></span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function DueSection({ due, hide, payablesState, receivablesState }: Props) {
  const t = useTranslations("dashboard.dueSection");
  if (payablesState === null && receivablesState === null) return null;
  const days = due.dias;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 md:gap-5">
      {payablesState !== null && (
        <SectionCard
          id="vencimentos-pagar"
          title={t("payTitle")}
          subtitle={t("paySubtitle", { days })}
          action={<Link href="/contasPagar" className="text-xs font-semibold" style={{ color: "var(--brand)" }}>{t("seeAll")}</Link>}
        >
          {payablesState !== "ok" ? <SectionStatus state={payablesState} what={t("payWhat")} /> : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <BucketCell label={t("overdue")} bucket={due.pagar.vencidas} tone="neg" hide={hide} icon={AlertCircle} />
                <BucketCell label={t("dueToday")} bucket={due.pagar.hoje} tone="warn" hide={hide} icon={CalendarClock} />
                <BucketCell label={t("nextDays", { days })} bucket={due.pagar.proximos} tone="muted" hide={hide} icon={Clock} />
              </div>
              {due.pagarItens.length === 0 ? <EmptyLine>{t("payEmpty")}</EmptyLine> : <ItemList items={due.pagarItens} overdueTone="var(--neg)" hide={hide} />}
            </div>
          )}
        </SectionCard>
      )}

      {receivablesState !== null && (
        <SectionCard
          id="vencimentos-receber"
          title={t("recTitle")}
          subtitle={t("recSubtitle", { days })}
          action={<Link href="/contasReceber" className="text-xs font-semibold" style={{ color: "var(--brand)" }}>{t("seeAll")}</Link>}
          className={payablesState === null ? "xl:col-span-2" : ""}
        >
          {receivablesState !== "ok" ? <SectionStatus state={receivablesState} what={t("recWhat")} /> : (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <BucketCell label={t("lateReceivables")} bucket={due.receber.vencidas} tone="warn" hide={hide} icon={HandCoins} />
                <BucketCell label={t("dueToday")} bucket={due.receber.hoje} tone="muted" hide={hide} icon={CalendarClock} />
                <BucketCell label={t("nextDays", { days })} bucket={due.receber.proximos} tone="muted" hide={hide} icon={Clock} />
              </div>
              {due.receberItens.length === 0 ? <EmptyLine>{t("recEmpty")}</EmptyLine> : <ItemList items={due.receberItens} overdueTone="var(--warn)" hide={hide} />}
            </div>
          )}
        </SectionCard>
      )}
    </div>
  );
}
