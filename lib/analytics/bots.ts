// lib/analytics/bots.ts
// Detecção de bots/crawlers pelo User-Agent. Usada no `proxy.ts` (para não
// setar o cookie de identidade) e no `/api/track` (para não contabilizar a
// visita). Lista propositalmente ampla — é melhor descartar um acesso duvidoso
// do que inflar o número de "pessoas".
//
// Portado literalmente de grupo_liberty (ver
// docs/superpowers/specs/2026-09-15-analytics-visitantes-plataforma-design.md).

const BOT_RE =
  /bot|crawl|spider|slurp|mediapartners|adsbot|bingpreview|facebookexternalhit|facebot|embedly|quora link preview|whatsapp|telegrambot|discordbot|slackbot|linkedinbot|pinterest|redditbot|twitterbot|applebot|petalbot|yandex|duckduckbot|baiduspider|semrushbot|ahrefsbot|mj12bot|dotbot|dataforseo|headlesschrome|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|statuscake|python-requests|curl\/|wget|axios|go-http-client|node-fetch/i;

/**
 * `true` para requisições que não devem contar como visitante humano.
 * Sem User-Agent também é tratado como bot.
 */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return BOT_RE.test(ua);
}
