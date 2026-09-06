// O Next exige um layout na raiz de app/, mas quem renderiza <html>/<body> é o
// app/[locale]/layout.tsx — só ele conhece o idioma ativo (pra <html lang>).
// Este layout só repassa os filhos. Ver docs do next-intl (App Router + i18n
// routing) e docs/superpowers/specs/2026-09-06-i18n-multi-idioma-design.md.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
