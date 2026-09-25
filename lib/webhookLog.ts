// lib/webhookLog.ts
// Registro persistente das chamadas dos gateways de pagamento (SOMENTE
// server-side). Os logs de runtime da Vercel somem em horas; quando um
// pagamento não é confirmado (ex.: incidente de 2026-09-23 com a InfinitePay,
// em que nenhum aviso chegou), é aqui que dá pra ver se o gateway chamou, o
// que mandou e o que respondemos.
//
// Coleção raiz `webhookLogs` — negada ao client pelo fallback de
// firestore.rules; lida só pelo console do Firebase / Admin SDK.
// `expireAt` (+90 dias) permite ligar uma política de TTL no console.
//
// Uso (envolve o handler sem mexer na lógica dele):
//   export const POST = withWebhookLog("infinitepay-webhook", handler);

import { getAdminDb } from "./firebaseAdmin";

export type WebhookLogSource = "infinitepay-webhook" | "mercadopago-webhook" | "billing-confirm";

const MAX_BODY_CHARS = 8000;
const RETENTION_DAYS = 90;

function truncate(s: string, max = MAX_BODY_CHARS): string {
  return s.length > max ? `${s.slice(0, max)}…[+${s.length - max} chars]` : s;
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));

/** Campos-chave no topo do doc, pra filtrar no console sem abrir o corpo. */
function extractRefs(body: Record<string, unknown> | null, url: URL) {
  const data = (body?.data ?? {}) as Record<string, unknown>;
  const orderNsu = str(body?.order_nsu);
  return {
    orderNsu,
    transactionNsu: str(body?.transaction_nsu),
    slug: str(body?.invoice_slug ?? body?.slug),
    amount: typeof body?.amount === "number" ? body.amount : null,
    // order_nsu = ownerUid__plano__[contrato__]ts (ver lib/infinitepay.ts)
    ownerUid: orderNsu ? orderNsu.split("__")[0] || null : null,
    topic: str(body?.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic")),
    dataId: str(data.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id")),
    preapprovalId: str(body?.preapproval_id),
  };
}

export function withWebhookLog(
  source: WebhookLogSource,
  handler: (request: Request) => Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const started = Date.now();
    const url = new URL(request.url);
    const rawBody = await request.clone().text().catch(() => "");

    let response: Response | null = null;
    let thrown: unknown = null;
    try {
      response = await handler(request);
    } catch (err) {
      thrown = err;
    }

    const responseText = response ? await response.clone().text().catch(() => "") : "";
    const parsedBody = safeJson(rawBody);

    try {
      const db = await getAdminDb();
      const now = Date.now();
      await db.collection("webhookLogs").add({
        source,
        receivedAt: now,
        expireAt: new Date(now + RETENTION_DAYS * 24 * 60 * 60 * 1000),
        durationMs: now - started,
        method: request.method,
        // Só a query string — nunca headers de autorização.
        query: url.search || null,
        ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
        userAgent: request.headers.get("user-agent"),
        mpRequestId: request.headers.get("x-request-id"),
        hasSignature: !!request.headers.get("x-signature"),
        ...extractRefs(parsedBody, url),
        body: truncate(rawBody),
        responseStatus: response?.status ?? 500,
        response: truncate(responseText, 2000),
        error: thrown ? truncate(String((thrown as Error)?.stack || thrown), 2000) : null,
      });
    } catch (err) {
      // O log nunca pode derrubar a confirmação de um pagamento.
      console.error(`[webhookLog] falha ao registrar ${source}:`, err);
    }

    if (thrown) throw thrown;
    return response as Response;
  };
}
