import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${sora.variable} font-sans antialiased bg-white text-blue-950`}>
        {children}
      </body>
    </html>
  );
}