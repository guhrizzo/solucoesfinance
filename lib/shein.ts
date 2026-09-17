// lib/shein.ts
// Helpers server-side para a integração com a Shein Open Platform (open.sheincorp.com).
// SOMENTE para rotas de servidor (app/api/**). Nunca importe de "use client".
//
// Autenticação bem diferente de ML/Shopee/TikTok Shop — NÃO é OAuth2 padrão:
//  1. O lojista clica num link de autorização (host "empower"), loga no painel
//     de vendedor da Shein e autoriza o app.
//  2. A Shein redireciona o navegador do lojista pro nosso redirectUri com
//     `?appid=...&tempToken=...&state=...` (tempToken válido só 10 minutos).
//  3. O backend troca o tempToken por `openKeyId`+`secretKey` chamando
//     POST /open-api/auth/get-by-token — assinado com APP_ID+APP_SECRET
//     (o desenvolvedor ainda não tem chave da loja nesse passo).
//  4. A `secretKey` volta CIFRADA (AES-128-CBC) — precisa ser decifrada com a
//     APP_SECRET antes de guardar/usar. Diferente de token OAuth, a chave é
//     permanentemente válida (não expira, não tem refresh) — só é revogada se
//     o lojista desautorizar ou reautorizar o app.
//  5. Toda chamada de API "de dados" (produto/pedido/estoque) e o webhook
//     exigem uma assinatura HMAC-SHA256 própria (ver `sign`/`verifySignature`),
//     calculada de um jeito diferente do esquema de ML/Shopee/TikTok Shop.
//
// Convenção de armazenamento (Firestore `integracoes`, mesmo shape do ML/
// Shopee/TikTok): `accessToken` guarda o `openKeyId`, `refreshToken` guarda a
// `secretKey` já decifrada, `accountId` guarda o `supplierId`. Não há
// exchange/refresh de verdade (a chave não expira) — `getValidSheinToken`
// só existe pra manter a mesma assinatura de função usada pelos outros
// canais nos pontos de código compartilhados (webhook, sincronizar,
// estoqueSync).
//
// Confirmado contra a documentação oficial pública (open.sheincorp.com →
// Documentos → Documentação da API / Documentação do desenvolvedor) em
// 2026-09-16, sem precisar de app aprovado:
//  - Fluxo de autorização, formato do link de "empower", troca do tempToken e
//    decifra AES da secretKey — página "Manual da aplicação de autorização
//    da loja" (inclui exemplos de código completos em Java/PHP/C#/Python/JS).
//  - Regras de assinatura (VALUE = chave&timestamp&path, KEY = segredo+
//    randomKey, HMAC-SHA256 → hex → base64, resultado prefixado pelo
//    randomKey) — página "Regras de assinatura".
//  - Assinatura e decifra do corpo do webhook — página "Instruções de acesso
//    de retorno de chamada de evento": assina com `appid`+`appSecretKey` (NÃO
//    com openKeyId+secretKey do lojista), mesma cifra AES do passo 4.
//  - Endpoints de pedido: POST /open-api/order/order-list (lista, filtra por
//    status/janela de tempo) e POST /open-api/order/order-detail (detalhe,
//    até 30 pedidos por chamada) — página "Pedido do cliente".
//  - Endpoints de estoque: POST /open-api/stock/stock-query (consulta) e
//    POST /open-api/stock/change-inventory/v2 (atualização, suporta
//    ADD/SUB/OVERWRITE) — página "Inventário e vendas".
//
// ⚠️ Pendências (fora de escopo até termos acesso a sandbox real — ver
// docs/shein-integracao.md):
//  - A listagem de produtos (POST /open-api/openapi-business-backend/
//    product/query) só devolve os identificadores gerados PELA PRÓPRIA Shein
//    (spuName/skcName/skuCode) — nem preço, nem o SKU do lojista (sellerSku),
//    nem o nome/título do produto. `fetchSheinListings` usa `skuCode` como
//    SKU interno (prefixo `SHEIN-`) e preço 0 — precisa confirmar contra
//    /goods/spu-info ou /openapi-business-backend/product/full-detail (não
//    abertos ainda) pra trazer preço e nome de verdade.
//  - `updateSheinStock` assume um único armazém (mesma simplificação do
//    TikTok Shop) — lojista com múltiplos armazéns precisa de
//    `warehouseCode` por SKU, não implementado.
//  - Nome do campo do número do pedido dentro do JSON decifrado do webhook
//    não está confirmado (a doc não mostra um payload de exemplo) —
//    `extractOrderNo` tenta os nomes mais prováveis.

import { createHmac, createDecipheriv, randomBytes, timingSafeEqual } from "crypto";

// Host de autorização ("empower") — o lojista loga e clica aqui. Diferente do
// host de chamada de API (ver API_HOST/API_HOST_TEST).
const EMPOWER_HOST_PROD = "https://openapi-sem.sheincorp.com";
const EMPOWER_HOST_TEST = "https://openapi-sem-test01.dotfashion.cn";

// Host de API — cenário "Plataforma tradicional / autocontrole" (POP), o caso
// de um lojista comum (NexusFi). Outros tipos de app (semi/totalmente
// gerenciado, SHEIN autocontrole) usam openapi.sheincorp.cn — fora de escopo.
const API_HOST_PROD = "https://openapi.sheincorp.com";
const API_HOST_TEST = "https://openapi-test01.sheincorp.cn";

const GET_BY_TOKEN_PATH = "/open-api/auth/get-by-token";
const ORDER_DETAIL_PATH = "/open-api/order/order-detail";
const PRODUCT_QUERY_PATH = "/open-api/openapi-business-backend/product/query";
const STOCK_QUERY_PATH = "/open-api/stock/stock-query";
const STOCK_UPDATE_PATH = "/open-api/stock/change-inventory/v2";

// AES-128-CBC fixo usado pela Shein tanto pra decifrar a secretKey (passo 4)
// quanto o corpo do webhook — chave = 16 primeiros bytes da appSecretKey, IV
// = 16 primeiros bytes de "space-station-default-iv" (literal público da
// doc, não é segredo).
const AES_IV_SEED = "space-station-default-iv";

export interface SheinIntegracao {
  id: string;
  accessToken?: string; // openKeyId
  refreshToken?: string; // secretKey já decifrada
  accountId?: string; // supplierId
}

export interface SheinListing {
  adId: string; // skuCode gerado pela Shein
  title: string;
  price: number;
  quantity: number;
  sku: string; // ver aviso "Pendências" no topo do arquivo
}

export interface SheinOrderItem {
  adId: string;
  sku: string;
  title: string;
  quantity: number;
  unitPrice: number;
}

/** Sem chave (nunca conectou) = mock. A chave da Shein não expira, então não há renovação — só existe "conectado" ou "mock". */
export function isMockToken(token?: string | null): boolean {
  return !token || token.startsWith("mock_");
}

/** Lê as credenciais do ambiente e diz se estão realmente configuradas. */
export function sheinCredentials() {
  const appId = process.env.SHEIN_APP_ID;
  const appSecret = process.env.SHEIN_APP_SECRET;
  const redirectUri = process.env.SHEIN_REDIRECT_URI;
  const testMode = process.env.SHEIN_ENV === "test";
  const configured =
    !!appId &&
    appId !== "SEU_APP_ID_AQUI" &&
    !!appSecret &&
    appSecret !== "SEU_APP_SECRET_AQUI" &&
    !!redirectUri;
  return { appId, appSecret, redirectUri, testMode, configured };
}

function apiHost(): string {
  return sheinCredentials().testMode ? API_HOST_TEST : API_HOST_PROD;
}

// ─── Assinatura ──────────────────────────────────────────────────────────────

function hmacHex(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

const RANDOM_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
function randomKey(len = 5): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += RANDOM_ALPHABET[bytes[i] % RANDOM_ALPHABET.length];
  return out;
}

/**
 * Assinatura genérica da Shein ("Regras de assinatura"):
 *   VALUE = keyId&timestamp&path
 *   KEY   = secret + randomKey
 *   sign  = randomKey + base64( hex( HMAC-SHA256(VALUE, KEY) ) )
 * Repara que o base64 é sobre a STRING hexadecimal (UTF-8), não sobre os
 * bytes crus do digest — confirmado nos exemplos de código oficiais.
 */
function sign(keyId: string, secret: string, path: string, timestamp: string): string {
  const rk = randomKey();
  const value = `${keyId}&${timestamp}&${path}`;
  const hex = hmacHex(value, secret + rk);
  const base64 = Buffer.from(hex, "utf8").toString("base64");
  return rk + base64;
}

/** Valida uma assinatura recebida (usado no webhook) contra keyId/secret/path/timestamp. */
function verifySignature(signature: string, keyId: string, secret: string, path: string, timestamp: string): boolean {
  if (!signature || signature.length <= 5) return false;
  const rk = signature.slice(0, 5);
  const expected = rk + Buffer.from(hmacHex(`${keyId}&${timestamp}&${path}`, secret + rk), "utf8").toString("base64");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(signature, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// ─── AES (decifra da secretKey e do corpo do webhook) ────────────────────────

function aesKeyFrom(secret: string): Buffer {
  return Buffer.from(secret, "utf8").subarray(0, 16);
}
function aesIv(): Buffer {
  return Buffer.from(AES_IV_SEED, "utf8").subarray(0, 16);
}

function decryptShein(base64Cipher: string, secret: string): string {
  const decipher = createDecipheriv("aes-128-cbc", aesKeyFrom(secret), aesIv());
  let out = decipher.update(base64Cipher, "base64", "utf8");
  out += decipher.final("utf8");
  return out;
}

// ─── Autorização ─────────────────────────────────────────────────────────────

/**
 * Monta o link de autorização ("empower") — o lojista loga e autoriza a loja
 * pro app. `redirectUrl` precisa ir em base64 (exigência da própria Shein).
 */
export function buildSheinAuthUrl(opts: { state: string }): string {
  const { appId, redirectUri, testMode } = sheinCredentials();
  const host = testMode ? EMPOWER_HOST_TEST : EMPOWER_HOST_PROD;
  const redirectB64 = Buffer.from(redirectUri || "", "utf8").toString("base64");
  const p = new URLSearchParams({ appid: appId || "", redirectUrl: redirectB64, state: opts.state });
  return `${host}/#/empower?${p.toString()}`;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json;charset=UTF-8", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || (data?.code !== undefined && String(data.code) !== "0")) {
    throw new Error(data?.msg || `Erro Shein (${res.status})`);
  }
  return data;
}

/**
 * Troca o tempToken (10 min de validade) por openKeyId+secretKey. Assina com
 * APP_ID+APP_SECRET — o desenvolvedor ainda não tem chave da loja nesse
 * passo (diferente de todas as outras chamadas, que usam openKeyId+secretKey).
 */
export async function exchangeSheinToken(tempToken: string): Promise<{
  openKeyId: string;
  secretKey: string;
  supplierId: string;
  supplierBusinessMode?: string;
}> {
  const { appId, appSecret } = sheinCredentials();
  const timestamp = String(Date.now());
  const signature = sign(appId || "", appSecret || "", GET_BY_TOKEN_PATH, timestamp);
  const data = await postJson(
    `${apiHost()}${GET_BY_TOKEN_PATH}`,
    { "x-lt-appid": appId || "", "x-lt-timestamp": timestamp, "x-lt-signature": signature },
    { tempToken }
  );
  const info = data.info || {};
  if (!info.openKeyId || !info.secretKey) throw new Error("Resposta da Shein sem openKeyId/secretKey");
  return {
    openKeyId: String(info.openKeyId),
    secretKey: decryptShein(String(info.secretKey), appSecret || ""),
    supplierId: String(info.supplierId ?? ""),
    supplierBusinessMode: info.supplierBusinessMode,
  };
}

/**
 * A chave da Shein não expira (ver comentário no topo do arquivo) — não há
 * refresh de verdade. Esta função só existe pra manter a mesma assinatura
 * `(db, integ) => Promise<...>` usada pelos outros canais nos pontos
 * compartilhados (webhook, sincronizar, estoqueSync); `db` fica sem uso.
 */
export async function getValidSheinToken(
  _db: any,
  integ: SheinIntegracao
): Promise<{ openKeyId: string; secretKey: string }> {
  if (isMockToken(integ.accessToken) || !integ.refreshToken) {
    throw new Error("Integração Shein em modo simulado ou sem secretKey — reconecte a loja.");
  }
  return { openKeyId: integ.accessToken!, secretKey: integ.refreshToken };
}

// ─── API de dados ────────────────────────────────────────────────────────────

async function callShein(openKeyId: string, secretKey: string, path: string, body: unknown): Promise<any> {
  const timestamp = String(Date.now());
  const signature = sign(openKeyId, secretKey, path, timestamp);
  return postJson(
    `${apiHost()}${path}`,
    { "x-lt-openKeyId": openKeyId, "x-lt-timestamp": timestamp, "x-lt-signature": signature },
    body
  );
}

/**
 * Lista os produtos publicados (paginado) e cruza com a consulta de estoque
 * pra trazer a quantidade disponível por SKU. Preço e título reais NÃO estão
 * disponíveis nestes dois endpoints — ver "Pendências" no topo do arquivo.
 */
export async function fetchSheinListings(openKeyId: string, secretKey: string): Promise<SheinListing[]> {
  const skuToSpu = new Map<string, string>();
  let pageNum = 1;
  let guard = 0;
  for (;;) {
    const data = await callShein(openKeyId, secretKey, PRODUCT_QUERY_PATH, { pageNum, pageSize: 50 });
    const rows: any[] = data?.info?.data || [];
    if (rows.length === 0) break;
    for (const r of rows) {
      const spuName = String(r.spuName || "");
      for (const skuCode of (r.skuCodeList || []) as string[]) skuToSpu.set(String(skuCode), spuName);
    }
    guard++;
    if (rows.length < 50 || guard >= 1000) break; // 1000 páginas × 50 = 50.000, o teto documentado
    pageNum++;
  }

  const allSkuCodes = [...skuToSpu.keys()];
  if (allSkuCodes.length === 0) return [];

  const estoquePorSku = new Map<string, number>();
  for (let i = 0; i < allSkuCodes.length; i += 100) {
    const lote = allSkuCodes.slice(i, i + 100);
    try {
      const data = await callShein(openKeyId, secretKey, STOCK_QUERY_PATH, {
        skuCodeList: lote,
        warehouseType: 2, // "Consulta de inventário virtual no modo de operação semiautônomo e de gestão própria" — cenário POP
      });
      const info: any[] = Array.isArray(data?.info) ? data.info : [];
      for (const entry of info) {
        for (const g of entry.goodsInventory || []) {
          for (const s of g.skuList || []) {
            estoquePorSku.set(String(s.skuCode), Number(s.totalUsableInventory) || 0);
          }
        }
      }
    } catch (err) {
      console.error("Erro ao consultar estoque Shein (lote):", err);
    }
  }

  return allSkuCodes.map((skuCode) => ({
    adId: skuCode,
    title: `Produto ${skuToSpu.get(skuCode) || skuCode}`,
    price: 0, // pendência — ver comentário no topo do arquivo
    quantity: estoquePorSku.get(skuCode) ?? 0,
    sku: `SHEIN-${skuCode}`.toUpperCase(),
  }));
}

/**
 * Atualiza o estoque (absoluto) de um SKU. Assume um único armazém — mesma
 * simplificação do TikTok Shop (ver `updateTiktokStock`); lojista com mais de
 * um armazém precisa de `warehouseCode` por SKU (fora de escopo aqui).
 */
export async function updateSheinStock(
  openKeyId: string,
  secretKey: string,
  adId: string,
  quantity: number
): Promise<void> {
  const data = await callShein(openKeyId, secretKey, STOCK_UPDATE_PATH, {
    updateSkuInventoryQuantityRequests: [
      {
        idempotencyKey: `nexusfi-${adId}-${Date.now()}`,
        skuCode: adId,
        invType: "VI",
        changeType: "OVERWRITE",
        changeQuantity: Math.max(0, Math.floor(quantity)),
        changeReason: "Sincronizacao NexusFi",
      },
    ],
  });
  const falhas: any[] = data?.info?.failedList || [];
  if (falhas.length > 0) {
    throw new Error(falhas[0]?.reason || `Falha ao atualizar estoque Shein do SKU ${adId}`);
  }
}

/**
 * Detalhe de um pedido, agregado por SKU do lojista. Cada entrada de
 * `orderGoodsInfoList` representa UMA unidade física (não tem campo de
 * quantidade — ver doc "Solicite detalhes do pedido": "Se um SKU tiver
 * várias peças, o goodsId de cada peça é único"), por isso agregamos por
 * `sellerSku` contando ocorrências.
 */
export async function fetchSheinOrder(
  openKeyId: string,
  secretKey: string,
  orderNo: string
): Promise<{ orderNo: string; orderStatus: number; items: SheinOrderItem[] }> {
  const data = await callShein(openKeyId, secretKey, ORDER_DETAIL_PATH, { orderNoList: [orderNo] });
  const order = (Array.isArray(data?.info) ? data.info : [])[0];
  const orderStatus = Number(order?.orderStatus) || 0;
  const linhas: any[] = order?.orderGoodsInfoList || [];

  const porSku = new Map<string, SheinOrderItem>();
  for (const l of linhas) {
    const skuCode = String(l.skuCode || "");
    const sellerSku = String(l.sellerSku || "").trim();
    const sku = (sellerSku || `SHEIN-${skuCode}`).toUpperCase();
    const cur = porSku.get(sku);
    const preco = Number(l.sellerCurrencyPrice) || 0;
    if (cur) {
      cur.quantity += 1;
    } else {
      porSku.set(sku, { adId: skuCode, sku, title: String(l.goodsTitle || l.goodsSn || sku), quantity: 1, unitPrice: preco });
    }
  }
  return { orderNo, orderStatus, items: [...porSku.values()] };
}

// ─── Webhook: verificação de assinatura + decifra ────────────────────────────

/**
 * Valida a assinatura do evento (webhook) da Shein. Diferente das chamadas de
 * API normais: assina com APP_ID+APP_SECRET (não openKeyId+secretKey do
 * lojista) — confirmado na doc "Instruções de acesso de retorno de chamada
 * de evento": "Assine com appid e appSercertKey, não com openkey+sercretKey
 * do fornecedor". `path` é o path do NOSSO endpoint de webhook (o mesmo
 * cadastrado no painel da Shein), não um path da API da Shein.
 */
export function verifySheinWebhook(opts: {
  signature?: string | null;
  timestamp?: string | null;
  path: string;
}): "valid" | "invalid" | "unconfigured" {
  const { appId, appSecret } = sheinCredentials();
  if (!appId || !appSecret) return "unconfigured";
  if (!opts.signature || !opts.timestamp) return "invalid";
  return verifySignature(opts.signature, appId, appSecret, opts.path, opts.timestamp) ? "valid" : "invalid";
}

/** Decifra o campo `eventData` (form-data) do webhook — mesma cifra AES da secretKey, chaveada pela APP_SECRET. */
export function decryptSheinEvent(eventDataBase64: string): string {
  const { appSecret } = sheinCredentials();
  return decryptShein(eventDataBase64, appSecret || "");
}

/**
 * Tenta achar o número do pedido no JSON decifrado do evento — a doc não
 * mostra um payload de exemplo, então cobrimos os nomes de campo mais
 * prováveis (mesmo padrão orderNo usado em order-list/order-detail).
 */
export function extractOrderNo(decrypted: unknown): string {
  if (!decrypted || typeof decrypted !== "object") return "";
  const d = decrypted as Record<string, unknown>;
  const candidato = d.orderNo ?? d.order_no ?? d.orderSn ?? d.orderNoList;
  if (Array.isArray(candidato)) return String(candidato[0] ?? "");
  return candidato ? String(candidato) : "";
}
