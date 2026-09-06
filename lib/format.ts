// lib/format.ts
//
// Formatação de moeda, número e data ciente do idioma. Ponto único — antes
// cada página gigante redefinia o próprio `toBRL`/`BRL`/`fmt` e espalhava
// `toLocaleDateString("pt-BR")`.
//
// Regra do projeto (ver docs/superpowers/specs/2026-09-06-i18n-multi-idioma-
// design.md): DATA e NÚMERO seguem o locale ativo; MOEDA fica sempre em BRL
// (símbolo R$) — o locale só muda agrupamento/separador, nunca o valor. Não
// há conversão de câmbio.
//
// Em componentes React, prefira o `useFormatter()` do next-intl (já conhece o
// locale). Estas funções são pra onde não há contexto React: PDFs, e-mails,
// helpers puros — aí o locale entra como argumento (default "pt-BR").

type Locale = "pt-BR" | "en" | "es";

const DEFAULT_LOCALE: Locale = "pt-BR";

// Intl.* é caro de instanciar — cacheia por (locale + tipo).
const moneyCache = new Map<string, Intl.NumberFormat>();
const numberCache = new Map<string, Intl.NumberFormat>();
const dateCache = new Map<string, Intl.DateTimeFormat>();

function money(locale: string): Intl.NumberFormat {
  let f = moneyCache.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" });
    moneyCache.set(locale, f);
  }
  return f;
}

function number(locale: string, key: string, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cacheKey = `${locale}:${key}`;
  let f = numberCache.get(cacheKey);
  if (!f) {
    f = new Intl.NumberFormat(locale, opts);
    numberCache.set(cacheKey, f);
  }
  return f;
}

function date(locale: string, key: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const cacheKey = `${locale}:${key}`;
  let f = dateCache.get(cacheKey);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    dateCache.set(cacheKey, f);
  }
  return f;
}

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/** R$ 1.234,50 (pt-BR) · R$ 1,234.50 (en) — sempre BRL. */
export function formatMoney(value: number, locale: string = DEFAULT_LOCALE): string {
  return money(locale).format(value);
}

/** Igual a formatMoney, mas recebe centavos (inteiro). */
export function formatMoneyFromCents(cents: number, locale: string = DEFAULT_LOCALE): string {
  return money(locale).format(cents / 100);
}

/** 1.234,56 (pt-BR) · 1,234.56 (en). Sem símbolo de moeda. */
export function formatNumber(
  value: number,
  locale: string = DEFAULT_LOCALE,
  opts: Intl.NumberFormatOptions = { maximumFractionDigits: 2 },
): string {
  return number(locale, JSON.stringify(opts), opts).format(value);
}

/** 06/09/2026 (pt-BR) · 09/06/2026 (en). */
export function formatDate(value: Date | string | number, locale: string = DEFAULT_LOCALE): string {
  return date(locale, "short", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    toDate(value),
  );
}

/** 6 de setembro de 2026 (pt-BR) · September 6, 2026 (en). */
export function formatDateLong(
  value: Date | string | number,
  locale: string = DEFAULT_LOCALE,
): string {
  return date(locale, "long", { day: "numeric", month: "long", year: "numeric" }).format(
    toDate(value),
  );
}

/** 06/09/2026 14:30 (pt-BR). */
export function formatDateTime(
  value: Date | string | number,
  locale: string = DEFAULT_LOCALE,
): string {
  return date(locale, "datetime", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(toDate(value));
}
