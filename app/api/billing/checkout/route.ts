export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { getPlan } from "@/lib/billingPlans";
import { buildOrderNsu } from "@/lib/infinitepay";
import { createPreapproval, mercadopagoConfigured } from "@/lib/mercadopago";
import { isCompedEmail } from "@/lib/compAccounts";
import type { ContractDoc } from "@/lib/contract";

// POST /api/billing/checkout   body: { plan: PlanId, contractId }
//
// Autenticado, SÓ O DONO da conta. Cria a ASSINATURA RECORRENTE no Mercado Pago
// (status pendente) e devolve { url } pro client redirecionar o cliente a
// autorizar o meio de pagamento. O `external_reference` (mesmo formato do antigo
// order_nsu: ownerUid__plano__contrato__ts) carrega dono+plano+contrato e volta
// intacto em todo webhook.

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

  if (!mercadopagoConfigured()) {
    return NextResponse.json({ error: "Pagamento não configurado (MERCADOPAGO_ACCESS_TOKEN ausente)." }, { status: 503 });
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

  // Já existe renovação automática viva → não cria uma segunda cobrança em
  // paralelo (cancele a atual antes de trocar de plano).
  const billingSnap = await db.doc(`users/${scope.ownerUid}/profile/billing`).get();
  if (billingSnap.exists && billingSnap.data()?.subscriptionStatus === "authorized") {
    return NextResponse.json(
      { error: "Você já tem uma assinatura com renovação automática ativa. Cancele-a antes de contratar outro plano." },
      { status: 409 }
    );
  }

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

  const payerEmail = customer?.email;
  if (!payerEmail) {
    return NextResponse.json({ error: "Informe um e-mail válido no contrato para prosseguir." }, { status: 400 });
  }

  try {
    const orderNsu = buildOrderNsu(scope.ownerUid, plan.id, cid);
    const { id: preapprovalId, url } = await createPreapproval({
      externalReference: orderNsu,
      payerEmail,
      reason: `NexusFi — Plano ${plan.label}`,
      priceCents: plan.priceCents,
      everyMonths: plan.months,
      backUrl: `${base}/assinatura/retorno`,
    });

    // Registra o order_nsu e a assinatura no contrato (rastreio; a finalização
    // usa o external_reference).
    await db
      .doc(`users/${scope.ownerUid}/contracts/${cid}`)
      .update({ orderNsu, preapprovalId, updatedAt: Date.now() })
      .catch(() => undefined);

    return NextResponse.json({ url, orderNsu });
  } catch (err: any) {
    console.error("Erro ao criar assinatura no Mercado Pago:", err);
    return NextResponse.json({ error: err?.message || "Falha ao gerar o link de pagamento." }, { status: 502 });
  }
}
