export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Um push pode disparar refresh de token + get_order_detail + get_escrow_detail
// + baixa/propagação em vários canais. 10s (default) é pouco.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { baixarEstoqueEPropagar } from "@/lib/estoqueSync";
import { registrarVendaAdmin } from "@/lib/vendas";
import {
  isMockToken,
  getValidShopeeToken,
  fetchShopeeOrder,
  fetchShopeeEscrowDetail,
  verifyShopeePush,
  type ShopeeIntegracao,
} from "@/lib/shopee";

// Status de pedido em que faz sentido baixar o estoque (pago/em preparação).
// Fora disso (UNPAID, CANCELLED, ...) ignora, senão baixaria estoque de pedido
// que ainda pode cair.
const STATUS_BAIXA = new Set([
  "READY_TO_SHIP",
  "PROCESSED",
  "SHIPPED",
  "TO_CONFIRM_RECEIVE",
  "COMPLETED",
]);

/**
 * Push URL pública desta rota, pra validar a assinatura da Shopee.
 * `SHOPEE_PUSH_URL` (recomendado) → headers de forward → `request.url`.
 */
function resolvePushUrl(request: Request): string {
  const envUrl = process.env.SHOPEE_PUSH_URL?.trim();
  if (envUrl) return envUrl;
  const u = new URL(request.url);
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    u.protocol.replace(":", "");
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    u.host;
  return `${proto}://${host}${u.pathname}`;
}

export async function POST(request: Request) {
  const raw = await request.text();
  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Corpo inválido" }, { status: 400 });
  }

  try {
    const db = await getAdminDb();

    // ── Simulação disparada pelo painel de teste ────────────────────────────
    if (body.mock === true) {
      const { adId, quantitySold, userId } = body;

      const snapVinculo = await db
        .collection("vinculos")
        .where("userId", "==", userId)
        .where("platform", "==", "shopee")
        .where("adId", "==", adId)
        .get();
      if (snapVinculo.empty) {
        return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
      }

      const vinculo = snapVinculo.docs[0].data();
      const sku = vinculo.sku;
      const nova = await baixarEstoqueEPropagar(db, userId, sku, quantitySold, { platform: "shopee", adId });
      if (nova === null) {
        return NextResponse.json({ error: "Produto do estoque não encontrado" }, { status: 404 });
      }

      await registrarVendaAdmin(db, userId, {
        channel: "shopee",
        sku,
        productName: vinculo.title || sku,
        adId,
        quantity: quantitySold || 1,
        unitPrice: Number(vinculo.price) || 0,
        orderId: `mock-shp-${Date.now()}`,
      });

      return NextResponse.json({
        success: true,
        message: `Venda simulada processada. SKU ${sku} atualizado para ${nova} un.`,
      });
    }

    // ── Push real da Shopee ────────────────────────────────────────────────
    // Assinatura: header Authorization = HMAC-SHA256(`${url}|${body}`, partner_key).
    // A Shopee assina com a Push URL EXATA cadastrada no console. Atrás do
    // proxy da Vercel, `request.url` pode vir como http:// ou com host interno
    // e a assinatura nunca bateria. Preferimos a env fixa; senão reconstruímos
    // a partir dos headers de forward.
    const pushUrl = resolvePushUrl(request);
    const sig = verifyShopeePush({
      authorization: request.headers.get("authorization"),
      url: pushUrl,
      rawBody: raw,
    });
    if (sig === "invalid" && process.env.SHOPEE_PUSH_STRICT === "true") {
      console.warn("[Shopee push] assinatura inválida — rejeitado (STRICT)");
      return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
    }
    if (sig !== "valid") {
      console.warn(`[Shopee push] assinatura ${sig} (aceito — STRICT desligado)`);
    }

    // code 3 = atualização de status de pedido. Outros códigos: 200 e ignora.
    const ordersn: string = body?.data?.ordersn || body?.data?.order_sn || "";
    if (body.code !== 3 || !ordersn) {
      return NextResponse.json({ received: true, ignored: body.code });
    }

    const shopId = String(body.shop_id ?? "");
    const status = String(body?.data?.status || "").toUpperCase();
    if (status && !STATUS_BAIXA.has(status)) {
      return NextResponse.json({ received: true, note: `status ${status} ignorado` });
    }

    const snapInteg = await db
      .collection("integracoes")
      .where("platform", "==", "shopee")
      .where("accountId", "==", shopId)
      .get();
    if (snapInteg.empty) {
      return NextResponse.json({ received: true, note: "loja não conectada" });
    }

    const integ = {
      id: snapInteg.docs[0].id,
      ...snapInteg.docs[0].data(),
    } as ShopeeIntegracao & { userId: string };

    if (isMockToken(integ.accessToken)) {
      return NextResponse.json({ received: true, note: "integração mock" });
    }

    const token = await getValidShopeeToken(db, integ);
    const order = await fetchShopeeOrder(token, integ.accountId || "", ordersn);

    // Detalhe financeiro do pedido: taxas (comissão/serviço/frete) da Shopee.
    // Best-effort — se falhar, a venda entra sem a saída de taxas.
    let taxasPedido = 0;
    try {
      const esc = await fetchShopeeEscrowDetail(token, integ.accountId || "", ordersn);
      if (esc) taxasPedido = esc.fees;
    } catch (e) {
      console.warn("[Shopee push] sem detalhe de escrow:", (e as Error)?.message);
    }

    let primeiroItem = true;
    for (const it of order.items) {
      const adId = it.adId;
      if (!adId) continue;

      let sku = it.sku;
      let titulo = it.title;
      if (!sku || !titulo) {
        const sv = await db
          .collection("vinculos")
          .where("userId", "==", integ.userId)
          .where("platform", "==", "shopee")
          .where("adId", "==", adId)
          .get();
        if (!sv.empty) {
          const v = sv.docs[0].data();
          if (!sku) sku = String(v.sku || "").toUpperCase();
          if (!titulo) titulo = v.title || "";
        }
      }
      if (!sku) continue;

      // Registra a venda PRIMEIRO. `registrarVendaAdmin` deduplica por
      // orderId+canal e devolve null quando o pedido já foi lançado (a Shopee
      // reenvia um push code 3 a CADA transição de status — READY_TO_SHIP,
      // SHIPPED, COMPLETED... — e todos caem em STATUS_BAIXA). Só baixamos o
      // estoque quando o pedido é inédito, senão o mesmo pedido baixaria o
      // estoque 4-5 vezes. null também cobre falha transitória: aí nada foi
      // gravado e o próximo push reprocessa.
      const vendaId = await registrarVendaAdmin(db, integ.userId, {
        channel: "shopee",
        sku,
        productName: titulo || sku,
        adId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        orderId: order.items.length > 1 ? `${ordersn}:${adId}` : ordersn,
        // Taxas do pedido inteiro vão no 1º item (evita rateio frágil).
        feeAmount: primeiroItem ? taxasPedido : 0,
      });
      primeiroItem = false;

      if (vendaId) {
        await baixarEstoqueEPropagar(db, integ.userId, sku, it.quantity, { platform: "shopee", adId });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Erro no webhook da Shopee:", error);
    // 200 mesmo em erro interno evita retry infinito; o log fica pra depuração.
    return NextResponse.json({ received: true, error: error?.message }, { status: 200 });
  }
}
