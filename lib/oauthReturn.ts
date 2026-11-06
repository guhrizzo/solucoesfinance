// Página de retorno do OAuth dos marketplaces (puro, sem next/server).
// O redirect grava o destino num cookie; o callback lê e volta pra lá.
// Só caminhos de uma lista fixa passam (evita open redirect).

export const RETURN_COOKIE = "oauth_return";
const DEFAULT_RETURN = "/estoque";
const ALLOWED = new Set(["/estoque", "/configuracoes"]);
const LOCALES = ["pt-BR", "en", "es"];

/** Devolve o caminho se estiver na lista permitida; senão, "/estoque". */
export function parseReturnTo(raw: string | null | undefined): string {
  if (typeof raw !== "string" || !raw) return DEFAULT_RETURN;
  let path = raw;
  for (const l of LOCALES) {
    if (path.startsWith(`/${l}/`)) {
      path = path.slice(l.length + 1);
      break;
    }
  }
  // comparação exata: qualquer ?, .., // ou \ cai fora da lista
  return ALLOWED.has(path) ? raw : DEFAULT_RETURN;
}

/** Lê o cookie de retorno do header Cookie; ausente ou adulterado → "/estoque". */
export function returnBaseFromCookieHeader(cookieHeader: string | null): string {
  if (!cookieHeader) return DEFAULT_RETURN;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() !== RETURN_COOKIE) continue;
    let value = part.slice(idx + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      return DEFAULT_RETURN;
    }
    return parseReturnTo(value);
  }
  return DEFAULT_RETURN;
}

/** Opções do cookie de retorno: httpOnly, SameSite=Lax (sobrevive ao retorno do marketplace), 10 min. */
export const RETURN_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};
