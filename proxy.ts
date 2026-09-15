import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { isBotUserAgent } from "@/lib/analytics/bots";

// "proxy" é o novo nome do antigo "middleware" no Next 16. next-intl continua
// expondo o helper como `next-intl/middleware`.
//
// Negociação de idioma: prefixo da URL → cookie NEXT_LOCALE → header
// Accept-Language → pt-BR. Grava o cookie NEXT_LOCALE na resposta.
const intlMiddleware = createMiddleware(routing);

// Cookie de identidade do visitante (analytics de acesso à plataforma — ver
// docs/superpowers/specs/2026-09-15-analytics-visitantes-plataforma-design.md).
// UUID aleatório, sem PII, só pra saber se é a mesma pessoa voltando no
// mesmo dia/mês. Lido em app/api/track/route.ts.
const VISITOR_COOKIE = "nxfi_vid";
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

export default function proxy(request: NextRequest) {
  const response = intlMiddleware(request);

  // Não gera pra bots — eles não devem virar "visitantes".
  if (
    !request.cookies.get(VISITOR_COOKIE) &&
    !isBotUserAgent(request.headers.get("user-agent"))
  ) {
    response.cookies.set(VISITOR_COOKIE, randomUUID(), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: VISITOR_COOKIE_MAX_AGE,
    });
  }

  return response;
}

export const config = {
  // Roda em tudo, exceto:
  //   - /api             (rotas de API — não têm locale)
  //   - /_next, /_vercel (internos do Next)
  //   - arquivos com extensão (favicon.svg, robots.txt, imagens…)
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
