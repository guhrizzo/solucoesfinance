import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Wrappers de navegação cientes do idioma. Use SEMPRE estes no lugar de
// `next/link` e `next/navigation` em componentes de página:
//
//   - <Link href="/dashboard">      → vira /en/dashboard quando o locale é en
//   - useRouter().push("/login")    → idem
//   - usePathname()                 → retorna o caminho SEM o prefixo de idioma
//                                      (ex.: "/dashboard", nunca "/en/dashboard")
//   - redirect("/login")            → idem
//
// O `usePathname` sem locale é o que mantém as listas de rota hardcoded
// (PUBLIC_ROUTES em useAuth, INTERNAL_PREFIXES em AppShell) funcionando sem
// mudança.
//
// `useSearchParams` / `useParams` NÃO existem aqui — esses continuam vindo de
// `next/navigation`.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
