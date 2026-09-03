// lib/billing.ts
// Estado da assinatura de uma conta (o DONO — membros herdam). O documento
// mora em `users/{ownerUid}/profile/billing` e é gravado SOMENTE pelo servidor
// (Admin SDK): a conta lê pra saber se está liberada, mas nunca escreve
// (firestore.rules trava, no mesmo espírito de `profile/access`).
//
// Modelo pré-pago: não há débito automático. Cada pagamento estende
// `currentPeriodEnd`. `isActive` = agora < max(trialEndsAt, currentPeriodEnd).

import { TRIAL_DAYS, type PlanId } from "./billingPlans";

export interface BillingDoc {
  /** Fim do período de trial (ms epoch). Definido na criação da conta. */
  trialEndsAt: number;
  /** Fim do período pago (ms epoch). null = nunca pagou. */
  currentPeriodEnd: number | null;
  plan: PlanId | null;
  lastTransactionNsu: string | null;
  lastOrderNsu: string | null;
  lastPaidAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type BillingStatus = "trialing" | "active" | "past_due";

export interface SubscriptionState {
  status: BillingStatus;
  isActive: boolean;
  /** Fim do acesso vigente (trial ou pago), ms epoch. */
  accessUntil: number;
  /** Dias inteiros restantes de acesso (0 se já venceu). */
  daysLeft: number;
  plan: PlanId | null;
  inTrial: boolean;
}

export function trialEndFrom(startMs: number): number {
  return startMs + TRIAL_DAYS * 24 * 60 * 60 * 1000;
}

/** Doc inicial de uma conta dona nova (trial começa agora). */
export function freshBillingDoc(nowMs = Date.now()): BillingDoc {
  return {
    trialEndsAt: trialEndFrom(nowMs),
    currentPeriodEnd: null,
    plan: null,
    lastTransactionNsu: null,
    lastOrderNsu: null,
    lastPaidAt: null,
    createdAt: nowMs,
    updatedAt: nowMs,
  };
}

/** Estende o período pago em `months` meses a partir do maior entre agora e o fim atual. */
export function extendPeriod(current: number | null, months: number, nowMs = Date.now()): number {
  const base = Math.max(nowMs, current ?? 0);
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d.getTime();
}

export function resolveSubscriptionState(
  doc: Partial<BillingDoc> | null | undefined,
  nowMs = Date.now()
): SubscriptionState {
  const trialEndsAt = Number(doc?.trialEndsAt) || 0;
  const currentPeriodEnd = Number(doc?.currentPeriodEnd) || 0;
  const accessUntil = Math.max(trialEndsAt, currentPeriodEnd);
  const isActive = nowMs < accessUntil;
  const inTrial = isActive && currentPeriodEnd <= nowMs;

  const status: BillingStatus = !isActive ? "past_due" : inTrial ? "trialing" : "active";
  const daysLeft = isActive ? Math.ceil((accessUntil - nowMs) / (24 * 60 * 60 * 1000)) : 0;

  return {
    status,
    isActive,
    accessUntil,
    daysLeft,
    plan: (doc?.plan as PlanId) || null,
    inTrial,
  };
}
