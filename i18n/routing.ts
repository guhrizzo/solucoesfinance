import { defineRouting } from "next-intl/routing";

// Nome do cookie de idioma — igual ao default do next-intl. Exportado à parte
// pra escrita manual (useLocalePreference, LocaleSync) sem depender do shape
// interno do objeto `routing`.
export const LOCALE_COOKIE = "NEXT_LOCALE";

// Configuração central de idiomas. pt-BR é o padrão e a fonte da verdade das
// mensagens (toda chave nasce em messages/pt-BR/); en e es espelham o mesmo
// conjunto de chaves.
//
// localePrefix "as-needed": pt-BR fica SEM prefixo (/dashboard), en/es ganham
// prefixo (/en/dashboard, /es/precos). Assim toda URL atual e todo link já
// compartilhado continua funcionando.
export const routing = defineRouting({
  locales: ["pt-BR", "en", "es"],
  defaultLocale: "pt-BR",
  localePrefix: "as-needed",
  // Cookie lido pelo middleware pra lembrar a escolha entre visitas.
  localeCookie: {
    name: "NEXT_LOCALE",
    maxAge: 60 * 60 * 24 * 365,
  },
});

export type AppLocale = (typeof routing.locales)[number];
