export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { getPlan } from "@/lib/billingPlans";
import { createCheckoutLink, buildOrderNsu, infinitepayConfigured } from "@/lib/infinitepay";
import { isCompedEmail } from "@/lib/compAccounts";
import type { ContractDoc } from "@/lib/contract";

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

  const { plan: planId, contractId } = await request.json().catch(() => ({}));
  const plan = getPlan(String(planId || ""));
  if (!plan) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }

  // Contrato aceito é obrigatório — não se gera link de pagamento sem ele.
  const cid = String(contractId || "");
  if (!cid) {
    return NextResponse.json(
      { error: "Assine o contrato antes de prosseguir para o pagamento." },
      { status: 400 }
    );
  }
  const db = await getAdminDb();
  const contractSnap = await db.doc(`users/${scope.ownerUid}/contracts/${cid}`).get();
  const contract = contractSnap.exists
    ? (contractSnap.data() as ContractDoc)
    : null;
  if (
    !contract ||
    contract.ownerUid !== scope.ownerUid ||
    contract.planId !== plan.id ||
    contract.status !== "pending_payment"
  ) {
    return NextResponse.json(
      { error: "Contrato inválido ou já utilizado. Refaça o aceite." },
      { status: 400 }
    );
  }

  // Prefill best-effort: prioriza os dados do contrato (mais fiéis que o login).
  let customer: { name?: string; email?: string } | undefined = {
    name: contract.signatario.nome || undefined,
    email: contract.signatario.email || undefined,
  };
  if (!customer.name || !customer.email) {
    try {
      const rec = await (await getAdminAuth()).getUser(scope.uid);
      customer = {
        name: customer.name || rec.displayName || undefined,
        email: customer.email || rec.email || undefined,
      };
    } catch {
      /* prefill é opcional */
    }
  }

  try {
    const orderNsu = buildOrderNsu(scope.ownerUid, plan.id, cid);
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

    // Registra o order_nsu no contrato (rastreio; a finalização usa o do order_nsu).
    await db
      .doc(`users/${scope.ownerUid}/contracts/${cid}`)
      .update({ orderNsu, updatedAt: Date.now() })
      .catch(() => undefined);

    return NextResponse.json({ url, orderNsu });
  } catch (err: any) {
    console.error("Erro ao criar checkout InfinitePay:", err);
    return NextResponse.json({ error: err?.message || "Falha ao gerar o link de pagamento." }, { status: 502 });
  }
}
