// lib/rateLimit.ts
// Limitador simples em memória para rotas de API sensíveis a custo/abuso
// (chamadas de LLM, integrações com APIs de terceiros, envio de e-mail...).
//
// Aviso: em ambientes serverless com múltiplas instâncias isso NÃO é um
// limite global confiável — cada instância do processo tem seu próprio
// Map, então o limite real é "por instância", não "por app". Serve como
// primeira barreira contra abuso/custo descontrolado; para algo à prova
// de escala entre instâncias, troque por Upstash Redis ou Vercel KV.

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

// Limpeza periódica leve pra não crescer o Map indefinidamente em processos
// de vida longa (dev local / servidores não-serverless).
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      bucket.timestamps = bucket.timestamps.filter((t) => now - t < 60 * 60 * 1000);
      if (bucket.timestamps.length === 0) buckets.delete(key);
    }
  }, 10 * 60 * 1000);
  cleanupTimer.unref?.();
}

export interface RateLimitOptions {
  /** Duração da janela deslizante, em ms. */
  windowMs: number;
  /** Máximo de pedidos permitidos dentro da janela. */
  max: number;
}

export interface RateLimitResult {
  limited: boolean;
  remaining: number;
  /** Segundos até o pedido mais antigo da janela expirar (útil pra header Retry-After). */
  retryAfterSec: number;
}

/** Registra um pedido para `key` e diz se ele deve ser bloqueado pela janela deslizante. */
export function checkRateLimit(key: string, { windowMs, max }: RateLimitOptions): RateLimitResult {
  ensureCleanup();
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  bucket.timestamps.push(now);
  buckets.set(key, bucket);

  const limited = bucket.timestamps.length > max;
  const oldest = bucket.timestamps[0] ?? now;
  const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));

  return { limited, remaining: Math.max(0, max - bucket.timestamps.length), retryAfterSec };
}

/** Extrai um identificador best-effort do requisitante a partir do IP (atrás de proxy/CDN, ex.: Vercel). */
export function getClientIp(req: Request): string {
  const h = req.headers;
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return h.get("x-real-ip") ?? "unknown";
}
