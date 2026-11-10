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
  cancelCheckout,
  cancelSubscription,
  checkoutUrl,
  createCustomer,
  createRecurringCheckout,
  createSubscription,
  listSubscriptionPayments,
  todayBR,
  type AsaasBillingType,
} from "@/lib/asaas";
import { freshBillingDoc, isCardTrialEligible, type BillingDoc } from "@/lib/billing";
import { TRIAL_DAYS } from "@/lib/billingPlans";
import {
  CARD_TRIAL_CHECKOUT_MINUTES,
  checkoutIndexPath,
  trialClaimPath,
  type CheckoutIndexDoc,
} from "@/lib/billingCardTrial";

// POST /api/billing/checkout   body: { plan, contractId, method?: "card" | "boleto", trial?: true }
//
// trial:true (CTA do Midas) → Asaas Checkout RECURRENT só com cartão e 1ª
// cobrança em hoje+7: o cliente cadastra o cartão na página do Asaas, nada é
// cobrado agora, e o teste só é liberado quando o webhook/retorno confirmar
// (pela API) que o Asaas validou o cartão e criou a assinatura.
// Ver lib/billingCardTrial.ts.
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

  const { plan: planId, contractId, method, trial } = await request.json().catch(() => ({}));
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

  // ── Teste grátis com cartão (caminho do CTA do Midas) ──
  if (trial === true) {
    if (!useAsaas) {
      return NextResponse.json({ error: "Teste com cartão indisponível (Asaas não configurado)." }, { status: 503 });
    }
    if (contract.trialDays !== TRIAL_DAYS) {
      return NextResponse.json(
        { error: "Este contrato não inclui o teste grátis. Refaça o aceite." },
        { status: 400 }
      );
    }
    const cnpjDigits = contract.contratante.cnpj.replace(/\D/g, "");
    if (cnpjDigits.length !== 14) {
      return NextResponse.json({ error: "CNPJ do contrato inválido. Refaça o aceite." }, { status: 400 });
    }
    try {
      const billingRef = db.doc(`users/${scope.ownerUid}/profile/billing`);
      const billingSnap = await billingRef.get();
      const billing = billingSnap.exists ? (billingSnap.data() as BillingDoc) : null;
      if (!isCardTrialEligible(billing)) {
        return NextResponse.json(
          { error: "Esta conta não pode ativar o teste grátis. Escolha um plano para assinar.", notEligible: true },
          { status: 409 }
        );
      }
      const claim = await db.doc(trialClaimPath(cnpjDigits)).get();
      if (claim.exists && claim.data()?.ownerUid !== scope.ownerUid) {
        return NextResponse.json(
          { error: "Este CNPJ já utilizou o teste grátis. Escolha um plano para assinar.", notEligible: true },
          { status: 409 }
        );
      }

      // Tentativas anteriores nunca concluídas: descarta pra não deixar checkout/cobrança órfã.
      if (billing!.cardTrial?.checkoutId && !billing!.cardTrial.activatedAt) {
        await cancelCheckout(billing!.cardTrial.checkoutId).catch(() => undefined);
      }
      if (billing!.gateway === "asaas" && billing!.subscriptionId && billing!.subscriptionStatus === "pending") {
        await cancelSubscription(billing!.subscriptionId).catch(() => undefined);
      }

      const orderNsu = buildOrderNsu(scope.ownerUid, plan.id, cid);
      const asaasCustomer = await createCustomer({
        name: contract.contratante.razaoSocial,
        email: contract.signatario.email,
        cpfCnpj: cnpjDigits,
        externalReference: scope.ownerUid,
      });
      const now = Date.now();
      const firstDueDate = todayBR(now + TRIAL_DAYS * 24 * 60 * 60 * 1000);

      const checkout = await createRecurringCheckout({
        customerId: asaasCustomer.id,
        itemName: `NexusFi ${plan.label}`,
        itemDescription: `Plano ${plan.label}: ${TRIAL_DAYS} dias grátis, 1ª cobrança em ${firstDueDate}.`,
        priceCents: plan.priceCents,
        cycle: plan.months === 12 ? "YEARLY" : "MONTHLY",
        nextDueDate: firstDueDate,
        externalReference: orderNsu,
        successUrl: `${base}/assinatura/retorno?gateway=asaas&trial=1`,
        cancelUrl: `${base}/assinatura?trial=cartao`,
        expiredUrl: `${base}/assinatura?trial=cartao&expirado=1`,
        minutesToExpire: CARD_TRIAL_CHECKOUT_MINUTES,
      });

      // O índice precisa existir ANTES de mandar o cliente pro Asaas: o
      // webhook pode chegar antes do redirect.
      const idx: CheckoutIndexDoc = {
        ownerUid: scope.ownerUid,
        customerId: asaasCustomer.id,
        orderNsu,
        planId: plan.id,
        contractId: cid,
        cnpj: cnpjDigits,
        firstDueDate,
        kind: "card_trial",
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      await db.doc(checkoutIndexPath(checkout.id)).set(idx);
      await billingRef.set(
        {
          gateway: "asaas",
          subscriptionId: null,
          subscriptionStatus: "pending",
          cancelledAt: null,
          paymentMethod: "CREDIT_CARD",
          cardTrial: {
            checkoutId: checkout.id,
            customerId: asaasCustomer.id,
            orderNsu,
            planId: plan.id,
            contractId: cid,
            cnpj: cnpjDigits,
            firstDueDate,
            createdAt: now,
            activatedAt: null,
            subscriptionId: null,
            rejectedReason: null,
          },
          updatedAt: now,
        } satisfies Partial<BillingDoc>,
        { merge: true }
      );
      await db
        .doc(`users/${scope.ownerUid}/contracts/${cid}`)
        .update({ orderNsu, updatedAt: now })
        .catch(() => undefined);

      return NextResponse.json({ url: checkoutUrl(checkout), orderNsu, trial: true, firstDueDate });
    } catch (err: any) {
      console.error("Erro ao criar checkout de teste Asaas:", err);
      return NextResponse.json({ error: err?.message || "Falha ao abrir o cadastro do cartão." }, { status: 502 });
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
      // Cadastro de cartão do teste em aberto: a pessoa preferiu assinar já.
      // Cancela o checkout e solta o vínculo — se ele ainda for concluído, a
      // ativação recusa e cancela a assinatura do teste (sem cobrança dupla).
      const dropCardTrial = !!(billing.cardTrial?.checkoutId && !billing.cardTrial.activatedAt);
      if (dropCardTrial) {
        await cancelCheckout(billing.cardTrial!.checkoutId).catch(() => undefined);
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
          ...(dropCardTrial ? { cardTrial: null } : {}),
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
