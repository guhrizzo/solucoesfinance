import type { Metadata } from "next";
import { Sora, JetBrains_Mono, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeInitializer } from "./components/ThemeInitializer";
import { ForceMotion } from "./components/ForceMotion";
import { AppShell } from "./components/AppShell";
import { CookieConsent } from "./components/CookieConsent";

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

export const metadata: Metadata = {
  title: "NexusFi — Gestão financeira empresarial",
  description:
    "Centralize o financeiro da sua empresa: fluxo de caixa, contas a pagar e receber, relatórios automáticos e controle de custos.",
  keywords: [
    "gestão financeira",
    "fluxo de caixa",
    "controle financeiro",
    "ERP financeiro",
    "relatórios financeiros",
    "PME",
  ],
  authors: [{ name: "NexusFi" }],
  openGraph: {
    title: "NexusFi — Gestão financeira empresarial",
    description:
      "Plataforma completa para organizar as finanças da sua empresa com dados em tempo real.",
    type: "website",
    locale: "pt_BR",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
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

              // Keep in sync with AppShell.tsx's INTERNAL_PREFIXES list — this
              // is the pre-hydration value so the sidebar offset (globals.css)
              // never flashes on the first paint of a route change/hard load.
              var internalPrefixes=['/dashboard','/fluxo-caixa','/contasPagar','/contasReceber','/costCenter','/estoque','/vendas','/impostos','/relatorios','/configuracoes'];
              var hasNav=internalPrefixes.some(function(p){return location.pathname.indexOf(p)===0;});
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
        <ThemeInitializer />
        <ForceMotion />
        <AppShell>{children}</AppShell>
        <CookieConsent />
      </body>
    </html>
  );
}