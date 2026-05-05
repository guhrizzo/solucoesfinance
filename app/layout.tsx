import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import { ThemeInitializer } from "./components/ThemeInitializer";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
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
        {/* Script CRÍTICO: Executa ANTES de qualquer renderização */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // 1. Restaura tema do localStorage
                  const savedTheme = localStorage.getItem('nexusfi-theme');
                  let theme = savedTheme;
                  
                  // 2. Se não houver, detecta preferência do sistema
                  if (!theme) {
                    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  }
                  
                  // 3. Aplica IMEDIATAMENTE no HTML
                  document.documentElement.setAttribute('data-theme', theme);
                  document.documentElement.classList.toggle('dark', theme === 'dark');
                  
                  // 4. Salva no localStorage (se não estava)
                  if (!savedTheme) {
                    localStorage.setItem('nexusfi-theme', theme);
                  }
                  
                  // 5. Debug no console
                  console.log('🎨 Tema carregado:', theme);
                } catch (e) {
                  console.error('❌ Erro ao inicializar tema:', e);
                }
              })();
            `,
          }}
        />
      </head>
      <body 
        className={sora.variable} 
        suppressHydrationWarning
        style={{ margin: 0, padding: 0 }}
      >
        {/* ThemeInitializer monitora mudanças e sincroniza */}
        <ThemeInitializer />
        {children}
      </body>
    </html>
  );
}