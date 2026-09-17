export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Um evento pode disparar busca de pedido + baixa/propagação em vários canais.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { baixarEstoqueEPropagar } from "@/lib/estoqueSync";
import { registrarVendaAdmin } from "@/lib/vendas";
import {
  isMockToken,
  getValidSheinToken,
  fetchSheinOrder,
  verifySheinWebhook,
  decryptSheinEvent,
  extractOrderNo,
  type SheinIntegracao,
} from "@/lib/shein";

// Status do pedido (order-detail) em que faz sentido baixar o estoque —
// pago/em preparação/enviado. Fora disso (1 Pendente, 6 Reembolsado,
// 8 Danificado, 9 Recusado) ignora, senão baixaria estoque de pedido que
// ainda pode cair.
const STATUS_BAIXA = new Set([2, 3, 4, 5, 7]);

/**
 * Push URL pública desta rota, pra validar a assinatura da Shein — mesmo
 * motivo do `SHOPEE_PUSH_URL` (atrás do proxy da Vercel, `request.url` pode
 * não bater com a URL que a Shein usou pra assinar o evento).
 */
function resolvePushPath(request: Request): string {
  const envUrl = process.env.SHEIN_PUSH_URL?.trim();
  if (envUrl) {
    try {
      return new URL(envUrl).pathname;
    } catch {
      /* cai pro request.url abaixo */
    }
  }
  return new URL(request.url).pathname;
}

export async function POST(request: Request) {
  try {
    const db = await getAdminDb();
    const form = await request.formData().catch(() => null);

    // ── Simulação disparada pelo painel de teste ────────────────────────────
    const mockField = form?.get("mock");
    if (form && mockField === "true") {
      const adId = String(form.get("adId") || "");
      const quantitySold = Number(form.get("quantitySold") || 1);
      const userId = String(form.get("userId") || "");

      const snapVinculo = await db
        .collection("vinculos")
        .where("userId", "==", userId)
        .where("platform", "==", "shein")
        .where("adId", "==", adId)
        .get();
      if (snapVinculo.empty) {
        return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
      }

      const vinculo = snapVinculo.docs[0].data();
      const sku = vinculo.sku;
      const nova = await baixarEstoqueEPropagar(db, userId, sku, quantitySold, { platform: "shein", adId });
      if (nova === null) {
        return NextResponse.json({ error: "Produto do estoque não encontrado" }, { status: 404 });
      }

      await registrarVendaAdmin(db, userId, {
        channel: "shein",
        sku,
        productName: vinculo.title || sku,
        adId,
        quantity: quantitySold || 1,
        unitPrice: Number(vinculo.price) || 0,
        orderId: `mock-shein-${Date.now()}`,
      });

      return NextResponse.json({
        success: true,
        message: `Venda simulada processada. SKU ${sku} atualizado para ${nova} un.`,
      });
    }

    // ── Evento real da Shein ─────────────────────────────────────────────────
    if (!form) {
      return NextResponse.json({ error: "Corpo inválido (esperado multipart/form-data)" }, { status: 400 });
    }

    const openKeyId = request.headers.get("x-lt-openkeyid") || "";
    const timestamp = request.headers.get("x-lt-timestamp");
    const signature = request.headers.get("x-lt-signature");
    const eventCode = request.headers.get("x-lt-eventcode") || "";

    const sig = verifySheinWebhook({ signature, timestamp, path: resolvePushPath(request) });
    if (sig === "invalid" && process.env.SHEIN_WEBHOOK_STRICT === "true") {
      console.warn("[Shein push] assinatura inválida — rejeitado (STRICT)");
      return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
    }
    if (sig !== "valid") {
      console.warn(`[Shein push] assinatura ${sig} (aceito — STRICT desligado)`);
    }

    const eventDataRaw = form.get("eventData");
    if (typeof eventDataRaw !== "string" || !eventDataRaw) {
      return NextResponse.json({ received: true, ignored: "sem eventData" });
    }

    let decrypted: unknown;
    try {
      decrypted = JSON.parse(decryptSheinEvent(eventDataRaw));
    } catch (err) {
      console.error("[Shein push] falha ao decifrar/parsear eventData:", err);
      return NextResponse.json({ received: true, error: "falha ao decifrar eventData" });
    }

    const orderNo = extractOrderNo(decrypted);
    if (!orderNo) {
      return NextResponse.json({ received: true, ignored: eventCode || "sem orderNo" });
    }

    const snapInteg = await db
      .collection("integracoes")
      .where("platform", "==", "shein")
      .where("accessToken", "==", openKeyId)
      .get();
    if (snapInteg.empty) {
      return NextResponse.json({ received: true, note: "loja não conectada" });
    }

    const integ = { id: snapInteg.docs[0].id, ...snapInteg.docs[0].data() } as SheinIntegracao & { userId: string };
    if (isMockToken(integ.accessToken)) {
      return NextResponse.json({ received: true, note: "integração mock" });
    }

    const { openKeyId: keyId, secretKey } = await getValidSheinToken(db, integ);
    const order = await fetchSheinOrder(keyId, secretKey, orderNo);

    if (order.orderStatus && !STATUS_BAIXA.has(order.orderStatus)) {
      return NextResponse.json({ received: true, note: `status ${order.orderStatus} ignorado` });
    }

    for (const it of order.items) {
      if (!it.sku) continue;

      // Registra a venda PRIMEIRO. `registrarVendaAdmin` deduplica por
      // orderId+canal e devolve null quando o pedido já foi lançado (a Shein
      // pode reenviar o evento a cada transição de status). Só baixamos o
      // estoque quando o pedido é inédito, senão baixaria várias vezes.
      const vendaId = await registrarVendaAdmin(db, integ.userId, {
        channel: "shein",
        sku: it.sku,
        productName: it.title || it.sku,
        adId: it.adId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        orderId: order.items.length > 1 ? `${orderNo}:${it.adId}` : orderNo,
      });

      if (vendaId) {
        await baixarEstoqueEPropagar(db, integ.userId, it.sku, it.quantity, { platform: "shein", adId: it.adId });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Erro no webhook da Shein:", error);
    // 200 mesmo em erro interno evita retry storm; o log fica pra depuração.
    return NextResponse.json({ received: true, error: error?.message }, { status: 200 });
  }
}
