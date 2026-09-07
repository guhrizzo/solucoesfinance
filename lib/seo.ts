// lib/seo.ts
// Helpers de SEO multi-idioma: canonical + hreflang por rota.
// pt-BR (padrão) sem prefixo; en/es prefixados. Ver i18n/routing.ts.

import { routing } from "@/i18n/routing";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
).replace(/\/$/, "");

/** Caminho de uma rota num idioma: "/precos" → "/en/precos" (en). */
export function localePath(locale: string, path = ""): string {
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  return `${prefix}${path}` || "/";
}

/** Bloco `alternates` do Metadata (canonical + languages + x-default) para uma rota pública. */
export function alternatesFor(locale: string, path = "") {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = localePath(l, path);
  languages["x-default"] = localePath(routing.defaultLocale, path);
  return { canonical: localePath(locale, path), languages };
}
