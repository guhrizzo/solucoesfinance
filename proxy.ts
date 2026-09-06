import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// "proxy" é o novo nome do antigo "middleware" no Next 16. next-intl continua
// expondo o helper como `next-intl/middleware`.
//
// Negociação de idioma: prefixo da URL → cookie NEXT_LOCALE → header
// Accept-Language → pt-BR. Grava o cookie NEXT_LOCALE na resposta.
export default createMiddleware(routing);

export const config = {
  // Roda em tudo, exceto:
  //   - /api             (rotas de API — não têm locale)
  //   - /_next, /_vercel (internos do Next)
  //   - arquivos com extensão (favicon.svg, robots.txt, imagens…)
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
