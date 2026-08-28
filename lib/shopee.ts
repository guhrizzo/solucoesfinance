// lib/shopee.ts
// Helpers server-side para a integração OAuth2 + Shopee Open Platform API v2.
// SOMENTE para rotas de servidor (app/api/**). Nunca importe de "use client".
//
// Espelha lib/mercadolivre.ts. Cobre:
//  - assinatura HMAC-SHA256 das requisições (APIs "public" e "shop")
//  - URL de autorização (auth_partner), troca de code por token e refresh
//  - listagem de itens ativos e push de estoque de volta pro item
//  - detalhe de pedido (pra baixar o estoque quando chega o push de venda)
//  - validação da assinatura (header Authorization) dos pushes da Shopee
//
// Ambiente: por padrão produção (partner.shopeemobile.com). Com
// SHOPEE_SANDBOX="true" usa o host de testes (partner.test-stable.shopeemobile.com).

import { createHmac, timingSafeEqual } from "crypto";

const HOST_PROD = "https://partner.shopeemobile.com";
const HOST_SANDBOX = "https://partner.test-stable.shopeemobile.com";

// Renova o access token quando falta menos que isso pra expirar (token dura ~4h).
const REFRESH_SKEW_MS = 10 * 60 * 1000;

export function shopeeHost(): string {
  return process.env.SHOPEE_SANDBOX === "true" ? HOST_SANDBOX : HOST_PROD;
}

export interface ShopeeIntegracao {
  id: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  accountId?: string; // shop_id
}

export interface ShopeeTokenResponse {
  access_token: string;
  refresh_token: string;
  expire_in: number;
  shop_id?: number;
  merchant_id?: number;
  error?: string;
  message?: string;
}

export interface ShopeeListing {
  adId: string; // item_id
  title: string;
  price: number;
  quantity: number;
  sku: string;
}

export interface ShopeeOrderItem {
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
export function shopeeCredentials() {
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const redirectUri = process.env.SHOPEE_REDIRECT_URI;
  const configured =
    !!partnerId &&
    partnerId !== "SEU_PARTNER_ID_AQUI" &&
    !!partnerKey &&
    partnerKey !== "SEU_PARTNER_KEY_AQUI" &&
    !!redirectUri;
  return { partnerId, partnerKey, redirectUri, configured };
}

// ─── Assinatura ──────────────────────────────────────────────────────────────

function hmacHex(base: string, key: string): string {
  return createHmac("sha256", key).update(base).digest("hex");
}

/**
 * URL assinada de uma API "public" (sem loja): base = partner_id + path + timestamp.
 * Usada só no fluxo de token (token/get, access_token/get) e no auth_partner.
 */
function publicSignedUrl(path: string): string {
  const { partnerId, partnerKey } = shopeeCredentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = hmacHex(`${partnerId}${path}${timestamp}`, partnerKey || "");
  return `${shopeeHost()}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}`;
}

/**
 * URL assinada de uma API de loja: base = partner_id + path + timestamp +
 * access_token + shop_id. `extra` são parâmetros de query adicionais da chamada.
 */
function shopSignedUrl(
  path: string,
  accessToken: string,
  shopId: string | number,
  extra: Record<string, string | number> = {}
): string {
  const { partnerId, partnerKey } = shopeeCredentials();
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = hmacHex(`${partnerId}${path}${timestamp}${accessToken}${shopId}`, partnerKey || "");
  const params = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign,
    access_token: accessToken,
    shop_id: String(shopId),
  });
  for (const [k, v] of Object.entries(extra)) params.set(k, String(v));
  return `${shopeeHost()}${path}?${params.toString()}`;
}

// ─── Autorização ─────────────────────────────────────────────────────────────

/**
 * Monta a URL de autorização (auth_partner). A Shopee só devolve `code` e
 * `shop_id` no retorno, então o `state` (CSRF + rastro do usuário) vai embutido
 * no próprio `redirect`. O par de verificação real fica no cookie httpOnly que
 * a rota de redirect grava.
 */
export function buildShopeeAuthUrl(opts: { state: string }): string {
  const { partnerId, partnerKey, redirectUri } = shopeeCredentials();
  const path = "/api/v2/shop/auth_partner";
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = hmacHex(`${partnerId}${path}${timestamp}`, partnerKey || "");
  const sep = redirectUri!.includes("?") ? "&" : "?";
  const redirect = `${redirectUri}${sep}state=${encodeURIComponent(opts.state)}`;
  const p = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign,
    redirect,
  });
  return `${shopeeHost()}${path}?${p.toString()}`;
}

async function postJson(url: string, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.message || data?.error || `Erro Shopee (${res.status})`);
  }
  return data;
}

/** Troca o `code` do callback por tokens. */
export async function exchangeShopeeToken(opts: {
  code: string;
  shopId: string;
}): Promise<ShopeeTokenResponse> {
  const { partnerId } = shopeeCredentials();
  return postJson(publicSignedUrl("/api/v2/auth/token/get"), {
    code: opts.code,
    shop_id: Number(opts.shopId),
    partner_id: Number(partnerId),
  });
}

/** Usa o refresh_token (a Shopee devolve um novo a cada refresh). */
export async function refreshShopeeToken(
  refreshToken: string,
  shopId: string | number
): Promise<ShopeeTokenResponse> {
  const { partnerId } = shopeeCredentials();
  return postJson(publicSignedUrl("/api/v2/auth/access_token/get"), {
    refresh_token: refreshToken,
    shop_id: Number(shopId),
    partner_id: Number(partnerId),
  });
}

/**
 * Devolve um access token válido para a integração, renovando e persistindo no
 * Firestore (Admin SDK) se estiver perto de expirar. Muta `integ` em memória.
 * Lança se a integração for mock ou não tiver como renovar (pede reconexão).
 */
export async function getValidShopeeToken(db: any, integ: ShopeeIntegracao): Promise<string> {
  if (isMockToken(integ.accessToken)) {
    throw new Error("Integração Shopee em modo simulado — sem token real.");
  }
  const naoExpira = integ.expiresAt && integ.expiresAt - Date.now() > REFRESH_SKEW_MS;
  if (naoExpira && integ.accessToken) return integ.accessToken;

  if (!integ.refreshToken) {
    throw new Error("Token Shopee expirado e sem refresh_token — reconecte a loja.");
  }

  const t = await refreshShopeeToken(integ.refreshToken, integ.accountId || "");
  const expiresAt = Date.now() + (t.expire_in || 14400) * 1000;
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

/** Nome da loja pra rotular a integração. */
export async function fetchShopInfo(
  accessToken: string,
  shopId: string | number
): Promise<{ shopName: string }> {
  try {
    const res = await fetch(shopSignedUrl("/api/v2/shop/get_shop_info", accessToken, shopId));
    const d = await res.json().catch(() => ({}));
    return { shopName: d.shop_name || d.response?.shop_name || `Loja Shopee ${shopId}` };
  } catch {
    return { shopName: `Loja Shopee ${shopId}` };
  }
}

function precoDoItem(item: any): number {
  const pi = Array.isArray(item.price_info) ? item.price_info[0] : undefined;
  const n = pi?.current_price ?? pi?.original_price ?? item.current_price ?? item.original_price ?? 0;
  return typeof n === "number" ? n : Number(n) || 0;
}

function estoqueDoItem(item: any): number {
  // API nova: stock_info_v2.summary_info.total_available_stock
  const v2 = item.stock_info_v2?.summary_info?.total_available_stock;
  if (typeof v2 === "number") return v2;
  // API antiga: stock_info[].current_stock / normal_stock
  const si = Array.isArray(item.stock_info) ? item.stock_info[0] : undefined;
  const n = si?.current_stock ?? si?.normal_stock ?? 0;
  return typeof n === "number" ? n : Number(n) || 0;
}

function normalizeListing(item: any): ShopeeListing {
  const adId = String(item.item_id);
  let sku: string = item.item_sku || "";
  if (!sku) sku = `SHP-${adId}`;
  return {
    adId,
    title: item.item_name || `Item ${adId}`,
    price: precoDoItem(item),
    quantity: estoqueDoItem(item),
    sku: String(sku).trim().toUpperCase(),
  };
}

/**
 * Lista todos os itens NORMAL (ativos) da loja, já normalizados. Pagina o
 * get_item_list e busca detalhes em lote de 50 no get_item_base_info.
 */
export async function fetchShopeeListings(
  accessToken: string,
  shopId: string | number
): Promise<ShopeeListing[]> {
  const out: ShopeeListing[] = [];
  let offset = 0;
  let guard = 0;

  do {
    const listRes = await fetch(
      shopSignedUrl("/api/v2/product/get_item_list", accessToken, shopId, {
        offset,
        page_size: 50,
        item_status: "NORMAL",
      })
    );
    if (!listRes.ok) {
      if (guard === 0) throw new Error(`Não foi possível listar itens da Shopee (${listRes.status})`);
      break;
    }
    const listData = await listRes.json().catch(() => ({}));
    if (listData?.error) {
      if (guard === 0) throw new Error(listData.message || listData.error);
      break;
    }
    const items: any[] = listData.response?.item || [];
    const ids = items.map((i) => i.item_id).filter(Boolean);

    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50).join(",");
      const infoRes = await fetch(
        shopSignedUrl("/api/v2/product/get_item_base_info", accessToken, shopId, {
          item_id_list: batch,
        })
      );
      if (!infoRes.ok) continue;
      const infoData = await infoRes.json().catch(() => ({}));
      for (const it of infoData.response?.item_list || []) {
        out.push(normalizeListing(it));
      }
    }

    const hasNext = !!listData.response?.has_next_page;
    offset = listData.response?.next_offset ?? offset + 50;
    guard++;
    if (!hasNext) break;
  } while (guard < 40);

  return out;
}

/**
 * Atualiza o estoque de um item na Shopee (caso sem variação — model_id 0).
 * Itens com variação exigem um `model_id` por variação — fora do escopo aqui.
 */
export async function updateShopeeStock(
  accessToken: string,
  shopId: string | number,
  itemId: string | number,
  quantity: number
): Promise<void> {
  const url = shopSignedUrl("/api/v2/product/update_stock", accessToken, shopId);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_id: Number(itemId),
      stock_list: [
        { model_id: 0, seller_stock: [{ stock: Math.max(0, Math.floor(quantity)) }] },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.message || data?.error || `Falha ao atualizar estoque Shopee do item ${itemId} (${res.status})`);
  }
}

/** Itens de um pedido (o push manda só o ordersn). */
export async function fetchShopeeOrder(
  accessToken: string,
  shopId: string | number,
  orderSn: string
): Promise<{ orderSn: string; items: ShopeeOrderItem[] }> {
  const res = await fetch(
    shopSignedUrl("/api/v2/order/get_order_detail", accessToken, shopId, {
      order_sn_list: orderSn,
      response_optional_fields: "item_list",
    })
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) {
    throw new Error(data?.message || data?.error || `Falha ao buscar pedido Shopee (${res.status})`);
  }
  const order = data.response?.order_list?.[0];
  const items: ShopeeOrderItem[] = (order?.item_list || []).map((it: any) => ({
    adId: String(it.item_id || ""),
    sku: String(it.item_sku || "").trim().toUpperCase(),
    title: it.item_name || "",
    quantity: it.model_quantity_purchased || it.quantity_purchased || 1,
    unitPrice:
      Number(it.model_discounted_price ?? it.model_original_price ?? it.discounted_price ?? 0) || 0,
  }));
  return { orderSn, items };
}

// ─── Push (webhook): validação da assinatura ─────────────────────────────────

/**
 * Valida o header `Authorization` dos pushes da Shopee.
 * Base do HMAC: `${url}|${raw_body}` com a partner_key.
 * "unconfigured" quando não há SHOPEE_PARTNER_KEY (o chamador decide se aceita).
 */
export function verifyShopeePush(opts: {
  authorization?: string | null;
  url: string;
  rawBody: string;
}): "valid" | "invalid" | "unconfigured" {
  const { partnerKey } = shopeeCredentials();
  if (!partnerKey) return "unconfigured";
  if (!opts.authorization) return "invalid";

  const computed = hmacHex(`${opts.url}|${opts.rawBody}`, partnerKey);
  try {
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(opts.authorization.trim(), "hex");
    return a.length === b.length && timingSafeEqual(a, b) ? "valid" : "invalid";
  } catch {
    return "invalid";
  }
}
