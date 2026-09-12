export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Um evento pode disparar refresh de token + busca de pedido + baixa/
// propagação em vários canais. 10s (default) é pouco.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { baixarEstoqueEPropagar } from "@/lib/estoqueSync";
import { registrarVendaAdmin } from "@/lib/vendas";
import {
  isMockToken,
  getValidTiktokToken,
  fetchTiktokOrder,
  verifyTiktokPush,
  type TiktokIntegracao,
} from "@/lib/tiktokshop";

// Status de pedido em que faz sentido baixar o estoque (pago/em preparação).
// Fora disso (UNPAID, CANCELLED, ...) ignora, senão baixaria estoque de
// pedido que ainda pode cair.
const STATUS_BAIXA = new Set([
  "AWAITING_SHIPMENT",
  "AWAITING_COLLECTION",
  "IN_TRANSIT",
  "DELIVERED",
  "COMPLETED",
]);

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
        .where("platform", "==", "tiktokshop")
        .where("adId", "==", adId)
        .get();
      if (snapVinculo.empty) {
        return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
      }

      const vinculo = snapVinculo.docs[0].data();
      const sku = vinculo.sku;
      const nova = await baixarEstoqueEPropagar(db, userId, sku, quantitySold, { platform: "tiktokshop", adId });
      if (nova === null) {
        return NextResponse.json({ error: "Produto do estoque não encontrado" }, { status: 404 });
      }

      await registrarVendaAdmin(db, userId, {
        channel: "tiktokshop",
        sku,
        productName: vinculo.title || sku,
        adId,
        quantity: quantitySold || 1,
        unitPrice: Number(vinculo.price) || 0,
        orderId: `mock-tts-${Date.now()}`,
      });

      return NextResponse.json({
        success: true,
        message: `Venda simulada processada. SKU ${sku} atualizado para ${nova} un.`,
      });
    }

    // ── Evento real da TikTok Shop ──────────────────────────────────────────
    // Assinatura: verifyTiktokPush — HMAC(app_key + corpo bruto, app_secret),
    // hex minúsculo, mandada no header Authorization (confirmado na doc
    // oficial "TikTok Shop webhooks → Overview", não é x-tts-signature).
    const sig = verifyTiktokPush({
      signature: request.headers.get("authorization"),
      rawBody: raw,
    });
    if (sig === "invalid" && process.env.TIKTOKSHOP_WEBHOOK_STRICT === "true") {
      console.warn("[TikTok Shop push] assinatura inválida — rejeitado (STRICT)");
      return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
    }
    if (sig !== "valid") {
      console.warn(`[TikTok Shop push] assinatura ${sig} (aceito — STRICT desligado)`);
    }

    // Evento ORDER_STATUS_CHANGE = atualização de status de pedido. Outros:
    // 200 e ignora.
    const eventType: string = String(body?.type || body?.event_type || "");
    const orderId: string = String(body?.data?.order_id || body?.data?.orderId || "");
    if (eventType !== "ORDER_STATUS_CHANGE" || !orderId) {
      return NextResponse.json({ received: true, ignored: eventType || "unknown" });
    }

    const shopId = String(body?.shop_id ?? body?.data?.shop_id ?? "");
    const status = String(body?.data?.order_status || body?.data?.status || "").toUpperCase();
    if (status && !STATUS_BAIXA.has(status)) {
      return NextResponse.json({ received: true, note: `status ${status} ignorado` });
    }

    const snapInteg = await db
      .collection("integracoes")
      .where("platform", "==", "tiktokshop")
      .where("accountId", "==", shopId)
      .get();
    if (snapInteg.empty) {
      return NextResponse.json({ received: true, note: "loja não conectada" });
    }

    const integ = {
      id: snapInteg.docs[0].id,
      ...snapInteg.docs[0].data(),
    } as TiktokIntegracao & { userId: string };

    if (isMockToken(integ.accessToken)) {
      return NextResponse.json({ received: true, note: "integração mock" });
    }

    const token = await getValidTiktokToken(db, integ);
    const order = await fetchTiktokOrder(token, integ.accountId || "", integ.shopCipher || "", orderId);

    for (const it of order.items) {
      const adId = it.adId;
      if (!adId) continue;

      let sku = it.sku;
      let titulo = it.title;
      if (!sku || !titulo) {
        const sv = await db
          .collection("vinculos")
          .where("userId", "==", integ.userId)
          .where("platform", "==", "tiktokshop")
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
      // orderId+canal e devolve null quando o pedido já foi lançado (a TikTok
      // Shop reenvia o evento a cada transição de status). Só baixamos o
      // estoque quando o pedido é inédito, senão baixaria várias vezes.
      const vendaId = await registrarVendaAdmin(db, integ.userId, {
        channel: "tiktokshop",
        sku,
        productName: titulo || sku,
        adId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        orderId: order.items.length > 1 ? `${orderId}:${adId}` : orderId,
      });

      if (vendaId) {
        await baixarEstoqueEPropagar(db, integ.userId, sku, it.quantity, { platform: "tiktokshop", adId });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Erro no webhook da TikTok Shop:", error);
    // 200 mesmo em erro interno evita retry infinito; o log fica pra depuração.
    return NextResponse.json({ received: true, error: error?.message }, { status: 200 });
  }
}
