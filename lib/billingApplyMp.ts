// lib/billingApplyMp.ts
// Aplica no Firestore o que o Mercado Pago informa sobre uma assinatura
// recorrente. Compartilhado pelo webhook (/api/webhooks/mercadopago) e pela
// rota de retorno (/api/billing/confirm) — o redirect pode chegar antes do
// webhook, então os dois caminhos convergem aqui.
//
//  - applyAuthorizedPayment: uma cobrança do ciclo foi paga → estende o
//    período. Idempotente por id da cobrança
//    (users/{ownerUid}/billingEvents/mp_ap_{id}).
//  - syncPreapproval: espelha o estado da assinatura (authorized / paused /
//    cancelled) no doc de billing.
//
// SOMENTE server-side (Admin SDK).

import { getPlan } from "./billingPlans";
import { parseOrderNsu } from "./infinitepay";
import {
  getAuthorizedPayment,
  getPreapproval,
  isAuthorizedPaymentPaid,
  searchAuthorizedPayments,
  type AuthorizedPayment,
  type Preapproval,
} from "./mercadopago";
import { extendPeriod, freshBillingDoc, type BillingDoc } from "./billing";
import { finalizeContract } from "./contractFinalize";

export type ApplyMpResult =
  | { applied: true; ownerUid: string; planId: string; currentPeriodEnd: number }
  | { applied: false; reason: string; alreadyProcessed?: boolean };

/** Aplica uma cobrança já carregada (evita GET repetido quando o chamador já tem os dados). */
async function applyLoadedPayment(
  db: any,
  ap: AuthorizedPayment,
  pre: Preapproval
): Promise<ApplyMpResult> {
  const parsed = parseOrderNsu(pre.external_reference);
  if (!parsed) return { applied: false, reason: "external_reference inválido" };

  const plan = getPlan(parsed.planId);
  if (!plan) return { applied: false, reason: `plano desconhecido: ${parsed.planId}` };

  if (!isAuthorizedPaymentPaid(ap)) {
    return { applied: false, reason: `cobrança não paga (status ${ap.status}/${ap.payment?.status ?? "-"})` };
  }

  const amountCents = Math.round(ap.transaction_amount * 100);
  if (amountCents + 1 < plan.priceCents) {
    return { applied: false, reason: `valor divergente: ${amountCents} < ${plan.priceCents}` };
  }

  const eventRef = db.doc(`users/${parsed.ownerUid}/billingEvents/mp_ap_${ap.id}`);
  if ((await eventRef.get()).exists) {
    return { applied: false, reason: "já processado", alreadyProcessed: true };
  }

  const billingRef = db.doc(`users/${parsed.ownerUid}/profile/billing`);
  const now = Date.now();

  const currentPeriodEnd: number | null = await db.runTransaction(async (tx: any) => {
    const cur = await tx.get(billingRef);
    // Recheca a idempotência DENTRO da transação (corrida webhook × retorno).
    if ((await tx.get(eventRef)).exists) return null;

    const base: BillingDoc = cur.exists ? (cur.data() as BillingDoc) : freshBillingDoc(now);
    const periodEnd = extendPeriod(base.currentPeriodEnd, plan.months, now);

    tx.set(billingRef, {
      ...base,
      plan: plan.id,
      gateway: "mercadopago",
      subscriptionId: pre.id,
      subscriptionStatus: pre.status,
      cancelledAt: pre.status === "cancelled" ? base.cancelledAt ?? now : null,
      currentPeriodEnd: periodEnd,
      lastTransactionNsu: `mp_ap_${ap.id}`,
      lastOrderNsu: pre.external_reference,
      lastPaidAt: now,
      updatedAt: now,
    } satisfies BillingDoc);

    tx.set(eventRef, {
      gateway: "mercadopago",
      authorizedPaymentId: ap.id,
      paymentId: ap.payment?.id ?? null,
      preapprovalId: pre.id,
      orderNsu: pre.external_reference,
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
      transactionNsu: `mp_ap_${ap.id}`,
      orderNsu: pre.external_reference,
      paidAt: now,
      periodEnd: currentPeriodEnd,
    }).catch((e) => console.error("finalizeContract falhou:", e));
  }

  return { applied: true, ownerUid: parsed.ownerUid, planId: plan.id, currentPeriodEnd };
}

/** Webhook `subscription_authorized_payment`: reconfere a cobrança na API e aplica. */
export async function applyAuthorizedPayment(db: any, authorizedPaymentId: string): Promise<ApplyMpResult> {
  if (!authorizedPaymentId) return { applied: false, reason: "id da cobrança ausente" };
  const ap = await getAuthorizedPayment(authorizedPaymentId);
  if (!ap.preapproval_id) return { applied: false, reason: "cobrança sem preapproval_id" };
  const pre = await getPreapproval(ap.preapproval_id);
  return applyLoadedPayment(db, ap, pre);
}

/**
 * Webhook `subscription_preapproval` (e retorno do checkout): espelha o estado
 * da assinatura no doc de billing. Devolve o `ownerUid` da assinatura (ou null
 * se o external_reference não for nosso).
 */
export async function syncPreapproval(
  db: any,
  preapprovalId: string,
  preloaded?: Preapproval
): Promise<{ ownerUid: string; status: Preapproval["status"]; contractId: string | null } | null> {
  const pre = preloaded ?? (await getPreapproval(preapprovalId));
  const parsed = parseOrderNsu(pre.external_reference);
  if (!parsed) return null;

  const billingRef = db.doc(`users/${parsed.ownerUid}/profile/billing`);
  const now = Date.now();

  await db.runTransaction(async (tx: any) => {
    const cur = await tx.get(billingRef);
    const base: BillingDoc = cur.exists ? (cur.data() as BillingDoc) : freshBillingDoc(now);

    // Evento de uma assinatura ANTIGA (já substituída por outra viva) não pode
    // sobrescrever o estado da atual.
    if (base.subscriptionId && base.subscriptionId !== pre.id && base.subscriptionStatus === "authorized") {
      return;
    }

    tx.set(billingRef, {
      ...base,
      gateway: "mercadopago",
      subscriptionId: pre.id,
      subscriptionStatus: pre.status,
      cancelledAt: pre.status === "cancelled" ? base.cancelledAt ?? now : null,
      updatedAt: now,
    } satisfies BillingDoc);
  });

  return { ownerUid: parsed.ownerUid, status: pre.status, contractId: parsed.contractId };
}

/**
 * Retorno do checkout: o cliente voltou do MP com `preapproval_id`. Sincroniza a
 * assinatura e aplica as cobranças já pagas (o webhook pode ainda não ter chegado).
 */
export async function confirmFromReturn(
  db: any,
  preapprovalId: string
): Promise<{
  ownerUid: string;
  status: Preapproval["status"];
  contractId: string | null;
  applied: boolean;
  currentPeriodEnd: number | null;
} | null> {
  const pre = await getPreapproval(preapprovalId);
  const synced = await syncPreapproval(db, pre.id, pre);
  if (!synced) return null;

  let applied = false;
  let currentPeriodEnd: number | null = null;

  if (pre.status === "authorized") {
    try {
      const payments = await searchAuthorizedPayments(pre.id);
      for (const ap of payments) {
        const r = await applyLoadedPayment(db, ap, pre);
        if (r.applied) {
          applied = true;
          currentPeriodEnd = r.currentPeriodEnd;
        } else if (r.alreadyProcessed) {
          applied = true;
        }
      }
    } catch (e) {
      // A busca é só um atalho; o webhook cobre o mesmo caminho.
      console.warn("[MP confirm] busca de cobranças falhou:", e);
    }
  }

  return { ...synced, applied, currentPeriodEnd };
}
