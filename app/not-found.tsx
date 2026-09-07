import Link from "next/link";

// Fallback pra caminhos que não casaram com nenhum idioma (fora de /[locale]).
// O 404 "normal" da aplicação é o app/[locale]/not-found.tsx — este aqui só
// existe porque ele precisa renderizar o próprio <html>/<body> (roda fora do
// LocaleLayout). Ver docs do next-intl, "Not found pages".
export default function RootNotFound() {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#060e1e",
          color: "#e2e8f0",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 48, margin: 0 }}>404</h1>
          <p style={{ opacity: 0.7 }}>Página não encontrada.</p>
          <Link href="/" style={{ color: "#60a5fa" }}>
            Voltar ao início
          </Link>
        </div>
      </body>
    </html>
  );
}
