export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { cancelPreapproval, mercadopagoConfigured } from "@/lib/mercadopago";
import { syncPreapproval } from "@/lib/billingApplyMp";
import type { BillingDoc } from "@/lib/billing";

// POST /api/billing/cancel
//
// Autenticado, SÓ O DONO. Cancela a renovação automática no Mercado Pago:
// nenhuma cobrança futura. O acesso já pago segue até `currentPeriodEnd`
// (contrato, cláusula 4.2 — sem reembolso do período em curso).

export async function POST(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }
  if (!scope.isOwner) {
    return NextResponse.json(
      { error: "Apenas o titular da conta pode cancelar a assinatura." },
      { status: 403 }
    );
  }
  if (!mercadopagoConfigured()) {
    return NextResponse.json({ error: "Pagamento não configurado." }, { status: 503 });
  }

  try {
    const db = await getAdminDb();
    const snap = await db.doc(`users/${scope.ownerUid}/profile/billing`).get();
    const doc = snap.exists ? (snap.data() as BillingDoc) : null;

    if (!doc?.subscriptionId || doc.gateway !== "mercadopago") {
      return NextResponse.json({ error: "Não há assinatura com renovação automática para cancelar." }, { status: 404 });
    }
    if (doc.subscriptionStatus === "cancelled") {
      return NextResponse.json({ ok: true, alreadyCancelled: true, currentPeriodEnd: doc.currentPeriodEnd });
    }

    // Cancela no MP e espelha o estado retornado (não presume: usa a resposta).
    const pre = await cancelPreapproval(doc.subscriptionId);
    await syncPreapproval(db, pre.id, pre);

    return NextResponse.json({ ok: true, currentPeriodEnd: doc.currentPeriodEnd });
  } catch (err: any) {
    console.error("Erro em /api/billing/cancel:", err);
    return NextResponse.json({ error: err?.message || "Falha ao cancelar a assinatura." }, { status: 502 });
  }
}
