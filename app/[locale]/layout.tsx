import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Sora, JetBrains_Mono, Hanken_Grotesk } from "next/font/google";
import "../globals.css";
import { routing } from "@/i18n/routing";
import { SITE_URL, localePath, alternatesFor } from "@/lib/seo";
import { ThemeInitializer } from "@/app/components/ThemeInitializer";
import { ForceMotion } from "@/app/components/ForceMotion";
import { AppShell } from "@/app/components/AppShell";
import { CookieConsent } from "@/app/components/CookieConsent";
import { AccessibilityWidget } from "@/app/components/AccessibilityWidget";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Corpo, tabelas e formulários do app interno (redesign 2026-09).
// Sora fica só em títulos/rótulos (.font-heading / --font-display).
const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

const OG_LOCALE: Record<string, string> = { "pt-BR": "pt_BR", en: "en_US", es: "es_ES" };

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing.meta" });

  return {
    metadataBase: new URL(SITE_URL),
    title: t("title"),
    description: t("description"),
    authors: [{ name: "NexusFi" }],
    alternates: alternatesFor(locale),
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
      type: "website",
      url: localePath(locale),
      locale: OG_LOCALE[locale] ?? "pt_BR",
    },
    icons: {
      icon: [
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
              var t=localStorage.getItem('nexusfi-theme')
                ||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');
              document.documentElement.setAttribute('data-theme',t);
              document.documentElement.classList.toggle('dark',t==='dark');
              document.documentElement.classList.toggle('light',t==='light');
              if(!localStorage.getItem('nexusfi-theme'))
                localStorage.setItem('nexusfi-theme',t);

              var l=localStorage.getItem('nexusfi-navbar-layout')||'horizontal';
              document.documentElement.setAttribute('data-nav-layout',l);

              // "Reduzir animações" (Configurações > Aparência) — escolha
              // manual do usuário dentro do app, não segue prefers-reduced-
              // motion do SO. Aplicado antes da hidratação pra não piscar
              // animação enquanto o React ainda não montou.
              var rm=localStorage.getItem('nexusfi-reduced-motion');
              if(rm==='1') document.documentElement.setAttribute('data-reduced-motion','1');

              // Widget de acessibilidade (AccessibilityWidget.tsx): tamanho de
              // texto e sublinhar links, aplicados antes da hidratação pra não
              // piscar no recarregamento. Libras não entra aqui — o script do
              // widget é carregado sob demanda pelo próprio componente.
              var fs=localStorage.getItem('nexusfi-font-scale');
              if(fs) document.documentElement.style.fontSize=fs+'%';
              var ul=localStorage.getItem('nexusfi-underline-links');
              if(ul==='1') document.documentElement.setAttribute('data-underline-links','1');
              // Widget de acessibilidade desligado em Configurações > Aparência
              // (globals.css esconde o botão/painel na hora, sem flash).
              if(localStorage.getItem('nexusfi-a11y-widget')==='0')
                document.documentElement.setAttribute('data-a11y-widget','off');

              // Caminho SEM o prefixo de idioma (/en, /es) — as comparações de
              // rota abaixo usam os paths canônicos, iguais aos de pt-BR.
              var seg=location.pathname.split('/')[1];
              var path=(seg==='en'||seg==='es')
                ? (location.pathname.slice(seg.length+1)||'/')
                : location.pathname;

              // Keep in sync with AppShell.tsx's INTERNAL_PREFIXES list — this
              // is the pre-hydration value so the sidebar offset (globals.css)
              // never flashes on the first paint of a route change/hard load.
              var internalPrefixes=['/dashboard','/fluxo-caixa','/contasPagar','/contasReceber','/costCenter','/estoque','/vendas','/impostos','/relatorios','/configuracoes'];
              var hasNav=internalPrefixes.some(function(p){return path.indexOf(p)===0;});
              document.documentElement.setAttribute('data-has-nav',hasNav?'1':'0');
            }catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${sora.variable} ${jetbrainsMono.variable} ${hanken.variable}`}
        suppressHydrationWarning
        style={{ margin: 0, padding: 0 }}
      >
        <a href="#conteudo-principal" className="skip-link">
          Pular para o conteúdo
        </a>
        <NextIntlClientProvider>
          <ThemeInitializer />
          <ForceMotion />
          <AppShell>{children}</AppShell>
          <CookieConsent />
          <AccessibilityWidget />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
