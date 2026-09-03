export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { getPlan } from "@/lib/billingPlans";
import { createCheckoutLink, buildOrderNsu, infinitepayConfigured } from "@/lib/infinitepay";
import { isCompedEmail } from "@/lib/compAccounts";

// POST /api/billing/checkout   body: { plan: "mensal" | "anual" }
//
// Autenticado, SÓ O DONO da conta. Gera o link de pagamento da InfinitePay e
// devolve { url } pro client redirecionar. O `order_nsu` carrega ownerUid+plano
// e volta intacto no webhook/redirect.

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
}

export async function POST(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }
  if (!scope.isOwner) {
    return NextResponse.json(
      { error: "Apenas o titular da conta pode contratar ou renovar a assinatura." },
      { status: 403 }
    );
  }

  // Conta cortesia (adm supremo): nunca é cobrada — não gera checkout.
  try {
    const rec = await (await getAdminAuth()).getUser(scope.ownerUid);
    if (isCompedEmail(rec.email)) {
      return NextResponse.json(
        { error: "Sua conta é cortesia e tem acesso liberado — não é necessário assinar." },
        { status: 409 }
      );
    }
  } catch {
    /* sem e-mail → segue o fluxo normal de cobrança */
  }

  if (!infinitepayConfigured()) {
    return NextResponse.json({ error: "Pagamento não configurado (INFINITEPAY_HANDLE ausente)." }, { status: 503 });
  }

  const base = appUrl();
  if (!base) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL não configurado." }, { status: 503 });
  }

  const { plan: planId } = await request.json().catch(() => ({}));
  const plan = getPlan(String(planId || ""));
  if (!plan) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }

  // Prefill best-effort com os dados do login.
  let customer: { name?: string; email?: string } | undefined;
  try {
    const rec = await (await getAdminAuth()).getUser(scope.uid);
    customer = { name: rec.displayName || undefined, email: rec.email || undefined };
  } catch {
    /* prefill é opcional */
  }

  try {
    const orderNsu = buildOrderNsu(scope.ownerUid, plan.id);
    const { url } = await createCheckoutLink({
      orderNsu,
      redirectUrl: `${base}/assinatura/retorno`,
      webhookUrl: `${base}/api/webhooks/infinitepay`,
      items: [
        {
          quantity: 1,
          price: plan.priceCents,
          description: `NexusFi — Plano ${plan.label}`,
        },
      ],
      customer,
    });

    return NextResponse.json({ url, orderNsu });
  } catch (err: any) {
    console.error("Erro ao criar checkout InfinitePay:", err);
    return NextResponse.json({ error: err?.message || "Falha ao gerar o link de pagamento." }, { status: 502 });
  }
}
