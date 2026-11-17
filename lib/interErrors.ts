// lib/interErrors.ts
// Peças PURAS (sem next/server) compartilhadas entre as rotas /api/inter/* e o
// núcleo lib/interConexaoServer.ts. app/api/inter/_guard.ts reexporta tudo,
// então os imports antigos continuam valendo.

export const SERVER_CONFIG_ERROR = "Integração com o Banco Inter indisponível no momento (configuração do servidor). Avise o suporte.";

/** A chave de cifragem existe? Checado antes de tocar em segredo, pra falhar com mensagem genérica. */
export function interKeyConfigured(): boolean {
  return !!process.env.INTER_ENC_KEY?.trim();
}

/**
 * Pra log: só o código do erro (ex.: "permission-denied"), nunca a mensagem —
 * mensagens de bibliotecas podem citar dados do documento ou da requisição.
 */
export function errCode(e: unknown): string {
  const c = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  return typeof c === "string" || typeof c === "number" ? String(c) : "sem-codigo";
}
