"use client";

import { useTranslations } from "next-intl";
import { ShieldCheck, Lock, CreditCard, RefreshCcw } from "lucide-react";

/**
 * Selo de pagamento seguro (checkout da mensalidade).
 *
 * Só afirma o que é verdade no código: o pagamento acontece na fatura
 * hospedada do Asaas (nenhum dado de cartão passa por nós — ver lib/asaas.ts)
 * e o site é servido por HTTPS. Não exibe certificações que não possuímos.
 */
export default function SecurePaymentSeal({ variant = "default" }: { variant?: "default" | "footer" }) {
  const t = useTranslations("assinatura.contrato");

  if (variant === "footer") {
    return (
      <div
        role="note"
        aria-label={t("sealTitle")}
        className="inline-flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl px-4 py-3"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <span className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(34,197,94,0.18)", color: "#4ade80" }}
          >
            <ShieldCheck size={20} />
          </span>
          <span className="block">
            <span className="block text-sm font-bold leading-tight text-white">{t("sealTitle")}</span>
            <span className="block text-[11px] text-blue-300/75">{t("sealSubtitle")}</span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-blue-200/80">
          <span className="inline-flex items-center gap-1.5">
            <Lock size={12} style={{ color: "#4ade80" }} /> {t("sealEncrypted")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CreditCard size={12} style={{ color: "#4ade80" }} /> {t("sealNoCard")}
          </span>
        </span>
      </div>
    );
  }

  const items = [
    { Icon: Lock, label: t("sealEncrypted") },
    { Icon: CreditCard, label: t("sealNoCard") },
    { Icon: RefreshCcw, label: t("sealCancel") },
  ];

  return (
    <div
      role="note"
      aria-label={t("sealTitle")}
      className="rounded-xl p-3.5"
      style={{
        background: "var(--db-sub)",
        border: "1px solid var(--db-border)",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: "rgba(34,197,94,0.14)", color: "#16a34a" }}
        >
          <ShieldCheck size={22} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight" style={{ color: "var(--db-text)" }}>
            {t("sealTitle")}
          </p>
          <p className="text-[11px] mt-0.5" style={{ color: "var(--db-text-3)" }}>
            {t("sealSubtitle")}
          </p>
        </div>
      </div>
      <ul className="mt-3 space-y-1.5">
        {items.map(({ Icon, label }) => (
          <li
            key={label}
            className="flex items-center gap-2 text-[11px]"
            style={{ color: "var(--db-text-2)" }}
          >
            <Icon size={12} style={{ color: "#16a34a" }} className="shrink-0" />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
