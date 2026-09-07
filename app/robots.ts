import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

// Site público indexável; área logada e API fora do índice.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
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
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
