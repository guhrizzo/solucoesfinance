"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { whatsappHref } from "./useMidasSession";

export function WhatsAppButton({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("midas.common");
  return (
    <a
      className={compact ? "midas-wa midas-wa--compact" : "midas-wa"}
      href={whatsappHref(t("whatsappPrefill"))}
      target="_blank"
      rel="noopener noreferrer"
    >
      <MessageCircle size={15} aria-hidden="true" />
      {t("humanWhatsapp")}
    </a>
  );
}

export function CtaCard({ sessionId }: { sessionId: string }) {
  const t = useTranslations("midas");
  return (
    <div className="midas-cta">
      {/* trial=cartao: o teste de 7 dias só começa depois que o Asaas valida o cartão. */}
      <Link
        className="midas-cta__btn"
        href={{ pathname: "/register", query: { lead: sessionId, trial: "cartao" } }}
      >
        {t("cta.button")}
        <ArrowRight size={17} aria-hidden="true" />
      </Link>
      <p className="midas-cta__sub">{t("cta.subtext")}</p>
      <WhatsAppButton />
    </div>
  );
}
