// lib/billing.ts
// Estado da assinatura de uma conta (o DONO — membros herdam). O documento
// mora em `users/{ownerUid}/profile/billing` e é gravado SOMENTE pelo servidor
// (Admin SDK): a conta lê pra saber se está liberada, mas nunca escreve
// (firestore.rules trava, no mesmo espírito de `profile/access`).
//
// Cada pagamento aprovado estende `currentPeriodEnd`. Assinaturas novas são
// RECORRENTES (o Mercado Pago cobra sozinho a cada ciclo e avisa por webhook);
// as antigas, pagas avulso pela InfinitePay, seguem valendo até o fim do período.
// `isActive` = agora < max(trialEndsAt, currentPeriodEnd [+ carência se há renovação automática]).

import { TRIAL_DAYS, type PlanId, getPlan } from "./billingPlans";
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
  /** Gateway da última cobrança. Ausente = legado (InfinitePay, avulso). */
  gateway?: "infinitepay" | "mercadopago";
  /** Id da assinatura recorrente no Mercado Pago (preapproval). */
  subscriptionId?: string | null;
  /** Estado da assinatura recorrente, espelhado do MP via webhook. */
  subscriptionStatus?: "pending" | "authorized" | "paused" | "cancelled" | null;
  /** Quando o cliente cancelou a renovação (ms epoch). O acesso pago segue até `currentPeriodEnd`. */
  cancelledAt?: number | null;
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
  /** true = há assinatura recorrente autorizada (o MP cobra o próximo ciclo sozinho). */
  autoRenews: boolean;
  /** true = o cliente cancelou a renovação; o acesso vale só até `accessUntil`. */
  cancelled: boolean;
  /** true = passou do fim do período mas ainda está na carência (cobrança sendo reprocessada). */
  inGrace: boolean;
}

/**
 * Tolerância depois do fim do período quando há assinatura recorrente
 * autorizada: a cobrança do ciclo pode atrasar ou ser reprocessada pelo MP
 * (cartão recusado, Pix pendente) e não queremos travar o cliente na hora.
 */
export const RENEWAL_GRACE_DAYS = 3;

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
      autoRenews: false,
      cancelled: false,
      inGrace: false,
    };
  }

  const trialEndsAt = Number(doc?.trialEndsAt) || 0;
  const currentPeriodEnd = Number(doc?.currentPeriodEnd) || 0;
  const autoRenews = doc?.subscriptionStatus === "authorized";
  const cancelled = doc?.subscriptionStatus === "cancelled";

  // Só quem tem renovação automática viva ganha carência; cancelada/pausada/
  // legada vence exatamente no fim do período.
  const graceMs = autoRenews && currentPeriodEnd ? RENEWAL_GRACE_DAYS * 24 * 60 * 60 * 1000 : 0;
  const paidActive = currentPeriodEnd > 0 && nowMs < currentPeriodEnd + graceMs;
  const trialActive = nowMs < trialEndsAt;

  const accessUntil = Math.max(trialEndsAt, currentPeriodEnd);
  const isActive = paidActive || trialActive;
  const inTrial = trialActive && !paidActive;
  const inGrace = paidActive && nowMs >= currentPeriodEnd;

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
    autoRenews,
    cancelled,
    inGrace,
  };
}

/**
 * Recurso exclusivo do plano Pro (ex.: leitor de NF em /impostos). Trial
 * (`plan === null`) NÃO conta como Pro — decisão de produto: só quem já
 * pagou o Pro (ou conta cortesia) libera. Usar tanto no cliente
 * (`useSubscription`) quanto no servidor (lendo `profile/billing` direto).
 */
export function isProAccess(state: Pick<SubscriptionState, "plan" | "comped">): boolean {
  if (state.comped) return true;
  if (!state.plan) return false;
  return getPlan(state.plan)?.tier === "pro";
}
