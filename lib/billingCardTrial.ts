// lib/billingCardTrial.ts
// Teste grátis de 7 dias CONDICIONADO AO CARTÃO (caminho do CTA do Midas).
//
// Fluxo:
//  1. Cadastro com ?trial=cartao → requireCardTrial(): a conta nova nasce SEM
//     o teste padrão (trialKind "card_required", trialEndsAt = agora).
//  2. Contrato aceito (com a cláusula do teste) → /api/billing/checkout com
//     trial:true cria um Asaas Checkout RECURRENT com 1ª cobrança em hoje+7 e
//     grava o índice `asaasCheckouts/{checkoutId}`.
//  3. O cliente digita o cartão NA PÁGINA DO ASAAS. Concluído, o Asaas valida
//     o cartão e cria a assinatura (subscription.checkoutSession = checkoutId).
//  4. Webhook (SUBSCRIPTION_CREATED / CHECKOUT_PAID) ou o retorno do cliente
//     → activateCardTrial(): reconfere a assinatura por GET na API e só então
//     libera o teste até o fim do dia da 1ª cobrança. Idempotente.
//  5. No vencimento o Asaas cobra o cartão; PAYMENT_CONFIRMED segue o caminho
//     normal (applyAsaasPayment) e a assinatura continua recorrente.
//
// Anti-abuso: 1 teste por conta (cardTrial.activatedAt) e 1 por CNPJ
// (`trialClaims/{cnpj}`, gravado na mesma transação da ativação).
//
// SOMENTE server-side (Admin SDK).

import { getPlan } from "./billingPlans";
import {
  cancelSubscription,
  getSubscription,
  listSubscriptions,
  setSubscriptionExternalReference,
  type AsaasSubscription,
} from "./asaas";
import { cardTrialEndFrom, freshBillingDoc, type BillingDoc, type CardTrialInfo } from "./billing";

/** Janela, a partir da criação do usuário, em que o cadastro pode optar pelo teste com cartão. */
export const CARD_TRIAL_OPTIN_WINDOW_MS = 30 * 60 * 1000;

/** Validade da página de checkout do Asaas (10..1440 min). */
export const CARD_TRIAL_CHECKOUT_MINUTES = 60;

export interface CheckoutIndexDoc {
  ownerUid: string;
  customerId: string;
  orderNsu: string;
  planId: string;
  contractId: string;
  cnpj: string;
  firstDueDate: string;
  kind: "card_trial";
  status: "pending" | "activated" | "rejected" | "expired";
  createdAt: number;
  updatedAt: number;
  subscriptionId?: string | null;
  reason?: string | null;
}

export const checkoutIndexPath = (checkoutId: string) => `asaasCheckouts/${checkoutId}`;
export const trialClaimPath = (cnpjDigits: string) => `trialClaims/${cnpjDigits}`;

// ─── 1. Opt-in no cadastro ──────────────────────────────────────────────────

export type RequireResult = { ok: true; already?: boolean } | { ok: false; reason: string };

/**
 * Marca a conta recém-criada como "teste só com cartão". Só age em conta nova
 * (criada há menos de 30 min) que nunca pagou nem tem assinatura — não tira
 * acesso de ninguém que já estava usando o produto.
 */
export async function requireCardTrial(
  db: any,
  ownerUid: string,
  accountCreatedAtMs: number,
  nowMs = Date.now()
): Promise<RequireResult> {
  if (!accountCreatedAtMs || nowMs - accountCreatedAtMs > CARD_TRIAL_OPTIN_WINDOW_MS) {
    return { ok: false, reason: "conta não é nova" };
  }
  const ref = db.doc(`users/${ownerUid}/profile/billing`);
  return db.runTransaction(async (tx: any) => {
    const snap = await tx.get(ref);
    const base: BillingDoc = snap.exists ? (snap.data() as BillingDoc) : freshBillingDoc(nowMs);
    if (base.comped) return { ok: false, reason: "conta cortesia" } as RequireResult;
    // Sem doc ainda: freshBillingDoc já nasce "card_required" — só persiste.
    if (!snap.exists) {
      tx.set(ref, base);
      return { ok: true } as RequireResult;
    }
    if (base.trialKind === "card_required" || base.trialKind === "card") {
      return { ok: true, already: true } as RequireResult;
    }
    if (base.currentPeriodEnd || base.lastPaidAt || base.subscriptionId) {
      return { ok: false, reason: "conta já tem assinatura" } as RequireResult;
    }
    tx.set(ref, {
      ...base,
      // Sem cartão validado, sem teste: o acesso fica travado no paywall.
      trialEndsAt: Math.min(base.trialEndsAt || nowMs, nowMs),
      trialKind: "card_required",
      updatedAt: nowMs,
    } satisfies BillingDoc);
    return { ok: true } as RequireResult;
  });
}

// ─── Ligação assinatura ↔ conta ─────────────────────────────────────────────

export async function loadCheckoutIndex(db: any, checkoutId: string): Promise<CheckoutIndexDoc | null> {
  if (!checkoutId) return null;
  const snap = await db.doc(checkoutIndexPath(checkoutId)).get();
  return snap.exists ? (snap.data() as CheckoutIndexDoc) : null;
}

/**
 * externalReference "nosso" (owner__plan__contract__ts) de uma assinatura.
 * Assinaturas nascidas de checkout podem vir sem ele — cai no índice pelo
 * checkoutSession.
 */
export async function orderNsuOf(db: any, sub: AsaasSubscription): Promise<string> {
  if (sub.externalReference) return sub.externalReference;
  if (!sub.checkoutSession) return "";
  const idx = await loadCheckoutIndex(db, sub.checkoutSession);
  return idx?.orderNsu || "";
}

/** Acha a assinatura que o Asaas criou a partir de um checkout nosso. */
export async function findCheckoutSubscription(idx: CheckoutIndexDoc, checkoutId: string): Promise<AsaasSubscription | null> {
  const tries: Array<() => Promise<AsaasSubscription[]>> = [];
  if (idx.customerId) tries.push(() => listSubscriptions({ customer: idx.customerId }));
  tries.push(() => listSubscriptions({ externalReference: idx.orderNsu }));
  for (const run of tries) {
    const rows = await run().catch(() => [] as AsaasSubscription[]);
    const hit = rows.find((s) => s.checkoutSession === checkoutId);
    if (hit) return hit;
  }
  return null;
}

// ─── 2. Ativação (cartão validado) ──────────────────────────────────────────

export type ActivateResult =
  | { handled: false; reason: string }
  | {
      handled: true;
      ownerUid: string;
      contractId: string;
      activated: boolean;
      alreadyActive?: boolean;
      trialEndsAt?: number;
      reason?: string;
    };

/**
 * Recebe uma assinatura JÁ LIDA DA API (nunca do corpo do webhook) e, se ela
 * veio de um checkout de teste nosso, libera o teste. Se a conta não puder
 * ganhar o teste (CNPJ já usou, conta já assinou, checkout substituído),
 * cancela a assinatura no Asaas — nada foi cobrado ainda (1ª cobrança em D+7).
 */
export async function activateCardTrial(db: any, sub: AsaasSubscription, nowMs = Date.now()): Promise<ActivateResult> {
  if (!sub.checkoutSession) return { handled: false, reason: "assinatura não veio de checkout" };
  const checkoutId = sub.checkoutSession;
  const idx = await loadCheckoutIndex(db, checkoutId);
  if (!idx || idx.kind !== "card_trial") return { handled: false, reason: "checkout desconhecido" };

  const { ownerUid, contractId } = idx;
  const reject = async (reason: string): Promise<ActivateResult> => {
    console.warn(`[cardTrial] ${ownerUid}: teste recusado (${reason}) — cancelando assinatura ${sub.id}`);
    await cancelSubscription(sub.id).catch((e) => console.error("[cardTrial] falha ao cancelar:", e));
    await db
      .doc(checkoutIndexPath(checkoutId))
      .set({ status: "rejected", reason, subscriptionId: sub.id, updatedAt: nowMs }, { merge: true })
      .catch(() => undefined);
    await db
      .doc(`users/${ownerUid}/profile/billing`)
      .set({ cardTrial: { rejectedReason: reason }, updatedAt: nowMs }, { merge: true })
      .catch(() => undefined);
    return { handled: true, ownerUid, contractId, activated: false, reason };
  };

  // Conferências na resposta da API.
  const plan = getPlan(idx.planId);
  if (!plan) return { handled: true, ownerUid, contractId, activated: false, reason: "plano desconhecido" };
  if (sub.deleted || sub.status !== "ACTIVE") {
    return { handled: true, ownerUid, contractId, activated: false, reason: `assinatura ${sub.status}` };
  }
  if (sub.billingType !== "CREDIT_CARD") return reject(`meio de pagamento ${sub.billingType}`);
  if (Math.round(sub.value * 100) + 1 < plan.priceCents) return reject("valor divergente do plano");
  if (idx.customerId && sub.customer && sub.customer !== idx.customerId) {
    // O checkout pode ter criado outro cliente; o vínculo forte é o checkoutSession.
    console.warn(`[cardTrial] cliente divergente: ${sub.customer} ≠ ${idx.customerId} (checkout ${checkoutId})`);
  }

  const billingRef = db.doc(`users/${ownerUid}/profile/billing`);
  const claimRef = db.doc(trialClaimPath(idx.cnpj));

  const outcome: { kind: "ok" | "already" | "reject"; reason?: string; trialEndsAt?: number } =
    await db.runTransaction(async (tx: any) => {
      const cur = await tx.get(billingRef);
      const claim = await tx.get(claimRef);
      const base: BillingDoc = cur.exists ? (cur.data() as BillingDoc) : freshBillingDoc(nowMs);

      if (base.cardTrial?.activatedAt && base.cardTrial.subscriptionId === sub.id) {
        return { kind: "already", trialEndsAt: base.trialEndsAt };
      }
      if (base.comped) return { kind: "reject", reason: "conta cortesia" };
      if (base.trialKind !== "card_required" || base.cardTrial?.activatedAt) {
        return { kind: "reject", reason: "conta não elegível ao teste" };
      }
      if (base.currentPeriodEnd || base.lastPaidAt || base.subscriptionStatus === "authorized") {
        return { kind: "reject", reason: "conta já possui assinatura" };
      }
      if (base.cardTrial?.checkoutId !== checkoutId) {
        return { kind: "reject", reason: "checkout substituído por outro mais recente" };
      }
      if (claim.exists && claim.data()?.ownerUid !== ownerUid) {
        return { kind: "reject", reason: "CNPJ já utilizou o teste grátis" };
      }

      const trialEndsAt = cardTrialEndFrom(idx.firstDueDate, nowMs);
      const cardTrial: CardTrialInfo = {
        ...(base.cardTrial as CardTrialInfo),
        activatedAt: nowMs,
        subscriptionId: sub.id,
        rejectedReason: null,
      };
      tx.set(billingRef, {
        ...base,
        trialEndsAt,
        trialKind: "card",
        cardTrial,
        gateway: "asaas",
        subscriptionId: sub.id,
        subscriptionStatus: "authorized",
        cancelledAt: null,
        paymentMethod: "CREDIT_CARD",
        lastOrderNsu: idx.orderNsu,
        updatedAt: nowMs,
      } satisfies BillingDoc);
      tx.set(claimRef, {
        ownerUid,
        cnpj: idx.cnpj,
        checkoutId,
        subscriptionId: sub.id,
        claimedAt: nowMs,
      });
      tx.set(
        db.doc(checkoutIndexPath(checkoutId)),
        { status: "activated", subscriptionId: sub.id, updatedAt: nowMs },
        { merge: true }
      );
      return { kind: "ok", trialEndsAt };
    });

  if (outcome.kind === "reject") return reject(outcome.reason || "não elegível");

  // Garante que as cobranças futuras (PAYMENT_*) se liguem à conta pelo
  // externalReference, como no fluxo antigo. Melhor esforço: o índice cobre.
  if (sub.externalReference !== idx.orderNsu) {
    await setSubscriptionExternalReference(sub.id, idx.orderNsu).catch((e) =>
      console.warn("[cardTrial] não gravou externalReference:", e?.message || e)
    );
  }

  return {
    handled: true,
    ownerUid,
    contractId,
    activated: true,
    alreadyActive: outcome.kind === "already",
    trialEndsAt: outcome.trialEndsAt,
  };
}

/** Webhook SUBSCRIPTION_CREATED/UPDATED: relê a assinatura na API e tenta ativar. */
export async function activateCardTrialBySubscriptionId(db: any, subscriptionId: string): Promise<ActivateResult> {
  if (!subscriptionId) return { handled: false, reason: "id ausente" };
  const sub = await getSubscription(subscriptionId);
  return activateCardTrial(db, sub);
}

/**
 * Webhook CHECKOUT_PAID e retorno do cliente: parte do checkout (id só serve
 * de chave do índice) e procura na API a assinatura criada por ele.
 */
export async function activateCardTrialByCheckoutId(db: any, checkoutId: string): Promise<ActivateResult | { handled: true; pending: true; ownerUid: string; contractId: string }> {
  const idx = await loadCheckoutIndex(db, checkoutId);
  if (!idx || idx.kind !== "card_trial") return { handled: false, reason: "checkout desconhecido" };
  const sub = await findCheckoutSubscription(idx, checkoutId);
  if (!sub) return { handled: true, pending: true, ownerUid: idx.ownerUid, contractId: idx.contractId };
  // Relê pelo id (fonte única de verdade, mesmo formato do GET).
  return activateCardTrial(db, await getSubscription(sub.id));
}

/**
 * CHECKOUT_EXPIRED / CHECKOUT_CANCELED: o cliente abandonou. Se nenhuma
 * assinatura nasceu desse checkout, limpa o "pending" da conta pra ela poder
 * tentar de novo (o teste continua bloqueado até cadastrar o cartão).
 */
export async function closeAbandonedCardTrialCheckout(db: any, checkoutId: string, nowMs = Date.now()): Promise<boolean> {
  const idx = await loadCheckoutIndex(db, checkoutId);
  if (!idx || idx.kind !== "card_trial" || idx.status !== "pending") return false;
  // Defesa contra evento falso/atrasado: só fecha se a API não mostra assinatura.
  if (await findCheckoutSubscription(idx, checkoutId)) return false;

  const billingRef = db.doc(`users/${idx.ownerUid}/profile/billing`);
  await db.runTransaction(async (tx: any) => {
    const cur = await tx.get(billingRef);
    if (!cur.exists) return;
    const base = cur.data() as BillingDoc;
    if (base.cardTrial?.checkoutId !== checkoutId || base.cardTrial?.activatedAt) return;
    tx.set(
      billingRef,
      {
        subscriptionStatus: base.subscriptionStatus === "pending" ? null : base.subscriptionStatus ?? null,
        updatedAt: nowMs,
      },
      { merge: true }
    );
    tx.set(db.doc(checkoutIndexPath(checkoutId)), { status: "expired", updatedAt: nowMs }, { merge: true });
  });
  return true;
}
