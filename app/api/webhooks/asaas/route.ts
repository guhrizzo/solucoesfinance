export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reconferência na API do Asaas + transação no Firestore.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { withWebhookLog } from "@/lib/webhookLog";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { asaasConfigured, verifyWebhookToken } from "@/lib/asaas";
import { applyAsaasPayment, syncAsaasSubscription } from "@/lib/billingApplyAsaas";

// POST /api/webhooks/asaas
//
// Cadastre no painel do Asaas (Integrações → Webhooks) a URL
//   ${APP_URL}/api/webhooks/asaas
// com os eventos de COBRANÇA (PAYMENT_CONFIRMED, PAYMENT_RECEIVED) e de
// ASSINATURA (SUBSCRIPTION_DELETED, SUBSCRIPTION_INACTIVATED), e defina um
// "token de autenticação" — o mesmo valor vai em ASAAS_WEBHOOK_TOKEN.
//
// O corpo NÃO é confiado: o id só serve pra buscar o recurso na API do Asaas
// (com a chave da conta), e é a resposta dela que mexe no acesso.
//
// Resposta: 200 = processado ou ignorado de propósito; 5xx = falha transitória
// (Firestore, rede). Atenção: o Asaas PAUSA a fila do webhook depois de
// várias respostas não-2xx seguidas — por isso só devolvemos erro quando vale
// a pena o reenvio.

async function handlePost(request: Request) {
  if (!asaasConfigured()) {
    console.error("[Asaas webhook] ASAAS_API_KEY ausente");
    return NextResponse.json({ error: "não configurado" }, { status: 503 });
  }

  // Sem token configurado o endpoint não aceita nada: qualquer um poderia
  // forçar reconferências (inofensivo, mas é custo de API e ruído no log).
  const auth = verifyWebhookToken(request.headers.get("asaas-access-token"));
  if (!auth.ok) {
    console.warn(`[Asaas webhook] recusado (${auth.reason})`);
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ received: true, note: "corpo inválido" });
  }

  const event = String(body?.event || "");

  try {
    const db = await getAdminDb();

    if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
      const r = await applyAsaasPayment(db, String(body?.payment?.id || ""));
      if (r.applied) {
        console.log(`[Asaas webhook] assinatura ${r.ownerUid} estendida (plano ${r.planId})`);
      } else {
        console.warn(`[Asaas webhook] cobrança ${body?.payment?.id} não aplicada: ${r.reason}`);
      }
      return NextResponse.json({ received: true, ...(r.applied ? {} : { note: r.reason }) });
    }

    if (event === "SUBSCRIPTION_DELETED" || event === "SUBSCRIPTION_INACTIVATED") {
      const r = await syncAsaasSubscription(db, String(body?.subscription?.id || ""));
      if (!r) console.warn(`[Asaas webhook] assinatura ${body?.subscription?.id} com externalReference desconhecido`);
      return NextResponse.json({ received: true });
    }

    // PAYMENT_CREATED / OVERDUE / REFUNDED etc. não mexem no acesso.
    return NextResponse.json({ received: true, note: `evento ignorado: ${event || "?"}` });
  } catch (err: any) {
    console.error("[Asaas webhook] erro:", err);
    return NextResponse.json({ error: err?.message || "erro interno" }, { status: 500 });
  }
}

// Cada chamada fica registrada em `webhookLogs` (ver lib/webhookLog.ts).
export const POST = withWebhookLog("asaas-webhook", handlePost);
