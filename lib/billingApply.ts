// lib/billingApply.ts
// Reconfere um pedido na InfinitePay e, se pago, estende a assinatura da conta.
// Compartilhado pelo webhook (/api/webhooks/infinitepay) e pela rota de
// confirmação do retorno (/api/billing/confirm) — o redirect pode chegar antes
// do webhook, então os dois caminhos convergem aqui. Idempotente por
// `transaction_nsu` (doc em users/{ownerUid}/billingEvents/{transactionNsu}).
//
// SOMENTE server-side (Admin SDK).

import { getPlan } from "./billingPlans";
import { verifyPayment, parseOrderNsu } from "./infinitepay";
import { extendPeriod, freshBillingDoc, type BillingDoc } from "./billing";
import { finalizeContract } from "./contractFinalize";

export interface ApplyInput {
  orderNsu: string;
  transactionNsu: string;
  slug: string;
  /** Valor do webhook, usado só como fallback se o payment_check não trouxer `amount`. */
  fallbackAmount?: number;
}

export type ApplyResult =
  | { applied: true; ownerUid: string; planId: string; currentPeriodEnd: number }
  | { applied: false; reason: string; alreadyProcessed?: boolean };

export async function applyPaidOrder(db: any, input: ApplyInput): Promise<ApplyResult> {
  const parsed = parseOrderNsu(input.orderNsu);
  if (!parsed) return { applied: false, reason: "order_nsu inválido" };
  if (!input.transactionNsu || !input.slug) {
    return { applied: false, reason: "transaction_nsu ou slug ausente" };
  }

  const plan = getPlan(parsed.planId);
  if (!plan) return { applied: false, reason: `plano desconhecido: ${parsed.planId}` };

  const eventRef = db.doc(`users/${parsed.ownerUid}/billingEvents/${input.transactionNsu}`);
  if ((await eventRef.get()).exists) {
    return { applied: false, reason: "já processado", alreadyProcessed: true };
  }

  const check = await verifyPayment({
    orderNsu: input.orderNsu,
    transactionNsu: input.transactionNsu,
    slug: input.slug,
  });
  if (!check.success || !check.paid) {
    return { applied: false, reason: "pagamento não confirmado pela InfinitePay" };
  }

  const valorBase = check.amount || input.fallbackAmount || 0;
  if (valorBase + 1 < plan.priceCents) {
    return { applied: false, reason: `valor divergente: ${valorBase} < ${plan.priceCents}` };
  }

  const billingRef = db.doc(`users/${parsed.ownerUid}/profile/billing`);
  const now = Date.now();

  const currentPeriodEnd = await db.runTransaction(async (tx: any) => {
    const cur = await tx.get(billingRef);

    // Recheca a idempotência DENTRO da transação (evita corrida webhook × confirm).
    const ev = await tx.get(eventRef);
    if (ev.exists) return null;

    const base: BillingDoc = cur.exists ? (cur.data() as BillingDoc) : freshBillingDoc(now);
    const periodEnd = extendPeriod(base.currentPeriodEnd, plan.months, now);

    tx.set(billingRef, {
      ...base,
      plan: plan.id,
      currentPeriodEnd: periodEnd,
      lastTransactionNsu: input.transactionNsu,
      lastOrderNsu: input.orderNsu,
      lastPaidAt: now,
      updatedAt: now,
    } satisfies BillingDoc);

    tx.set(eventRef, {
      transactionNsu: input.transactionNsu,
      orderNsu: input.orderNsu,
      planId: plan.id,
      amount: valorBase,
      paidAmount: check.paid_amount || valorBase,
      installments: check.installments || 1,
      captureMethod: check.capture_method || "",
      currentPeriodEnd: periodEnd,
      processedAt: now,
    });

    return periodEnd;
  });

  if (currentPeriodEnd === null) {
    return { applied: false, reason: "já processado", alreadyProcessed: true };
  }

  // Contrato aceito no checkout (4º segmento do order_nsu): marca como assinado
  // e envia a via em PDF por e-mail. Fora da transação (gera PDF / rede) e
  // blindado — nunca derruba um pagamento já aplicado.
  if (parsed.contractId) {
    await finalizeContract(db, parsed.ownerUid, parsed.contractId, {
      transactionNsu: input.transactionNsu,
      orderNsu: input.orderNsu,
      paidAt: now,
      periodEnd: currentPeriodEnd,
    }).catch((e) => console.error("finalizeContract falhou:", e));
  }

  return { applied: true, ownerUid: parsed.ownerUid, planId: plan.id, currentPeriodEnd };
}
