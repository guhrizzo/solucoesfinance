export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reconferência na API do MP + transação no Firestore.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { mercadopagoConfigured, verifyWebhookSignature } from "@/lib/mercadopago";
import { applyAuthorizedPayment, syncPreapproval } from "@/lib/billingApplyMp";

// POST /api/webhooks/mercadopago
//
// Configure no painel da aplicação do Mercado Pago (Webhooks) com os tópicos
//   - subscription_preapproval          (estado da assinatura)
//   - subscription_authorized_payment   (cobrança de cada ciclo)
// e cadastre o segredo em MERCADOPAGO_WEBHOOK_SECRET.
//
// O corpo NÃO é confiado: o `data.id` só serve pra buscar o recurso na API do
// MP (com o token do vendedor), e é a resposta dela que mexe no acesso.
//
// Resposta: 200 = processado ou ignorado de propósito; 5xx = falha transitória
// (Firestore, rede) e o MP reenvia (a cada ~15 min).

export async function POST(request: Request) {
  if (!mercadopagoConfigured()) {
    console.error("[MP webhook] MERCADOPAGO_ACCESS_TOKEN ausente");
    return NextResponse.json({ error: "não configurado" }, { status: 503 });
  }

  const url = new URL(request.url);
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    /* alguns avisos (IPN) vêm só com query string */
  }

  const topic = String(body?.type || url.searchParams.get("type") || url.searchParams.get("topic") || "");
  const dataId = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");

  // Assinatura: só barra quando MERCADOPAGO_WEBHOOK_STRICT=true. Fora isso apenas
  // avisa no log (o corpo não é confiado de qualquer forma — ver topo).
  if ((process.env.MERCADOPAGO_WEBHOOK_SECRET || "").trim()) {
    const sig = verifyWebhookSignature({
      signatureHeader: request.headers.get("x-signature"),
      requestId: request.headers.get("x-request-id"),
      dataId: url.searchParams.get("data.id") || dataId,
    });
    if (!sig.ok) {
      console.warn(`[MP webhook] assinatura inválida (${sig.reason}) topic=${topic} id=${dataId}`);
      if (process.env.MERCADOPAGO_WEBHOOK_STRICT === "true") {
        return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
      }
    }
  }

  if (!dataId) return NextResponse.json({ received: true, note: "sem data.id" });

  try {
    const db = await getAdminDb();

    if (topic === "subscription_authorized_payment") {
      const r = await applyAuthorizedPayment(db, dataId);
      if (r.applied) {
        console.log(`[MP webhook] assinatura ${r.ownerUid} estendida (plano ${r.planId})`);
      } else {
        console.warn(`[MP webhook] cobrança ${dataId} não aplicada: ${r.reason}`);
      }
      // "não paga" / "já processado" → 200 (reenviar não muda nada; a próxima
      // notificação da mesma cobrança, agora paga, chega sozinha).
      return NextResponse.json({ received: true, ...(r.applied ? {} : { note: r.reason }) });
    }

    if (topic === "subscription_preapproval") {
      const r = await syncPreapproval(db, dataId);
      if (!r) console.warn(`[MP webhook] assinatura ${dataId} com external_reference desconhecido`);
      return NextResponse.json({ received: true });
    }

    // Outros tópicos (payment, etc.) não interessam aqui.
    return NextResponse.json({ received: true, note: `tópico ignorado: ${topic || "?"}` });
  } catch (err: any) {
    console.error("[MP webhook] erro:", err);
    return NextResponse.json({ error: err?.message || "erro interno" }, { status: 500 });
  }
}
