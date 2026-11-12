"use client";

import Image from "next/image";
import { AlertTriangle, Check, LayoutGrid, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import styles from "./InventoryFilters.module.css";

type Platform = "mercadolivre" | "shopee" | "tiktokshop" | "shein";
export type StockFilter = "todos" | Platform | "local" | "baixo";

const CHANNELS: { id: Platform; image: string; width: number; label: string }[] = [
  { id: "mercadolivre", image: "/Logotipo_MercadoLivre.png", width: 62, label: "Mercado Livre" },
  { id: "shopee", image: "/Shopee.svg", width: 28, label: "Shopee" },
  { id: "tiktokshop", image: "/TikTokShop.svg", width: 28, label: "TikTok Shop" },
  { id: "shein", image: "/Shein.svg", width: 62, label: "SHEIN" },
];

interface Props {
  value: StockFilter;
  onChange: (value: StockFilter) => void;
  visiblePlatforms: Platform[];
}

export default function InventoryFilters({ value, onChange, visiblePlatforms }: Props) {
  const t = useTranslations("estoque");
  const options = [
    { id: "todos" as const, label: t("tabs.todos"), icon: LayoutGrid },
    ...CHANNELS.filter((channel) => visiblePlatforms.includes(channel.id)),
    { id: "local" as const, label: t("tabs.local"), icon: Store },
    { id: "baixo" as const, label: t("tabs.lowStock"), icon: AlertTriangle },
  ];

  return (
    <div className={styles.filters} role="group" aria-label={t("tabs.filtersLabel")}>
      {options.map((option) => {
        const selected = value === option.id;
        const Icon = "icon" in option ? option.icon : null;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            className={styles.filter}
            data-selected={selected}
            data-kind={option.id === "baixo" ? "warning" : undefined}
            onClick={() => onChange(option.id)}
          >
            {"image" in option && (
              <span className={styles.logo} data-channel={option.id}>
                <Image src={option.image} alt="" width={option.width} height={28} className={styles.logoImage} />
              </span>
            )}
            {Icon && <Icon size={16} aria-hidden="true" className={styles.icon} />}
            <span className={styles.label}>{option.label}</span>
            <span className={styles.selection} aria-hidden="true">
              {selected && <Check size={12} strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
