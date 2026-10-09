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
import {
  asaasConfigured,
  cancelSubscription,
  createCustomer,
  createSubscription,
  listSubscriptionPayments,
  todayBR,
  type AsaasBillingType,
} from "@/lib/asaas";
import { freshBillingDoc, type BillingDoc } from "@/lib/billing";

// POST /api/billing/checkout   body: { plan, contractId, method?: "card" | "boleto" }
//
// Autenticado, SÓ O DONO da conta. Com ASAAS_API_KEY configurada, cria uma
// assinatura recorrente no Asaas (cartão recorrente ou boleto a cada ciclo) e
// devolve { url } da fatura hospedada; sem ela, cai no link avulso da
// InfinitePay. O externalReference/`order_nsu` carrega ownerUid+plano+contrato
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

  const useAsaas = asaasConfigured();
  if (!useAsaas && !infinitepayConfigured()) {
    return NextResponse.json({ error: "Pagamento não configurado (ASAAS_API_KEY ausente)." }, { status: 503 });
  }

  const base = appUrl();
  if (!base) {
    return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL não configurado." }, { status: 503 });
  }

  const { plan: planId, contractId, method } = await request.json().catch(() => ({}));
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

  if (useAsaas) {
    const billingType: AsaasBillingType = method === "boleto" ? "BOLETO" : "CREDIT_CARD";
    const cnpjDigits = contract.contratante.cnpj.replace(/\D/g, "");
    if (cnpjDigits.length !== 14) {
      return NextResponse.json({ error: "CNPJ do contrato inválido. Refaça o aceite." }, { status: 400 });
    }

    try {
      const billingRef = db.doc(`users/${scope.ownerUid}/profile/billing`);
      const billingSnap = await billingRef.get();
      const billing = billingSnap.exists ? (billingSnap.data() as BillingDoc) : freshBillingDoc();

      // Já tem renovação automática viva → não cria uma segunda cobrança por cima.
      if (billing.gateway === "asaas" && billing.subscriptionStatus === "authorized") {
        return NextResponse.json(
          { error: "Você já tem uma assinatura com renovação automática. Cancele a renovação antes de contratar de novo." },
          { status: 409 }
        );
      }
      // Tentativa anterior nunca paga (pending): descarta pra não deixar cobrança órfã.
      if (billing.gateway === "asaas" && billing.subscriptionId && billing.subscriptionStatus === "pending") {
        await cancelSubscription(billing.subscriptionId).catch(() => undefined);
      }

      const orderNsu = buildOrderNsu(scope.ownerUid, plan.id, cid);
      const customer = await createCustomer({
        name: contract.contratante.razaoSocial,
        email: contract.signatario.email,
        cpfCnpj: cnpjDigits,
        externalReference: scope.ownerUid,
      });
      const today = todayBR();
      // Boleto: 3 dias de prazo na 1ª cobrança. Cartão: cobra já.
      const dueDate = billingType === "BOLETO" ? todayBR(Date.now() + 3 * 24 * 60 * 60 * 1000) : today;

      const sub = await createSubscription({
        customerId: customer.id,
        billingType,
        priceCents: plan.priceCents,
        cycle: plan.months === 12 ? "YEARLY" : "MONTHLY",
        nextDueDate: dueDate,
        description: `NexusFi — Plano ${plan.label}`,
        externalReference: orderNsu,
        successUrl: `${base}/assinatura/retorno?gateway=asaas`,
      });

      // A 1ª cobrança nasce junto com a assinatura; dá uma folga se demorar.
      let invoiceUrl: string | null = null;
      for (let i = 0; i < 4 && !invoiceUrl; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1000));
        const pays = await listSubscriptionPayments(sub.id).catch(() => []);
        invoiceUrl = pays.find((p) => p.invoiceUrl)?.invoiceUrl ?? null;
      }
      if (!invoiceUrl) {
        await cancelSubscription(sub.id).catch(() => undefined);
        throw new Error("O Asaas criou a assinatura mas não gerou a fatura. Tente novamente.");
      }

      const now = Date.now();
      await billingRef.set(
        {
          ...billing,
          gateway: "asaas",
          subscriptionId: sub.id,
          subscriptionStatus: "pending",
          cancelledAt: null,
          paymentMethod: billingType,
          updatedAt: now,
        } satisfies BillingDoc,
        { merge: true }
      );
      await db
        .doc(`users/${scope.ownerUid}/contracts/${cid}`)
        .update({ orderNsu, updatedAt: now })
        .catch(() => undefined);

      return NextResponse.json({ url: invoiceUrl, orderNsu });
    } catch (err: any) {
      console.error("Erro ao criar assinatura Asaas:", err);
      return NextResponse.json({ error: err?.message || "Falha ao gerar a cobrança." }, { status: 502 });
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
