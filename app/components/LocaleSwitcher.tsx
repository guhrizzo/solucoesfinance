"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { useLocalePreference } from "@/app/hooks/useLocalePreference";
import type { AppLocale } from "@/i18n/routing";

const SHORT: Record<AppLocale, string> = {
  "pt-BR": "PT",
  en: "EN",
  es: "ES",
};

// Seletor de idioma PT · EN · ES. Usado no header e no rodapé do site público
// (Fase 2). Combina com fundo escuro; passe `className` pra ajustar espaçamento.
export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const t = useTranslations("landing.localeSwitcher");
  const { locale, locales, setLocale } = useLocalePreference();
  const [isPending, startTransition] = useTransition();

  return (
    <div
      className={`inline-flex items-center gap-1 ${className}`}
      role="group"
      aria-label={t("label")}
    >
      <Globe size={14} className="mr-1 opacity-60" aria-hidden="true" />
      {locales.map((l, i) => (
        <span key={l} className="inline-flex items-center">
          {i > 0 && <span className="mx-1 opacity-30">·</span>}
          <button
            type="button"
            onClick={() => startTransition(() => setLocale(l))}
            disabled={isPending}
            aria-current={l === locale ? "true" : undefined}
            lang={l}
            title={t(l)}
            className={`text-xs font-semibold uppercase tracking-wide transition-opacity cursor-pointer disabled:cursor-wait ${
              l === locale ? "opacity-100 underline underline-offset-4" : "opacity-55 hover:opacity-90"
            }`}
          >
            {SHORT[l]}
          </button>
        </span>
      ))}
    </div>
  );
}
