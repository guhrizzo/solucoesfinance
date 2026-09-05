// lib/billing.ts
// Estado da assinatura de uma conta (o DONO — membros herdam). O documento
// mora em `users/{ownerUid}/profile/billing` e é gravado SOMENTE pelo servidor
// (Admin SDK): a conta lê pra saber se está liberada, mas nunca escreve
// (firestore.rules trava, no mesmo espírito de `profile/access`).
//
// Modelo pré-pago: não há débito automático. Cada pagamento estende
// `currentPeriodEnd`. `isActive` = agora < max(trialEndsAt, currentPeriodEnd).

import { TRIAL_DAYS, type PlanId } from "./billingPlans";
import { COMP_ACCESS_UNTIL } from "./compAccounts";

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
  /**
   * Conta "cortesia" (adm supremo): acesso vitalício, nunca cobrada.
   * Marcado pelo servidor quando o dono está em lib/compAccounts.
   */
  comped?: boolean;
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
  /** true = conta cortesia (adm supremo): sempre ativa, nunca cobrada. */
  comped: boolean;
}

export function trialEndFrom(startMs: number): number {
  return startMs + TRIAL_DAYS * 24 * 60 * 60 * 1000;
}

// Fuso de referência pro "dias restantes" exibido na UI (banner de trial e
// paywall). Fixo em vez de usar o fuso da máquina porque esse cálculo roda
// tanto no servidor (rota /api/billing/status, geralmente UTC) quanto no
// navegador (listener do Firestore em useSubscription) — sem um fuso comum,
// os dois lados podem discordar em 1 dia perto da virada.
//
// Isso é só de exibição: o bloqueio de acesso (`isActive`) continua sendo
// decidido pelo milissegundo exato de `accessUntil`, então ninguém ganha
// nem perde acesso por causa disso.
const TRIAL_DISPLAY_TZ = "America/Sao_Paulo";

/** "YYYY-MM-DD" de um instante, num fuso fixo — usado só pra comparar dias. */
function calendarDateKey(ms: number, timeZone = TRIAL_DISPLAY_TZ): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

/** Diferença em dias de calendário (não em blocos de 24h) entre dois instantes. */
function calendarDaysBetween(fromMs: number, toMs: number, timeZone = TRIAL_DISPLAY_TZ): number {
  const [fy, fm, fd] = calendarDateKey(fromMs, timeZone).split("-").map(Number);
  const [ty, tm, td] = calendarDateKey(toMs, timeZone).split("-").map(Number);
  const fromUTC = Date.UTC(fy, fm - 1, fd);
  const toUTC = Date.UTC(ty, tm - 1, td);
  return Math.round((toUTC - fromUTC) / (24 * 60 * 60 * 1000));
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
  // Conta cortesia (adm supremo): acesso vitalício, sem trial e sem cobrança.
  if (doc?.comped) {
    return {
      status: "active",
      isActive: true,
      accessUntil: COMP_ACCESS_UNTIL,
      daysLeft: Math.ceil((COMP_ACCESS_UNTIL - nowMs) / (24 * 60 * 60 * 1000)),
      plan: (doc?.plan as PlanId) || null,
      inTrial: false,
      comped: true,
    };
  }

  const trialEndsAt = Number(doc?.trialEndsAt) || 0;
  const currentPeriodEnd = Number(doc?.currentPeriodEnd) || 0;
  const accessUntil = Math.max(trialEndsAt, currentPeriodEnd);
  const isActive = nowMs < accessUntil;
  const inTrial = isActive && currentPeriodEnd <= nowMs;

  const status: BillingStatus = !isActive ? "past_due" : inTrial ? "trialing" : "active";
  // Dia de calendário, não bloco de 24h: decrementa na virada da meia-noite
  // (fuso fixo acima), então "criei ontem" já mostra 1 dia a menos hoje —
  // em vez de só decrementar 24h exatas depois da criação.
  const daysLeft = isActive ? Math.max(0, calendarDaysBetween(nowMs, accessUntil)) : 0;

  return {
    status,
    isActive,
    accessUntil,
    daysLeft,
    plan: (doc?.plan as PlanId) || null,
    inTrial,
    comped: false,
  };
}
