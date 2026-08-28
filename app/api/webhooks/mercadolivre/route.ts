export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  isMockToken,
  getValidAccessToken,
  fetchOrder,
  verifyWebhookSignature,
  type MlIntegracao,
} from "@/lib/mercadolivre";
import { registrarVendaAdmin } from "@/lib/vendas";
import { baixarEstoqueEPropagar } from "@/lib/estoqueSync";

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
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
        .where("platform", "==", "mercadolivre")
        .where("adId", "==", adId)
        .get();
      if (snapVinculo.empty) {
        return NextResponse.json({ error: "Vínculo não encontrado" }, { status: 404 });
      }

      const vinculoMock = snapVinculo.docs[0].data();
      const sku = vinculoMock.sku;
      const nova = await baixarEstoqueEPropagar(db, userId, sku, quantitySold, { platform: "mercadolivre", adId });
      if (nova === null) {
        return NextResponse.json({ error: "Produto do estoque não encontrado" }, { status: 404 });
      }

      // Registra a venda como entrada no Fluxo de Caixa (ver lib/vendas.ts).
      await registrarVendaAdmin(db, userId, {
        channel: "mercadolivre",
        sku,
        productName: vinculoMock.title || sku,
        adId,
        quantity: quantitySold || 1,
        unitPrice: Number(vinculoMock.price) || 0,
        orderId: `mock-ml-${Date.now()}`,
      });

      return NextResponse.json({
        success: true,
        message: `Venda simulada processada. SKU ${sku} atualizado para ${nova} un.`,
      });
    }

    // ── Notificação real do Mercado Livre ──────────────────────────────────
    // Formato: { resource, user_id, topic, application_id, attempts, sent, received }
    const topic: string = body.topic || body._type || "";
    const resource: string = body.resource || "";
    const mlUserId = String(body.user_id ?? "");

    // Validação da assinatura (x-signature). Só bloqueia se STRICT estiver ligado.
    const sig = verifyWebhookSignature({
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId: resource ? resource.split("/").pop() || null : null,
    });
    if (sig === "invalid" && process.env.MERCADOLIVRE_WEBHOOK_STRICT === "true") {
      console.warn("[ML webhook] assinatura inválida — rejeitado (STRICT)");
      return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
    }
    if (sig !== "valid") {
      console.warn(`[ML webhook] assinatura ${sig} (aceito — STRICT desligado)`);
    }

    // Só tratamos vendas. Outros tópicos: 200 pra o ML parar de reenviar.
    if (topic !== "orders_v2" && topic !== "orders") {
      return NextResponse.json({ received: true, ignored: topic });
    }

    // Acha a integração pela conta ML que recebeu a venda.
    const snapIntegracao = await db
      .collection("integracoes")
      .where("platform", "==", "mercadolivre")
      .where("accountId", "==", mlUserId)
      .get();
    if (snapIntegracao.empty) {
      // 200: não é erro do ML, só não temos essa conta conectada aqui.
      return NextResponse.json({ received: true, note: "conta não conectada" });
    }

    const integracao = {
      id: snapIntegracao.docs[0].id,
      ...snapIntegracao.docs[0].data(),
    } as MlIntegracao & { userId: string };

    if (isMockToken(integracao.accessToken)) {
      return NextResponse.json({ received: true, note: "integração mock" });
    }

    const token = await getValidAccessToken(db, integracao);
    const order = await fetchOrder(token, resource);
    const items = order.order_items || [];
    const orderId = String(order.id ?? resource.split("/").pop() ?? "");
    const occurredAt = order.date_created ? Date.parse(order.date_created) || Date.now() : Date.now();

    for (const oi of items) {
      const adId = String(oi.item?.id || "");
      const quantitySold = oi.quantity || 1;
      if (!adId) continue;

      // Prefere o seller_sku do próprio pedido; senão, resolve pelo vínculo.
      let sku: string = (oi.item?.seller_sku || "").trim().toUpperCase();
      let titulo: string = oi.item?.title || "";
      if (!sku || !titulo) {
        const snapVinculo = await db
          .collection("vinculos")
          .where("userId", "==", integracao.userId)
          .where("platform", "==", "mercadolivre")
          .where("adId", "==", adId)
          .get();
        if (!snapVinculo.empty) {
          const v = snapVinculo.docs[0].data();
          if (!sku) sku = v.sku;
          if (!titulo) titulo = v.title || "";
        }
      }
      if (!sku) continue;

      await baixarEstoqueEPropagar(db, integracao.userId, sku, quantitySold, { platform: "mercadolivre", adId });

      // Registra a venda como entrada no Fluxo de Caixa (dedupe por orderId).
      await registrarVendaAdmin(db, integracao.userId, {
        channel: "mercadolivre",
        sku,
        productName: titulo || sku,
        adId,
        quantity: quantitySold,
        unitPrice: Number(oi.unit_price) || 0,
        orderId: items.length > 1 ? `${orderId}:${adId}` : orderId,
        occurredAt,
      });
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Erro no webhook do Mercado Livre:", error);
    // 200 mesmo em erro interno evita retry infinito do ML; o log fica pra depuração.
    return NextResponse.json({ received: true, error: error?.message }, { status: 200 });
  }
}
