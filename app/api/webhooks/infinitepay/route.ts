export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Reconferência via payment_check + transação no Firestore.
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { infinitepayConfigured } from "@/lib/infinitepay";
import { applyPaidOrder } from "@/lib/billingApply";

// POST /api/webhooks/infinitepay
//
// A InfinitePay chama aqui quando um pagamento é aprovado. Como a API não
// assina o webhook, NÃO confiamos no corpo: `applyPaidOrder` reconfere o
// pagamento com `payment_check` antes de estender a assinatura.
//
// Resposta: 200 = processado ou ignorado de propósito; 400 = falha
// transitória, a InfinitePay pode reenviar.

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corpo inválido" }, { status: 400 });
  }

  if (!infinitepayConfigured()) {
    console.error("[InfinitePay webhook] INFINITEPAY_HANDLE ausente");
    return NextResponse.json({ error: "não configurado" }, { status: 400 });
  }

  try {
    const db = await getAdminDb();
    const r = await applyPaidOrder(db, {
      orderNsu: String(body.order_nsu || ""),
      transactionNsu: String(body.transaction_nsu || ""),
      slug: String(body.invoice_slug || body.slug || ""),
      fallbackAmount: Number(body.amount) || 0,
    });

    if (r.applied) {
      console.log(`[InfinitePay webhook] assinatura ${r.ownerUid} estendida (plano ${r.planId})`);
      return NextResponse.json({ received: true });
    }

    console.warn(`[InfinitePay webhook] não aplicado: ${r.reason}`);
    // "não pago" / "valor divergente" / "já processado" → 200 (não adianta reenviar).
    return NextResponse.json({ received: true, note: r.reason });
  } catch (err: any) {
    console.error("[InfinitePay webhook] erro:", err);
    // 400 → a InfinitePay reenvia (falha transitória: Firestore, rede, ...).
    return NextResponse.json({ error: err?.message || "erro interno" }, { status: 400 });
  }
}
