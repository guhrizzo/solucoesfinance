export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// refresh de token + fetchOrder + baixa/propagação multi-canal por item.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  isMockToken,
  getValidAccessToken,
  fetchOrder,
  fetchItem,
  verifyWebhookSignature,
  type MlIntegracao,
} from "@/lib/mercadolivre";
import { registrarVendaAdmin } from "@/lib/vendas";
import { baixarEstoqueEPropagar, definirEstoqueEPropagar } from "@/lib/estoqueSync";

/**
 * Tópico `items`: o vendedor mexeu no anúncio (estoque/preço) direto no ML.
 * Puxa o valor novo pro estoque central e propaga pros outros canais.
 * `resource` = "/items/MLB123".
 */
async function tratarNotificacaoItem(
  db: any,
  token: string,
  integracao: MlIntegracao & { userId: string },
  resource: string
) {
  const adId = (resource.split("/").pop() || "").trim();
  if (!adId) return NextResponse.json({ received: true, note: "resource sem id" });

  const snapVinculo = await db
    .collection("vinculos")
    .where("userId", "==", integracao.userId)
    .where("platform", "==", "mercadolivre")
    .where("adId", "==", adId)
    .get();
  if (snapVinculo.empty) {
    return NextResponse.json({ received: true, note: "anúncio não vinculado" });
  }
  const vinculoDoc = snapVinculo.docs[0];
  const v = vinculoDoc.data();

  const item = await fetchItem(token, adId);
  if (item === null) {
    // Anúncio apagado no ML → remove o vínculo órfão (reconcile).
    await db.collection("vinculos").doc(vinculoDoc.id).delete();
    console.log(`[ML webhook/items] anúncio ${adId} não existe mais — vínculo removido`);
    return NextResponse.json({ received: true, note: "vínculo removido (anúncio inexistente)" });
  }
  if (item.hasVariations) {
    console.log(`[ML webhook/items] anúncio ${adId} tem variações — push de estoque não suportado`);
    return NextResponse.json({ received: true, note: "anúncio com variações" });
  }

  // Espelha o anúncio no vínculo mesmo se o estoque central não mexer.
  await db.collection("vinculos").doc(vinculoDoc.id).update({
    quantity: item.quantity,
    price: item.price,
    title: item.title,
    updatedAt: Date.now(),
  });

  const r = await definirEstoqueEPropagar(
    db,
    v.userId,
    v.sku,
    item.quantity,
    { platform: "mercadolivre", adId },
    { price: item.price }
  );
  if (r === null) {
    return NextResponse.json({ received: true, note: "SKU sem item no estoque central" });
  }
  if (r.mudou) {
    console.log(`[ML webhook/items] ${adId} (SKU ${v.sku}) → estoque central ${r.quantidade} un`);
  }
  return NextResponse.json({ received: true, atualizado: r.mudou, quantidade: r.quantidade });
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

    // Log de TODA notificação que chega — pra ver no painel da Vercel se o ML
    // está mesmo mandando `items` quando você edita o anúncio.
    console.log(
      `[ML webhook] recebido | topic=${topic || "?"} | resource=${resource || "-"} | user_id=${mlUserId || "-"} | attempts=${body.attempts ?? "-"}`
    );

    // Validação da assinatura (x-signature). Só bloqueia se STRICT estiver ligado.
    const xSignature = request.headers.get("x-signature");
    const xRequestId = request.headers.get("x-request-id");
    const sig = verifyWebhookSignature({
      xSignature,
      xRequestId,
      dataId: resource ? resource.split("/").pop() || null : null,
    });
    if (sig === "invalid" && process.env.MERCADOLIVRE_WEBHOOK_STRICT === "true") {
      console.warn("[ML webhook] assinatura inválida — rejeitado (STRICT)");
      return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
    }
    if (sig !== "valid") {
      // Log de diagnóstico: com STRICT desligado ainda aceitamos, mas isso
      // aqui dá pra descobrir QUAL secret o ML usa (rode uma venda de teste,
      // veja se o ML manda `x-signature`, depois tente com o client_secret em
      // MERCADOLIVRE_WEBHOOK_SECRET e confira se vira `valid`).
      console.warn(
        `[ML webhook] assinatura ${sig} (aceito — STRICT desligado) | ` +
          `x-signature=${xSignature ? xSignature.slice(0, 80) : "AUSENTE"} | ` +
          `x-request-id=${xRequestId || "-"} | ` +
          `resource=${resource || "-"} | secretConfigurado=${!!process.env.MERCADOLIVRE_WEBHOOK_SECRET}`
      );
    }

    // Tratamos vendas (`orders_v2`) e edição de anúncio (`items`).
    // Outros tópicos: 200 pra o ML parar de reenviar.
    if (topic !== "orders_v2" && topic !== "orders" && topic !== "items") {
      return NextResponse.json({ received: true, ignored: topic });
    }

    // Acha a integração pela conta ML que originou a notificação.
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

    if (topic === "items") {
      return await tratarNotificacaoItem(db, token, integracao, resource);
    }

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

      // Registra a venda PRIMEIRO. `registrarVendaAdmin` deduplica por
      // orderId+canal e devolve null quando o pedido já foi lançado (o ML
      // reenvia a mesma notificação `orders_v2` várias vezes). Só baixamos o
      // estoque quando o pedido é inédito — senão cada reenvio subtrai de novo.
      // null também cobre falha transitória: nada foi gravado e o próximo
      // reenvio reprocessa.
      const vendaId = await registrarVendaAdmin(db, integracao.userId, {
        channel: "mercadolivre",
        sku,
        productName: titulo || sku,
        adId,
        quantity: quantitySold,
        unitPrice: Number(oi.unit_price) || 0,
        orderId: items.length > 1 ? `${orderId}:${adId}` : orderId,
        occurredAt,
      });

      if (vendaId) {
        await baixarEstoqueEPropagar(db, integracao.userId, sku, quantitySold, { platform: "mercadolivre", adId });
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Erro no webhook do Mercado Livre:", error);
    // 200 mesmo em erro interno evita retry infinito do ML; o log fica pra depuração.
    return NextResponse.json({ received: true, error: error?.message }, { status: 200 });
  }
}
