"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";

/** Cabeçalho do PDV: marca + subtítulo, operador e relógio (atualiza a cada segundo). */
export function PdvHeader({ operador, acoes }: { operador?: string; acoes?: React.ReactNode }) {
  const t = useTranslations("vendas.pdv");
  const locale = useLocale();
  const [agora, setAgora] = useState<Date | null>(null);

  useEffect(() => {
    // Primeiro tique fora do render (evita divergência de hidratação no relógio).
    const tick = () => setAgora(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, []);

  const relogio = agora
    ? new Intl.DateTimeFormat(locale, {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).format(agora).replace(",", "")
    : "";

  return (
    <header className="mb-4 space-y-3 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
      <Link
        href="/vendas"
        className="inline-flex items-center gap-1.5 text-xs font-semibold no-underline"
        style={{ color: "var(--text-muted)" }}
      >
        <ArrowLeft size={13} /> {t("back")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--text)" }}>{t("title")}</h1>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>{t("subtitle")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {operador && (
            <span
              className="rounded-lg px-3 py-2 text-sm font-semibold"
              style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text)" }}
              title={t("status.operator")}
            >
              {operador}
            </span>
          )}
          <span
            className="mono rounded-lg px-3 py-2 text-sm"
            style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
            aria-live="off"
          >
            {relogio}
          </span>
          {acoes}
        </div>
      </div>
    </header>
  );
}
