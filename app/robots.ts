import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { routing } from "@/i18n/routing";

// Site público indexável; área logada, telas internas e API fora do índice.
//
// pt-BR (locale padrão) fica SEM prefixo (/dashboard); en/es ganham prefixo
// (/en/dashboard, /es/dashboard) — ver i18n/routing.ts (localePrefix "as-needed").
// Por isso cada caminho privado é bloqueado nos 3 idiomas.
const PRIVATE_PATHS = [
  "/dashboard",
  "/fluxo-caixa",
  "/contasPagar",
  "/contasReceber",
  "/costCenter",
  "/estoque",
  "/vendas",
  "/impostos",
  "/relatorios",
  "/configuracoes",
  "/assinatura",
  "/users",
  "/debug",
  "/developer",
  "/design-system",
];

const localizedDisallow = PRIVATE_PATHS.flatMap((path) =>
  routing.locales.map((locale) =>
    locale === routing.defaultLocale ? path : `/${locale}${path}`,
  ),
);

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", ...localizedDisallow],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
