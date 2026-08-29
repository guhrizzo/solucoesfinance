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

/** Repasse (escrow) de um pedido: o que o comprador pagou × o que a loja recebe. */
export interface ShopeeEscrowOrder {
  orderSn: string;
  status: string;
  /** Total pago pelo comprador (itens + frete pago por ele). */
  buyerTotalAmount: number;
  /** Valor líquido que a Shopee repassa à loja (já descontadas as taxas). */
  escrowAmount: number;
  /** Comissão + taxa de serviço + taxa de transação + frete bancado pela loja. */
  fees: number;
  /** epoch (s) da liberação do repasse; 0 = ainda não liberado (a receber). */
  releaseTime: number;
}

export interface ShopeePayoutSummary {
  /** Soma do escrow de pedidos pagos que a Shopee ainda não liberou. */
  pendente: number;
  /** Soma do escrow de pedidos já liberados dentro da janela consultada. */
  liberado: number;
  /** Soma das taxas (comissão/serviço/frete) dos pedidos considerados. */
  taxas: number;
  /** Quantos pedidos foram lidos pra montar o resumo. */
  pedidosLidos: number;
  /** true se a varredura bateu no teto e pode ter ficado incompleta. */
  truncado: boolean;
  pedidos: ShopeeEscrowOrder[];
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

// ─── Repasse / valor líquido a receber (escrow) ─────────────────────────────

// Status de pedido em que o dinheiro ainda não caiu, mas vai cair (a receber).
const STATUS_A_RECEBER = new Set([
  "READY_TO_SHIP",
  "PROCESSED",
  "SHIPPED",
  "TO_CONFIRM_RECEIVE",
]);

/** Janela máxima que a Shopee aceita por chamada em get_order_list (15 dias). */
const JANELA_MAX_S = 15 * 24 * 60 * 60;

/** Lista (order_sn, status) dos pedidos criados nos últimos `dias`. Pagina e
 *  fatia a janela em blocos de 15 dias (limite da API). */
async function fetchShopeeOrderSns(
  accessToken: string,
  shopId: string | number,
  dias: number,
  teto: number
): Promise<{ orderSn: string; status: string }[]> {
  const agora = Math.floor(Date.now() / 1000);
  const inicio = agora - dias * 24 * 60 * 60;
  const out: { orderSn: string; status: string }[] = [];

  for (let from = inicio; from < agora && out.length < teto; from += JANELA_MAX_S) {
    const to = Math.min(from + JANELA_MAX_S - 1, agora);
    let cursor = "";
    let guard = 0;
    do {
      const res = await fetch(
        shopSignedUrl("/api/v2/order/get_order_list", accessToken, shopId, {
          time_range_field: "create_time",
          time_from: from,
          time_to: to,
          page_size: 100,
          response_optional_fields: "order_status",
          ...(cursor ? { cursor } : {}),
        })
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        if (out.length === 0 && guard === 0) {
          throw new Error(data?.message || data?.error || `Falha ao listar pedidos Shopee (${res.status})`);
        }
        break;
      }
      for (const o of data.response?.order_list || []) {
        out.push({ orderSn: String(o.order_sn), status: String(o.order_status || "").toUpperCase() });
        if (out.length >= teto) break;
      }
      cursor = data.response?.more ? data.response?.next_cursor || "" : "";
      guard++;
    } while (cursor && guard < 50 && out.length < teto);
  }

  return out;
}

/**
 * Lista os repasses JÁ LIBERADOS nos últimos `dias` (get_escrow_list). Uma
 * chamada paginada barata — não precisa de get_escrow_detail por pedido.
 * Janela também fatiada em blocos de 15 dias (release_time_from/to).
 */
async function fetchShopeeEscrowList(
  accessToken: string,
  shopId: string | number,
  dias: number
): Promise<{ total: number; pedidos: ShopeeEscrowOrder[] }> {
  const agora = Math.floor(Date.now() / 1000);
  const inicio = agora - dias * 24 * 60 * 60;
  const pedidos: ShopeeEscrowOrder[] = [];
  let total = 0;

  for (let from = inicio; from < agora; from += JANELA_MAX_S) {
    const to = Math.min(from + JANELA_MAX_S - 1, agora);
    let page = 1;
    let guard = 0;
    do {
      const res = await fetch(
        shopSignedUrl("/api/v2/payment/get_escrow_list", accessToken, shopId, {
          release_time_from: from,
          release_time_to: to,
          page_size: 100,
          page_no: page,
        })
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) break;
      const lista: any[] = data.response?.escrow_list || [];
      for (const e of lista) {
        const payout =
          typeof e.payout_amount === "number" ? e.payout_amount : Number(e.escrow_amount) || 0;
        total += payout;
        pedidos.push({
          orderSn: String(e.order_sn || ""),
          status: "COMPLETED",
          buyerTotalAmount: 0,
          escrowAmount: payout,
          fees: 0,
          releaseTime: Number(e.escrow_release_time) || 0,
        });
      }
      const more = data.response?.more ?? lista.length === 100;
      page = more ? page + 1 : 0;
      guard++;
    } while (page > 0 && guard < 50);
  }

  return { total: Math.round(total * 100) / 100, pedidos };
}

/** Detalhe financeiro de um pedido (get_escrow_detail). */
export async function fetchShopeeEscrowDetail(
  accessToken: string,
  shopId: string | number,
  orderSn: string
): Promise<{ escrowAmount: number; buyerTotalAmount: number; fees: number } | null> {
  const res = await fetch(
    shopSignedUrl("/api/v2/payment/get_escrow_detail", accessToken, shopId, { order_sn: orderSn })
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) return null;

  const inc = data.response?.order_income || data.response || {};
  const num = (v: unknown) => (typeof v === "number" ? v : Number(v) || 0);
  const escrowAmount = num(inc.escrow_amount ?? inc.escrow_amount_after_adjustment);
  const buyerTotalAmount = num(inc.buyer_total_amount ?? inc.order_original_price);
  const fees =
    num(inc.commission_fee) +
    num(inc.service_fee) +
    num(inc.seller_transaction_fee) +
    num(inc.order_seller_shipping_fee) +
    num(inc.shipping_fee_discount_seller) * -1;

  return { escrowAmount, buyerTotalAmount, fees: Math.max(0, fees) };
}

/**
 * Monta o resumo de repasse da loja:
 *  - "liberado": get_escrow_list (repasses já efetuados) — barato, 1 chamada paginada.
 *  - "pendente" (valor líquido a receber): pedidos pagos ainda não concluídos
 *    (get_order_list) + get_escrow_detail de cada um (limitado por `teto`).
 * `taxas` sai do conjunto pendente (o único onde temos o detalhe fino).
 */
export async function fetchShopeePayoutSummary(
  accessToken: string,
  shopId: string | number,
  opts: { dias?: number; teto?: number } = {}
): Promise<ShopeePayoutSummary> {
  const dias = opts.dias ?? 60;
  const teto = opts.teto ?? 80;

  // 1. Já liberado (últimos `dias`).
  const escrowList = await fetchShopeeEscrowList(accessToken, shopId, dias);

  // 2. A receber: pedidos pagos ainda não concluídos, com detalhe de escrow.
  const sns = await fetchShopeeOrderSns(accessToken, shopId, Math.min(dias, 30), teto + 20);
  const aReceber = sns.filter((o) => STATUS_A_RECEBER.has(o.status)).slice(0, teto);

  const pedidos: ShopeeEscrowOrder[] = [];
  let pendente = 0;
  let taxas = 0;

  for (const o of aReceber) {
    const det = await fetchShopeeEscrowDetail(accessToken, shopId, o.orderSn);
    if (!det) continue;
    pendente += det.escrowAmount;
    taxas += det.fees;
    pedidos.push({
      orderSn: o.orderSn,
      status: o.status,
      buyerTotalAmount: det.buyerTotalAmount,
      escrowAmount: det.escrowAmount,
      fees: det.fees,
      releaseTime: 0,
    });
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    pendente: round2(pendente),
    liberado: escrowList.total,
    taxas: round2(taxas),
    pedidosLidos: aReceber.length + escrowList.pedidos.length,
    truncado: sns.filter((o) => STATUS_A_RECEBER.has(o.status)).length > teto,
    pedidos: [...pedidos, ...escrowList.pedidos],
  };
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
