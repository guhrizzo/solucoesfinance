import { notFound } from "next/navigation";

// Rota "pega-tudo" dentro de /[locale]. Sem ela, um caminho inexistente com
// prefixo de idioma (/en/qualquer-coisa) cairia no app/not-found.tsx da raiz
// (fora do LocaleLayout) em vez do 404 estilizado da aplicação
// (app/[locale]/not-found.tsx). Padrão recomendado pelo next-intl.
export default function CatchAllPage() {
  notFound();
}
