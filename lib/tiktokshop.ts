// lib/tiktokshop.ts
// Helpers server-side para a integração OAuth2 + TikTok Shop Partner Center API v2.
// SOMENTE para rotas de servidor (app/api/**). Nunca importe de "use client".
//
// Espelha lib/shopee.ts (token shop-level com refresh, assinatura HMAC das
// chamadas de API, push assinado) mais de perto que lib/mercadolivre.ts (que
// usa PKCE). Cobre:
//  - URL de autorização, troca de code por token e refresh
//  - loja autorizada (shop_id/shop_cipher), listagem de produtos e push de estoque
//  - detalhe de pedido (pra baixar o estoque quando chega o evento de venda)
//  - validação da assinatura dos pushes (webhook)
//
// ⚠️ https://partner.tiktokshop.com é uma SPA que bloqueia scraping (mesma
// limitação que open.shopee.com já tinha) — os paths/versões abaixo seguem o
// formato estável e público da TikTok Shop Partner API v2. Ao criar o app de
// verdade, confirme no Partner Center: (1) a versão exata dos paths
// (`/202309/...`), (2) o nome do header de assinatura do webhook, e (3) se o
// warehouse_id precisa ser explícito no update de estoque (aqui assumimos loja
// com um único armazém padrão, buscado em `fetchDefaultWarehouseId`).

import { createHmac, timingSafeEqual } from "crypto";

const AUTH_HOST = "https://auth.tiktok-shops.com";
const API_HOST = "https://open-api.tiktokglobalshop.com";

// Renova o access token quando falta menos que isso pra expirar (token dura ~7 dias).
const REFRESH_SKEW_MS = 30 * 60 * 1000;

export interface TiktokIntegracao {
  id: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  accountId?: string; // shop_id
  shopCipher?: string;
}

export interface TiktokTokenResponse {
  access_token: string;
  refresh_token: string;
  access_token_expire_in: number;
  refresh_token_expire_in?: number;
  open_id?: string;
  seller_name?: string;
  seller_base_region?: string;
}

export interface TiktokListing {
  adId: string; // `${product_id}:${sku_id}`
  title: string;
  price: number;
  quantity: number;
  sku: string;
}

export interface TiktokOrderItem {
  adId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
}

/** Um token começando com "mock_" (ou ausente) = integração em modo simulado. */
export function isMockToken(token?: string | null): boolean {
  return !token || token.startsWith("mock_");
}

/** Lê as credenciais do ambiente e diz se estão realmente configuradas. */
export function tiktokShopCredentials() {
  const appKey = process.env.TIKTOKSHOP_APP_KEY;
  const appSecret = process.env.TIKTOKSHOP_APP_SECRET;
  const redirectUri = process.env.TIKTOKSHOP_REDIRECT_URI;
  const configured =
    !!appKey &&
    appKey !== "SEU_APP_KEY_AQUI" &&
    !!appSecret &&
    appSecret !== "SEU_APP_SECRET_AQUI" &&
    !!redirectUri;
  return { appKey, appSecret, redirectUri, configured };
}

// ─── Assinatura ──────────────────────────────────────────────────────────────

function hmacHex(base: string, key: string): string {
  return createHmac("sha256", key).update(base).digest("hex");
}

/**
 * Assina uma chamada à API v2 (produto/pedido/loja — tudo, menos o fluxo de
 * auth em si). Algoritmo documentado da TikTok Shop: ordena os parâmetros de
 * query (exceto `sign`/`access_token`), concatena chave+valor ao path, soma o
 * corpo JSON (se houver) e envolve com o app_secret nas duas pontas.
 */
function signedRequest(
  path: string,
  query: Record<string, string | number> = {},
  body?: unknown
): { url: string; headers: Record<string, string> } {
  const { appKey, appSecret } = tiktokShopCredentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const params: Record<string, string | number> = { ...query, app_key: appKey || "", timestamp };

  const sortedKeys = Object.keys(params).sort();
  let base = path;
  for (const k of sortedKeys) base += `${k}${params[k]}`;
  if (body !== undefined) base += JSON.stringify(body);
  base = `${appSecret}${base}${appSecret}`;
  const sign = hmacHex(base, appSecret || "");

  const search = new URLSearchParams();
  for (const k of sortedKeys) search.set(k, String(params[k]));
  search.set("sign", sign);

  return {
    url: `${API_HOST}${path}?${search.toString()}`,
    headers: { "content-type": "application/json" },
  };
}

// ─── Autorização ─────────────────────────────────────────────────────────────

/** Monta a URL de autorização — o seller loga e autoriza a loja pro app. */
export function buildTiktokAuthUrl(opts: { state: string }): string {
  const { appKey } = tiktokShopCredentials();
  const p = new URLSearchParams({ app_key: appKey || "", state: opts.state });
  return `${AUTH_HOST}/api/v2/authorization?${p.toString()}`;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (typeof data?.code === "number" && data.code !== 0)) {
    throw new Error(data?.message || `Erro TikTok Shop (${res.status})`);
  }
  return data.data ?? data;
}

/** Troca o `code` do callback por tokens. Endpoint de auth — sem assinatura HMAC. */
export async function exchangeTiktokToken(code: string): Promise<TiktokTokenResponse> {
  const { appKey, appSecret } = tiktokShopCredentials();
  const p = new URLSearchParams({
    app_key: appKey || "",
    app_secret: appSecret || "",
    auth_code: code,
    grant_type: "authorized_code",
  });
  return getJson(`${AUTH_HOST}/api/v2/token/get?${p.toString()}`);
}

/** Usa o refresh_token (a TikTok Shop devolve um novo a cada refresh). */
export async function refreshTiktokToken(refreshToken: string): Promise<TiktokTokenResponse> {
  const { appKey, appSecret } = tiktokShopCredentials();
  const p = new URLSearchParams({
    app_key: appKey || "",
    app_secret: appSecret || "",
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  return getJson(`${AUTH_HOST}/api/v2/token/refresh?${p.toString()}`);
}

/**
 * Devolve um access token válido para a integração, renovando e persistindo no
 * Firestore (Admin SDK) se estiver perto de expirar. Muta `integ` em memória.
 * Lança se a integração for mock ou não tiver como renovar (pede reconexão).
 */
export async function getValidTiktokToken(db: any, integ: TiktokIntegracao): Promise<string> {
  if (isMockToken(integ.accessToken)) {
    throw new Error("Integração TikTok Shop em modo simulado — sem token real.");
  }
  const naoExpira = integ.expiresAt && integ.expiresAt - Date.now() > REFRESH_SKEW_MS;
  if (naoExpira && integ.accessToken) return integ.accessToken;

  if (!integ.refreshToken) {
    throw new Error("Token TikTok Shop expirado e sem refresh_token — reconecte a loja.");
  }

  const t = await refreshTiktokToken(integ.refreshToken);
  const expiresAt = Date.now() + (t.access_token_expire_in || 7 * 24 * 60 * 60) * 1000;
  const novoRefresh = t.refresh_token || integ.refreshToken;

  await db.collection("integracoes").doc(integ.id).update({
    accessToken: t.access_token,
    refreshToken: novoRefresh,
    expiresAt,
    updatedAt: Date.now(),
  });

  integ.accessToken = t.access_token;
  integ.refreshToken = novoRefresh;
  integ.expiresAt = expiresAt;
  return t.access_token;
}

// ─── API de dados ────────────────────────────────────────────────────────────

/** Loja autorizada pro token atual (shop_id + shop_cipher + nome). */
export async function fetchAuthorizedShop(
  accessToken: string
): Promise<{ shopId: string; shopCipher: string; shopName: string }> {
  const { url, headers } = signedRequest("/authorization/202309/shops");
  const res = await fetch(url, { headers: { ...headers, "x-tts-access-token": accessToken } });
  const data = await res.json().catch(() => ({}));
  const shop = data?.data?.shops?.[0];
  if (!shop) throw new Error("Nenhuma loja autorizada retornada pela TikTok Shop");
  return {
    shopId: String(shop.shop_id || ""),
    shopCipher: String(shop.cipher || shop.shop_cipher || ""),
    shopName: shop.name || shop.shop_name || `Loja TikTok Shop ${shop.shop_id}`,
  };
}

function precoDoSku(sku: any): number {
  const n = sku?.price?.tax_exclusive_price ?? sku?.price?.sale_price ?? sku?.price?.original_price ?? 0;
  return typeof n === "number" ? n : Number(n) || 0;
}

function estoqueDoSku(sku: any): number {
  const invs: any[] = Array.isArray(sku?.inventory) ? sku.inventory : [];
  return invs.reduce((s, i) => s + (Number(i?.quantity) || 0), 0);
}

function normalizeListings(product: any): TiktokListing[] {
  const productId = String(product.id || product.product_id || "");
  const title = product.title || `Produto ${productId}`;
  const skus: any[] = Array.isArray(product.skus) ? product.skus : [];
  if (skus.length === 0) {
    return [{ adId: productId, title, price: 0, quantity: 0, sku: `TTS-${productId}` }];
  }
  return skus.map((s) => {
    const skuId = String(s.id || s.sku_id || "");
    const sellerSku = String(s.seller_sku || "").trim().toUpperCase() || `TTS-${productId}-${skuId}`;
    return {
      adId: `${productId}:${skuId}`,
      title,
      price: precoDoSku(s),
      quantity: estoqueDoSku(s),
      sku: sellerSku,
    };
  });
}

/**
 * Lista os produtos ATIVOS da loja, já normalizados por SKU (um produto com
 * variação vira uma entrada por SKU). Pagina o products/search.
 */
export async function fetchTiktokListings(
  accessToken: string,
  shopId: string,
  shopCipher: string
): Promise<TiktokListing[]> {
  const out: TiktokListing[] = [];
  let pageToken = "";
  let guard = 0;

  do {
    const { url, headers } = signedRequest(
      "/product/202309/products/search",
      { shop_id: shopId, page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) }
    );
    const res = await fetch(url, {
      method: "POST",
      headers: { ...headers, "x-tts-access-token": accessToken, "x-tts-shop-cipher": shopCipher },
      body: JSON.stringify({ status: "ACTIVATE" }),
    });
    if (!res.ok) {
      if (guard === 0) throw new Error(`Não foi possível listar produtos da TikTok Shop (${res.status})`);
      break;
    }
    const data = await res.json().catch(() => ({}));
    if (typeof data?.code === "number" && data.code !== 0) {
      if (guard === 0) throw new Error(data.message || "Erro ao listar produtos da TikTok Shop");
      break;
    }
    const products: any[] = data.data?.products || [];
    for (const p of products) out.push(...normalizeListings(p));

    pageToken = data.data?.next_page_token || "";
    guard++;
  } while (pageToken && guard < 40);

  return out;
}

/**
 * Atualiza o estoque de um SKU na TikTok Shop. Assume um único armazém padrão
 * (loja sem múltiplos centros de distribuição) — busca o `warehouse_id` uma
 * vez e reaproveita.
 */
let warehouseIdCache: string | null = null;
async function fetchDefaultWarehouseId(accessToken: string, shopId: string, shopCipher: string): Promise<string> {
  if (warehouseIdCache) return warehouseIdCache;
  const { url, headers } = signedRequest("/logistics/202309/warehouses", { shop_id: shopId });
  const res = await fetch(url, {
    headers: { ...headers, "x-tts-access-token": accessToken, "x-tts-shop-cipher": shopCipher },
  });
  const data = await res.json().catch(() => ({}));
  const wid = data?.data?.warehouses?.[0]?.id;
  warehouseIdCache = wid ? String(wid) : "";
  return warehouseIdCache;
}

/** `adId` no formato `${product_id}:${sku_id}` — ver normalizeListings. */
export async function updateTiktokStock(
  accessToken: string,
  shopId: string,
  shopCipher: string,
  adId: string,
  quantity: number
): Promise<void> {
  const [productId, skuId] = adId.split(":");
  if (!productId || !skuId) throw new Error(`adId inválido pra atualizar estoque TikTok Shop: ${adId}`);

  const warehouseId = await fetchDefaultWarehouseId(accessToken, shopId, shopCipher);
  const { url, headers } = signedRequest("/product/202309/inventory/update", { shop_id: shopId });
  const res = await fetch(url, {
    method: "POST",
    headers: { ...headers, "x-tts-access-token": accessToken, "x-tts-shop-cipher": shopCipher },
    body: JSON.stringify({
      product_id: productId,
      skus: [
        {
          id: skuId,
          inventory: [{ warehouse_id: warehouseId, quantity: Math.max(0, Math.floor(quantity)) }],
        },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (typeof data?.code === "number" && data.code !== 0)) {
    throw new Error(data?.message || `Falha ao atualizar estoque TikTok Shop do SKU ${adId} (${res.status})`);
  }
}

/** Itens de um pedido (o evento de venda manda só o order_id). */
export async function fetchTiktokOrder(
  accessToken: string,
  shopId: string,
  shopCipher: string,
  orderId: string
): Promise<{ orderId: string; items: TiktokOrderItem[] }> {
  const { url, headers } = signedRequest("/order/202309/orders", { shop_id: shopId, ids: orderId });
  const res = await fetch(url, {
    headers: { ...headers, "x-tts-access-token": accessToken, "x-tts-shop-cipher": shopCipher },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (typeof data?.code === "number" && data.code !== 0)) {
    throw new Error(data?.message || `Falha ao buscar pedido TikTok Shop (${res.status})`);
  }
  const order = data.data?.orders?.[0];
  const items: TiktokOrderItem[] = (order?.line_items || []).map((it: any) => ({
    adId: `${it.product_id || ""}:${it.sku_id || ""}`,
    sku: String(it.seller_sku || "").trim().toUpperCase(),
    title: it.product_name || "",
    quantity: Number(it.quantity) || 1,
    unitPrice: Number(it.sale_price ?? it.original_price ?? 0) || 0,
  }));
  return { orderId, items };
}

// ─── Push (webhook): validação da assinatura ─────────────────────────────────

/**
 * Valida a assinatura do evento (webhook) da TikTok Shop. Base do HMAC: o
 * corpo bruto, com o app_secret. `unconfigured` quando não há
 * TIKTOKSHOP_WEBHOOK_SECRET (o chamador decide se aceita mesmo assim).
 * ⚠️ Nome exato do header a confirmar no Partner Center ao cadastrar o
 * webhook — aqui assumimos `x-tts-signature`.
 */
export function verifyTiktokPush(opts: {
  signature?: string | null;
  rawBody: string;
}): "valid" | "invalid" | "unconfigured" {
  const secret = process.env.TIKTOKSHOP_WEBHOOK_SECRET;
  if (!secret) return "unconfigured";
  if (!opts.signature) return "invalid";

  const computed = hmacHex(opts.rawBody, secret);
  try {
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(opts.signature.trim(), "hex");
    return a.length === b.length && timingSafeEqual(a, b) ? "valid" : "invalid";
  } catch {
    return "invalid";
  }
}
