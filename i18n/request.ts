import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";
import ptBR from "../messages/pt-BR";
import en from "../messages/en";
import es from "../messages/es";

// Mensagens por idioma, importadas estaticamente (ver messages/<locale>/
// index.ts). Import dinâmico com template string corria com a compilação do
// Turbopack em dev e dava "Unexpected end of JSON input" no primeiro request
// de cada rota.
const MESSAGES = { "pt-BR": ptBR, en, es } as const;

type Messages = Record<string, unknown>;

function isPlainObject(v: unknown): v is Messages {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Merge recursivo: valores de `override` vencem, mas qualquer chave que só
// exista em `base` (pt-BR) é mantida. É o que dá o fallback pra pt-BR quando
// uma chave ainda não foi traduzida (ou o namespace en/es está vazio).
function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const prev = out[key];
    out[key] =
      isPlainObject(prev) && isPlainObject(value) ? deepMerge(prev, value) : value;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // pt-BR é sempre a base; o idioma pedido sobrepõe. Chave sem tradução cai
  // pra pt-BR automaticamente.
  const base = MESSAGES[routing.defaultLocale] as Messages;
  const messages =
    locale === routing.defaultLocale
      ? base
      : deepMerge(base, MESSAGES[locale as keyof typeof MESSAGES] as Messages);

  return {
    locale,
    messages,
    onError(error) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[i18n] ${error.message}`);
      }
    },
  };
});
