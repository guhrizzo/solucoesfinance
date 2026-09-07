import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { SITE_URL, localePath, alternatesFor } from "@/lib/seo";

// Rotas públicas indexáveis (a área logada é noindex). Cada uma gera as 3
// variantes de idioma com hreflang recíproco.
const PUBLIC_PATHS = ["", "/login", "/register", "/privacidade", "/acessibilidade"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return PUBLIC_PATHS.flatMap((path) => {
    const { languages } = alternatesFor(routing.defaultLocale, path);
    return routing.locales.map((locale) => ({
      url: `${SITE_URL}${localePath(locale, path)}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : 0.6,
      alternates: {
        languages: Object.fromEntries(
          Object.entries(languages).map(([l, p]) => [l, `${SITE_URL}${p}`]),
        ),
      },
    }));
  });
}
