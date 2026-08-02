import type { Metadata } from "next";
import { Sora, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeInitializer } from "./components/ThemeInitializer";
import { AppShell } from "./components/AppShell";

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

export const metadata: Metadata = {
  title: "Midas Touch — Gestão financeira empresarial",
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
  authors: [{ name: "Midas Touch" }],
  openGraph: {
    title: "Midas Touch — Gestão financeira empresarial",
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
            }catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${sora.variable} ${jetbrainsMono.variable}`}
        suppressHydrationWarning
        style={{ margin: 0, padding: 0 }}
      >
        <ThemeInitializer />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}