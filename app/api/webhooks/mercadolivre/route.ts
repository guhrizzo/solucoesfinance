export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  isMockToken,
  getValidAccessToken,
  fetchOrder,
  updateListingQuantity,
  verifyWebhookSignature,
  type MlIntegracao,
} from "@/lib/mercadolivre";

// Propaga a nova quantidade do SKU para todos os outros canais vinculados
// (atualiza o registro no Firestore e, se for integração real, chama a API).
async function propagarEstoque(
  db: any,
  userId: string,
  sku: string,
  novaQuantidade: number,
  origem: { platform: string; adId: string }
) {
  const snapVinculos = await db
    .collection("vinculos")
    .where("userId", "==", userId)
    .where("sku", "==", sku)
    .get();

  for (const dv of snapVinculos.docs) {
    const vinculo = dv.data();

    // Espelha a quantidade em todo vínculo do SKU (inclusive o de origem).
    await db.collection("vinculos").doc(dv.id).update({ quantity: novaQuantidade, updatedAt: Date.now() });

    // Não precisa empurrar de volta para o anúncio que originou a venda.
    if (vinculo.platform === origem.platform && vinculo.adId === origem.adId) continue;

    if (vinculo.platform !== "mercadolivre" || !vinculo.connectionId) continue;

    try {
      const intSnap = await db.collection("integracoes").doc(vinculo.connectionId).get();
      if (!intSnap.exists) continue;
      const integracao = { id: intSnap.id, ...intSnap.data() } as MlIntegracao;
      if (isMockToken(integracao.accessToken)) continue;

      const token = await getValidAccessToken(db, integracao);
      await updateListingQuantity(token, vinculo.adId, novaQuantidade);
      console.log(`[ML] estoque do anúncio ${vinculo.adId} atualizado para ${novaQuantidade}`);
    } catch (err) {
      console.error(`[ML] falha ao propagar estoque para ${vinculo.adId}:`, err);
    }
  }
}

// Baixa `quantitySold` do estoque central do SKU e propaga. Retorna a nova qtd.
async function baixarEstoque(
  db: any,
  userId: string,
  sku: string,
  quantitySold: number,
  origem: { platform: string; adId: string }
): Promise<number | null> {
  const snapEstoque = await db
    .collection("estoque")
    .where("userId", "==", userId)
    .where("sku", "==", sku)
    .get();
  if (snapEstoque.empty) return null;

  const estoqueDoc = snapEstoque.docs[0];
  const atual = estoqueDoc.data().quantity || 0;
  const nova = Math.max(0, atual - quantitySold);

  await db.collection("estoque").doc(estoqueDoc.id).update({ quantity: nova, updatedAt: Date.now() });
  await propagarEstoque(db, userId, sku, nova, origem);
  return nova;
}

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

      const sku = snapVinculo.docs[0].data().sku;
      const nova = await baixarEstoque(db, userId, sku, quantitySold, { platform: "mercadolivre", adId });
      if (nova === null) {
        return NextResponse.json({ error: "Produto do estoque não encontrado" }, { status: 404 });
      }

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

    for (const oi of items) {
      const adId = String(oi.item?.id || "");
      const quantitySold = oi.quantity || 1;
      if (!adId) continue;

      // Prefere o seller_sku do próprio pedido; senão, resolve pelo vínculo.
      let sku: string = (oi.item?.seller_sku || "").trim().toUpperCase();
      if (!sku) {
        const snapVinculo = await db
          .collection("vinculos")
          .where("userId", "==", integracao.userId)
          .where("platform", "==", "mercadolivre")
          .where("adId", "==", adId)
          .get();
        if (snapVinculo.empty) continue;
        sku = snapVinculo.docs[0].data().sku;
      }

      await baixarEstoque(db, integracao.userId, sku, quantitySold, { platform: "mercadolivre", adId });
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Erro no webhook do Mercado Livre:", error);
    // 200 mesmo em erro interno evita retry infinito do ML; o log fica pra depuração.
    return NextResponse.json({ received: true, error: error?.message }, { status: 200 });
  }
}
