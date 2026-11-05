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
export default function SecurePaymentSeal() {
  const t = useTranslations("assinatura.contrato");

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
