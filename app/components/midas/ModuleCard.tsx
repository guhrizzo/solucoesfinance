"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Wallet, ReceiptText, Banknote, ChartBar, Package, ShoppingCart, Plug, Percent, Landmark,
  LayoutDashboard, MailCheck, ScanText, Users, Store, BellRing, Sparkles, ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { MIDAS_MODULES } from "@/lib/midas/modules";
import { TourIllustration } from "@/app/components/tour/TourIllustration";
import "@/app/components/tour/tour.css";

// Nomes de ícone do catálogo (lib/midas/modules.ts) → componentes Lucide.
const ICONS: Record<string, LucideIcon> = {
  wallet: Wallet,
  "receipt-text": ReceiptText,
  banknote: Banknote,
  "chart-bar": ChartBar,
  package: Package,
  "shopping-cart": ShoppingCart,
  plug: Plug,
  percent: Percent,
  landmark: Landmark,
  "layout-dashboard": LayoutDashboard,
  "mail-check": MailCheck,
  "scan-text": ScanText,
  users: Users,
  store: Store,
  "bell-ring": BellRing,
};

export function ModuleCard({ id }: { id: string }) {
  const t = useTranslations("midas");
  const [open, setOpen] = useState(false);
  const previewId = useId();
  const mod = MIDAS_MODULES.find((m) => m.id === id);
  if (!mod) return null;
  const Icon = ICONS[mod.icon] ?? Sparkles;

  return (
    <article className="midas-module">
      <div className="midas-module__head">
        <span className="midas-module__icon" aria-hidden="true">
          <Icon size={18} />
        </span>
        <div className="midas-module__titles">
          <h3 className="midas-module__name">{t(`modules.${id}.name`)}</h3>
          {mod.pro && <span className="midas-module__pro">{t("common.proBadge")}</span>}
        </div>
      </div>
      <p className="midas-module__desc">{t(`modules.${id}.description`)}</p>
      <p className="midas-module__benefit">{t(`modules.${id}.benefit`)}</p>

      <button
        type="button"
        className="midas-module__toggle"
        aria-expanded={open}
        aria-controls={previewId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? t("common.hidePreview") : t("common.preview")}
        <ChevronDown size={14} aria-hidden="true" className={open ? "midas-rot" : undefined} />
      </button>
      <div id={previewId} hidden={!open} className="midas-module__preview">
        {open && <TourIllustration stepId={mod.tourStepId ?? undefined} animation={mod.animation} />}
      </div>
    </article>
  );
}
