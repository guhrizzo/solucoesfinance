export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { infinitepayConfigured, parseOrderNsu } from "@/lib/infinitepay";
import { applyPaidOrder } from "@/lib/billingApply";

// POST /api/billing/confirm   body: { order_nsu, transaction_nsu, slug }
//
// Chamada pela página /assinatura/retorno depois que a InfinitePay redireciona
// o usuário de volta. O webhook é o caminho principal, mas o redirect pode
// chegar antes (ou o webhook falhar) — aqui o próprio usuário força a
// reconferência. `applyPaidOrder` é idempotente, então rodar os dois é seguro.

export async function POST(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }

  if (!infinitepayConfigured()) {
    return NextResponse.json({ error: "Pagamento não configurado." }, { status: 503 });
  }

  const { order_nsu, transaction_nsu, slug } = await request.json().catch(() => ({}));
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
