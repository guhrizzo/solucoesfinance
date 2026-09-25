export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { withWebhookLog } from "@/lib/webhookLog";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { infinitepayConfigured, parseOrderNsu } from "@/lib/infinitepay";
import { applyPaidOrder } from "@/lib/billingApply";
import { confirmFromReturn } from "@/lib/billingApplyMp";
import { mercadopagoConfigured } from "@/lib/mercadopago";

// POST /api/billing/confirm
//   Mercado Pago (recorrente): body { preapproval_id }
//   InfinitePay (legado, links já emitidos): body { order_nsu, transaction_nsu, slug }
//
// Chamada pela página /assinatura/retorno depois que o gateway redireciona o
// usuário de volta. O webhook é o caminho principal, mas o redirect pode
// chegar antes (ou o webhook falhar) — aqui o próprio usuário força a
// reconferência. Os dois caminhos são idempotentes, então rodar ambos é seguro.

async function handlePost(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }

  const { order_nsu, transaction_nsu, slug, preapproval_id } = await request.json().catch(() => ({}));

  // ── Mercado Pago ──
  if (preapproval_id) {
    if (!mercadopagoConfigured()) {
      return NextResponse.json({ error: "Pagamento não configurado." }, { status: 503 });
    }
    try {
      const db = await getAdminDb();
      const r = await confirmFromReturn(db, String(preapproval_id));
      if (!r) {
        return NextResponse.json({ error: "Assinatura não reconhecida." }, { status: 400 });
      }
      // Só deixa confirmar assinatura da própria conta.
      if (r.ownerUid !== scope.ownerUid) {
        return NextResponse.json({ error: "Assinatura não pertence a esta conta." }, { status: 403 });
      }
      if (r.status === "cancelled") {
        return NextResponse.json({ error: "A assinatura foi cancelada." }, { status: 400 });
      }
      if (r.applied) {
        return NextResponse.json({
          ok: true,
          contractId: r.contractId,
          currentPeriodEnd: r.currentPeriodEnd,
        });
      }
      // Autorizada/pendente mas a 1ª cobrança ainda não foi confirmada
      // (ex.: Pix aguardando pagamento) — o webhook conclui.
      return NextResponse.json({ ok: false, pending: true, contractId: r.contractId });
    } catch (err: any) {
      console.error("Erro em /api/billing/confirm (MP):", err);
      return NextResponse.json({ error: err?.message || "Erro ao confirmar assinatura." }, { status: 500 });
    }
  }

  // ── InfinitePay (legado) ──
  if (!infinitepayConfigured()) {
    return NextResponse.json({ error: "Pagamento não configurado." }, { status: 503 });
  }

  const parsed = parseOrderNsu(String(order_nsu || ""));
  if (!parsed) {
    return NextResponse.json({ error: "order_nsu inválido." }, { status: 400 });
  }
  // Só deixa confirmar pedido da própria conta.
  if (parsed.ownerUid !== scope.ownerUid) {
    return NextResponse.json({ error: "Pedido não pertence a esta conta." }, { status: 403 });
  }

  try {
    const db = await getAdminDb();
    const r = await applyPaidOrder(db, {
      orderNsu: String(order_nsu),
      transactionNsu: String(transaction_nsu || ""),
      slug: String(slug || ""),
    });

    if (r.applied) {
      return NextResponse.json({ ok: true, currentPeriodEnd: r.currentPeriodEnd });
    }
    if (r.alreadyProcessed) {
      return NextResponse.json({ ok: true, alreadyProcessed: true });
    }
    // Ainda não confirmado — o webhook pode resolver em seguida.
    return NextResponse.json({ ok: false, pending: true, reason: r.reason });
  } catch (err: any) {
    console.error("Erro em /api/billing/confirm:", err);
    return NextResponse.json({ error: err?.message || "Erro ao confirmar pagamento." }, { status: 500 });
  }
}

// Cada chamada fica registrada em `webhookLogs` (ver lib/webhookLog.ts).
export const POST = withWebhookLog("billing-confirm", handlePost);
