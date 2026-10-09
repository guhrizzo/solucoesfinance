// lib/billingApplyAsaas.ts
// Aplica no Firestore o que o Asaas informa sobre uma assinatura recorrente.
// Compartilhado pelo webhook (/api/webhooks/asaas) e pela rota de retorno
// (/api/billing/confirm) — o redirect pode chegar antes do webhook, então os
// dois caminhos convergem aqui.
//
//  - applyAsaasPayment: uma cobrança do ciclo foi paga → estende o período.
//    Idempotente por id da cobrança (users/{ownerUid}/billingEvents/asaas_{id}).
//  - syncAsaasSubscription: espelha o encerramento da assinatura no doc de billing.
//
// SOMENTE server-side (Admin SDK).

import { getPlan } from "./billingPlans";
import { parseOrderNsu } from "./infinitepay";
import {
  getPayment,
  getSubscription,
  isPaymentPaid,
  listSubscriptionPayments,
  type AsaasPayment,
  type AsaasSubscription,
} from "./asaas";
import { extendPeriod, freshBillingDoc, type BillingDoc } from "./billing";
import { finalizeContract } from "./contractFinalize";

export type ApplyAsaasResult =
  | { applied: true; ownerUid: string; planId: string; currentPeriodEnd: number }
  | { applied: false; reason: string; alreadyProcessed?: boolean };

function methodOf(sub: AsaasSubscription): BillingDoc["paymentMethod"] {
  return sub.billingType === "BOLETO" || sub.billingType === "CREDIT_CARD" ? sub.billingType : null;
}

/** Aplica uma cobrança já carregada (evita GET repetido quando o chamador já tem os dados). */
async function applyLoadedPayment(
  db: any,
  pay: AsaasPayment,
  sub: AsaasSubscription
): Promise<ApplyAsaasResult> {
  const parsed = parseOrderNsu(sub.externalReference);
  if (!parsed) return { applied: false, reason: "externalReference inválido" };

  const plan = getPlan(parsed.planId);
  if (!plan) return { applied: false, reason: `plano desconhecido: ${parsed.planId}` };

  if (!isPaymentPaid(pay)) {
    return { applied: false, reason: `cobrança não paga (status ${pay.status})` };
  }

  const amountCents = Math.round(pay.value * 100);
  if (amountCents + 1 < plan.priceCents) {
    return { applied: false, reason: `valor divergente: ${amountCents} < ${plan.priceCents}` };
  }

  const eventKey = `asaas_${pay.id}`;
  const eventRef = db.doc(`users/${parsed.ownerUid}/billingEvents/${eventKey}`);
  if ((await eventRef.get()).exists) {
    return { applied: false, reason: "já processado", alreadyProcessed: true };
  }

  const billingRef = db.doc(`users/${parsed.ownerUid}/profile/billing`);
  const now = Date.now();
  const active = sub.status === "ACTIVE" && !sub.deleted;

  const currentPeriodEnd: number | null = await db.runTransaction(async (tx: any) => {
    const cur = await tx.get(billingRef);
    // Recheca a idempotência DENTRO da transação (corrida webhook × retorno).
    if ((await tx.get(eventRef)).exists) return null;

    const base: BillingDoc = cur.exists ? (cur.data() as BillingDoc) : freshBillingDoc(now);
    const periodEnd = extendPeriod(base.currentPeriodEnd, plan.months, now);

    tx.set(billingRef, {
      ...base,
      plan: plan.id,
      gateway: "asaas",
      subscriptionId: sub.id,
      subscriptionStatus: active ? "authorized" : "cancelled",
      cancelledAt: active ? null : base.cancelledAt ?? now,
      paymentMethod: methodOf(sub) ?? (pay.billingType === "BOLETO" ? "BOLETO" : "CREDIT_CARD"),
      currentPeriodEnd: periodEnd,
      lastTransactionNsu: eventKey,
      lastOrderNsu: sub.externalReference,
      lastPaidAt: now,
      updatedAt: now,
    } satisfies BillingDoc);

    tx.set(eventRef, {
      gateway: "asaas",
      paymentId: pay.id,
      subscriptionId: sub.id,
      billingType: pay.billingType,
      orderNsu: sub.externalReference,
      planId: plan.id,
      amount: amountCents,
      currentPeriodEnd: periodEnd,
      processedAt: now,
    });

    return periodEnd;
  });

  if (currentPeriodEnd === null) {
    return { applied: false, reason: "já processado", alreadyProcessed: true };
  }

  // Contrato aceito no checkout: marca como assinado e manda a via em PDF.
  // Idempotente (só age na 1ª cobrança) e blindado — nunca derruba o pagamento.
  if (parsed.contractId) {
    await finalizeContract(db, parsed.ownerUid, parsed.contractId, {
      transactionNsu: eventKey,
      orderNsu: sub.externalReference,
      paidAt: now,
      periodEnd: currentPeriodEnd,
    }).catch((e) => console.error("finalizeContract falhou:", e));
  }

  return { applied: true, ownerUid: parsed.ownerUid, planId: plan.id, currentPeriodEnd };
}

/** Webhook de cobrança: reconfere a cobrança (e a assinatura) na API e aplica. */
export async function applyAsaasPayment(db: any, paymentId: string): Promise<ApplyAsaasResult> {
  if (!paymentId) return { applied: false, reason: "id da cobrança ausente" };
  const pay = await getPayment(paymentId);
  if (!pay.subscription) return { applied: false, reason: "cobrança avulsa (sem assinatura)" };
  const sub = await getSubscription(pay.subscription);
  return applyLoadedPayment(db, pay, sub);
}

/**
 * Webhook de assinatura (SUBSCRIPTION_DELETED / INACTIVATED) e retorno do
 * checkout: espelha o encerramento no doc de billing. Uma assinatura ativa
 * NÃO vira "authorized" aqui — isso só acontece quando a 1ª cobrança é paga.
 * Devolve o `ownerUid` (ou null se o externalReference não for nosso).
 */
export async function syncAsaasSubscription(
  db: any,
  subscriptionId: string,
  preloaded?: AsaasSubscription
): Promise<{ ownerUid: string; contractId: string | null; ended: boolean } | null> {
  const sub = preloaded ?? (await getSubscription(subscriptionId));
  const parsed = parseOrderNsu(sub.externalReference);
  if (!parsed) return null;

  const ended = sub.deleted || sub.status !== "ACTIVE";
  if (!ended) return { ownerUid: parsed.ownerUid, contractId: parsed.contractId, ended: false };

  const billingRef = db.doc(`users/${parsed.ownerUid}/profile/billing`);
  const now = Date.now();

  await db.runTransaction(async (tx: any) => {
    const cur = await tx.get(billingRef);
    if (!cur.exists) return;
    const base = cur.data() as BillingDoc;

    // Evento de uma assinatura ANTIGA (já substituída por outra) não pode
    // sobrescrever o estado da atual.
    if (base.subscriptionId && base.subscriptionId !== sub.id) return;

    tx.set(billingRef, {
      ...base,
      subscriptionStatus: "cancelled",
      cancelledAt: base.cancelledAt ?? now,
      updatedAt: now,
    } satisfies BillingDoc);
  });

  return { ownerUid: parsed.ownerUid, contractId: parsed.contractId, ended: true };
}

/**
 * Retorno do checkout: o cliente voltou do Asaas. Lê a assinatura que o
 * checkout gravou no doc de billing da própria conta e aplica as cobranças já
 * pagas (o webhook pode ainda não ter chegado).
 */
export async function confirmAsaasFromReturn(
  db: any,
  ownerUid: string
): Promise<{
  found: boolean;
  contractId: string | null;
  applied: boolean;
  currentPeriodEnd: number | null;
}> {
  const snap = await db.doc(`users/${ownerUid}/profile/billing`).get();
  const doc = snap.exists ? (snap.data() as BillingDoc) : null;
  if (!doc?.subscriptionId || doc.gateway !== "asaas") {
    return { found: false, contractId: null, applied: false, currentPeriodEnd: null };
  }

  const sub = await getSubscription(doc.subscriptionId);
  const parsed = parseOrderNsu(sub.externalReference);
  // Defesa: a assinatura precisa ser desta conta.
  if (!parsed || parsed.ownerUid !== ownerUid) {
    return { found: false, contractId: null, applied: false, currentPeriodEnd: null };
  }

  let applied = false;
  let currentPeriodEnd: number | null = null;
  for (const pay of await listSubscriptionPayments(sub.id)) {
    if (!isPaymentPaid(pay)) continue;
    const r = await applyLoadedPayment(db, pay, sub);
    if (r.applied) {
      applied = true;
      currentPeriodEnd = r.currentPeriodEnd;
    } else if (r.alreadyProcessed) {
      applied = true;
    }
  }

  return { found: true, contractId: parsed.contractId, applied, currentPeriodEnd };
}
