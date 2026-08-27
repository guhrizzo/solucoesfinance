// lib/mercadolivre.ts
// Helpers server-side para a integração OAuth2 (com PKCE) + API do Mercado Livre.
// SOMENTE para rotas de servidor (app/api/**). Nunca importe de "use client".
//
// Cobre:
//  - PKCE (code_verifier / code_challenge) — hoje obrigatório no OAuth do ML
//  - troca de code por token e refresh automático (access token dura ~6h)
//  - listagem de anúncios ativos e push de estoque de volta pro anúncio
//  - validação da assinatura (x-signature) dos webhooks de notificação

import { createHash, randomBytes, createHmac, timingSafeEqual } from "crypto";

// Brasil: o domínio de autorização é auth.mercadoLIVRE.com.br ("livre", com V).
// A API de dados/token é sempre api.mercadoLIBRE.com ("libre", global).
const ML_AUTH_BASE = "https://auth.mercadolivre.com.br";
const ML_API_BASE = "https://api.mercadolibre.com";

// Renova o access token quando falta menos que isso pra ele expirar.
const REFRESH_SKEW_MS = 5 * 60 * 1000;

export interface MlIntegracao {
  id: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  accountId?: string;
}

export interface MlTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
  scope?: string;
  token_type?: string;
}

export interface MlListing {
  adId: string;
  title: string;
  price: number;
  quantity: number;
  sku: string;
}

/** Um token começando com "mock_" (ou ausente) = integração em modo simulado. */
export function isMockToken(token?: string | null): boolean {
  return !token || token.startsWith("mock_");
}

/** Lê as credenciais do ambiente e diz se estão realmente configuradas. */
export function mlCredentials() {
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID;
  const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET;
  const redirectUri = process.env.MERCADOLIVRE_REDIRECT_URI;
  const configured =
    !!clientId && clientId !== "SEU_CLIENT_ID_AQUI" && !!clientSecret && !!redirectUri;
  return { clientId, clientSecret, redirectUri, configured };
}

// ─── PKCE ────────────────────────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Gera o par PKCE. Guarde o `verifier` (cookie httpOnly) até o callback. */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32)); // 43 chars, dentro do range 43-128
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** Monta a URL de autorização do ML (Brasil) já com PKCE. */
export function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${ML_AUTH_BASE}/authorization?${p.toString()}`;
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

async function postToken(params: Record<string, string>): Promise<MlTokenResponse> {
  const res = await fetch(`${ML_API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data?.message || data?.error_description || data?.error || `Erro OAuth Mercado Livre (${res.status})`
    );
  }
  return data as MlTokenResponse;
}

/** Troca o `code` do callback por tokens. Precisa do `codeVerifier` do PKCE. */
export async function exchangeCodeForToken(opts: {
  code: string;
  codeVerifier: string;
}): Promise<MlTokenResponse> {
  const { clientId, clientSecret, redirectUri } = mlCredentials();
  return postToken({
    grant_type: "authorization_code",
    client_id: clientId || "",
    client_secret: clientSecret || "",
    code: opts.code,
    redirect_uri: redirectUri || "",
    code_verifier: opts.codeVerifier,
  });
}

/** Usa o refresh_token (uso único — o ML devolve um novo a cada refresh). */
export async function refreshAccessToken(refreshToken: string): Promise<MlTokenResponse> {
  const { clientId, clientSecret } = mlCredentials();
  return postToken({
    grant_type: "refresh_token",
    client_id: clientId || "",
    client_secret: clientSecret || "",
    refresh_token: refreshToken,
  });
}

/**
 * Devolve um access token válido para a integração, renovando e persistindo
 * no Firestore se estiver perto de expirar. Também muta o objeto `integracao`
 * em memória pro chamador reaproveitar os campos novos.
 *
 * `db` é o Firestore do Admin SDK (getAdminDb()) — as rotas de servidor
 * gravam sem passar pelas Firestore rules.
 * Lança se a integração for mock ou não tiver como renovar (pede reconexão).
 */
export async function getValidAccessToken(db: any, integracao: MlIntegracao): Promise<string> {
  if (isMockToken(integracao.accessToken)) {
    throw new Error("Integração em modo simulado — sem token real do Mercado Livre.");
  }

  const naoExpira = integracao.expiresAt && integracao.expiresAt - Date.now() > REFRESH_SKEW_MS;
  if (naoExpira && integracao.accessToken) return integracao.accessToken;

  if (!integracao.refreshToken) {
    throw new Error("Token do Mercado Livre expirado e sem refresh_token — reconecte a conta.");
  }

  const t = await refreshAccessToken(integracao.refreshToken);
  const expiresAt = Date.now() + t.expires_in * 1000;
  const novoRefresh = t.refresh_token || integracao.refreshToken;

  await db.collection("integracoes").doc(integracao.id).update({
    accessToken: t.access_token,
    refreshToken: novoRefresh,
    expiresAt,
    updatedAt: Date.now(),
  });

  integracao.accessToken = t.access_token;
  integracao.refreshToken = novoRefresh;
  integracao.expiresAt = expiresAt;
  return t.access_token;
}

// ─── API de dados ────────────────────────────────────────────────────────────

/** Dados básicos da conta (nickname) pra rotular a integração. */
export async function fetchAccountInfo(
  accessToken: string,
  accountId: string
): Promise<{ nickname: string }> {
  const res = await fetch(`${ML_API_BASE}/users/${accountId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { nickname: `Conta ML ${accountId}` };
  const d = await res.json().catch(() => ({}));
  return { nickname: d.nickname || d.first_name || `Conta ML ${accountId}` };
}

/**
 * Lista todos os anúncios ATIVOS da conta, já normalizados. Usa paginação
 * `search_type=scan` (aguenta contas com muitos anúncios) e busca detalhes
 * em lote de 20. SKU sempre em MAIÚSCULAS pra casar com o estoque central.
 */
export async function fetchActiveListings(
  accessToken: string,
  accountId: string
): Promise<MlListing[]> {
  const out: MlListing[] = [];
  let scrollId: string | undefined;
  let guard = 0;

  do {
    const url = new URL(`${ML_API_BASE}/users/${accountId}/items/search`);
    url.searchParams.set("status", "active");
    url.searchParams.set("search_type", "scan");
    url.searchParams.set("limit", "100");
    if (scrollId) url.searchParams.set("scroll_id", scrollId);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) {
      if (guard === 0) throw new Error(`Não foi possível listar anúncios do ML (${res.status})`);
      break;
    }
    const data = await res.json().catch(() => ({}));
    const ids: string[] = data.results || [];
    scrollId = data.scroll_id;
    if (ids.length === 0) break;

    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20).join(",");
      const dRes = await fetch(
        `${ML_API_BASE}/items?ids=${batch}&attributes=id,title,price,available_quantity,seller_custom_field,attributes`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!dRes.ok) continue;
      const details = await dRes.json().catch(() => []);
      for (const w of details) {
        if (w.code === 200 && w.body) {
          out.push(normalizeListing(w.body));
        }
      }
    }
    guard++;
  } while (scrollId && guard < 50);

  return out;
}

function normalizeListing(item: any): MlListing {
  let sku: string = item.seller_custom_field || "";
  if (!sku && Array.isArray(item.attributes)) {
    const a = item.attributes.find((x: any) => x.id === "SELLER_SKU");
    if (a) sku = a.value_name || a.value_id || "";
  }
  if (!sku) sku = `ML-${item.id}`;
  return {
    adId: String(item.id),
    title: item.title || `Anúncio ${item.id}`,
    price: typeof item.price === "number" ? item.price : 0,
    quantity: typeof item.available_quantity === "number" ? item.available_quantity : 0,
    sku: String(sku).trim().toUpperCase(),
  };
}

/**
 * Atualiza a quantidade disponível de um anúncio no ML.
 * Obs.: anúncios com variações exigem atualizar cada `variations[].available_quantity`
 * — este helper cobre o caso simples (sem variação).
 */
export async function updateListingQuantity(
  accessToken: string,
  adId: string,
  quantity: number
): Promise<void> {
  const res = await fetch(`${ML_API_BASE}/items/${adId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ available_quantity: Math.max(0, Math.floor(quantity)) }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Falha ao atualizar estoque do anúncio ${adId} (${res.status}): ${t.slice(0, 200)}`);
  }
}

/** Detalhes de um pedido (webhook de `orders_v2` manda só o resource). */
export async function fetchOrder(accessToken: string, resourcePath: string): Promise<any> {
  const path = resourcePath.startsWith("http")
    ? resourcePath
    : `${ML_API_BASE}${resourcePath.startsWith("/") ? "" : "/"}${resourcePath}`;
  const res = await fetch(path, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    throw new Error(`Falha ao buscar pedido no ML (${res.status})`);
  }
  return res.json();
}

// ─── Webhook: validação da assinatura ────────────────────────────────────────

/**
 * Valida o header `x-signature` das notificações do ML.
 * Retorna "unconfigured" quando não há MERCADOLIVRE_WEBHOOK_SECRET definido
 * (aí o chamador decide se aceita mesmo assim).
 *
 * Template do manifesto (docs ML): `id:<dataId>;request-id:<x-request-id>;ts:<ts>;`
 * (cada segmento só entra se o valor existir).
 */
export function verifyWebhookSignature(opts: {
  xSignature?: string | null;
  xRequestId?: string | null;
  dataId?: string | null;
}): "valid" | "invalid" | "unconfigured" {
  const secret = process.env.MERCADOLIVRE_WEBHOOK_SECRET;
  if (!secret) return "unconfigured";
  if (!opts.xSignature) return "invalid";

  const parts: Record<string, string> = {};
  for (const kv of opts.xSignature.split(",")) {
    const i = kv.indexOf("=");
    if (i === -1) continue;
    parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return "invalid";

  let manifest = "";
  if (opts.dataId) manifest += `id:${opts.dataId};`;
  if (opts.xRequestId) manifest += `request-id:${opts.xRequestId};`;
  manifest += `ts:${ts};`;

  const computed = createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(v1, "hex");
    return a.length === b.length && timingSafeEqual(a, b) ? "valid" : "invalid";
  } catch {
    return "invalid";
  }
}
