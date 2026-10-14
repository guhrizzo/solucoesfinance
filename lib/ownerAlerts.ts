// lib/ownerAlerts.ts
// ─────────────────────────────────────────────────────────────────────────────
// Avisos por WhatsApp pro DONO da conta (SOMENTE server-side, Admin SDK).
//
// Quem recebe e o quê fica em users/{ownerUid}/profile/whatsappAlerts:
//   { phone, name, enabled: { caixa, estoque, contas }, lastResult }
// gravado pela aba "WhatsApp" de Configurações. Cadastrar o número e ligar o
// aviso é o opt-in que a Meta exige.
//
// Gatilhos:
//   • caixa   → fechamento de caixa do PDV (app/api/vendas/caixa)
//   • estoque → produto cruzou a quantidade mínima (lib/estoqueSync)
//   • contas  → resumo diário de contas a pagar que vencem hoje
//               (app/api/cron/owner-alerts)
//
// Recurso do plano Pro, como a cobrança por WhatsApp. Nunca lança erro: aviso
// que falha não pode derrubar a venda, o fechamento ou o webhook.
// ─────────────────────────────────────────────────────────────────────────────

import type { Firestore } from "firebase-admin/firestore";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { isCompedEmail } from "@/lib/compAccounts";
import { isProAccess, resolveSubscriptionState, type BillingDoc } from "@/lib/billing";
import { isWhatsAppConfigured, sendWhatsAppAlert, type WhatsAppResult } from "@/lib/whatsapp";

export const ALERT_KINDS = ["caixa", "estoque", "contas", "receber", "saldo", "categorizar", "orcamento", "resumo"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

export interface OwnerAlertsConfig {
  phone?: string;
  name?: string;
  enabled?: Partial<Record<AlertKind, boolean>>;
  /** Alerta de saldo: avisa se o saldo atual ficar abaixo disto (R$). */
  minBalance?: number;
  /** Alerta de saldo: quantos dias à frente projetar (padrão 15). */
  horizonDays?: number;
  /** Resumo: toda segunda ("semanal", padrão) ou dia 1 ("mensal"). */
  resumoFreq?: "semanal" | "mensal";
  /** Último dia (AAAA-MM-DD) em que cada aviso diário saiu — idempotência do cron. */
  sent?: Partial<Record<AlertKind, string>>;
  /** Nível (90/100) já avisado por centro de custo/mês. */
  sentBudget?: Record<string, number>;
}

/** Dono com acesso Pro (assinatura Pro ou conta cortesia). */
export async function ownerHasPro(db: Firestore, ownerUid: string): Promise<boolean> {
  try {
    const b = await db.doc(`users/${ownerUid}/profile/billing`).get();
    const doc = (b.exists ? b.data() : null) as BillingDoc | null;
    if (isProAccess(resolveSubscriptionState(doc))) return true;
    const email = await getAdminAuth().then((a) => a.getUser(ownerUid)).then((u) => u.email ?? null).catch(() => null);
    return isCompedEmail(email);
  } catch {
    return false;
  }
}

export async function readAlertsConfig(db: Firestore, ownerUid: string): Promise<OwnerAlertsConfig | null> {
  try {
    const snap = await db.doc(`users/${ownerUid}/profile/whatsappAlerts`).get();
    return snap.exists ? (snap.data() as OwnerAlertsConfig) : null;
  } catch {
    return null;
  }
}

async function companyName(db: Firestore, ownerUid: string): Promise<string> {
  try {
    const snap = await db.doc(`users/${ownerUid}/profile/company`).get();
    const c = snap.exists ? snap.data() : null;
    return String(c?.nomeFantasia || c?.razaoSocial || "").trim() || "sua empresa";
  } catch {
    return "sua empresa";
  }
}

export type NotifyResult = WhatsAppResult | { ok: false; reason: "disabled" | "not_pro" | "no_phone" };

/**
 * Manda o aviso se o dono ligou esse tipo, tem número e é Pro. `force` ignora
 * o liga/desliga (mensagem de teste). Guarda o resultado em `lastResult` pra
 * tela de Configurações mostrar se está funcionando.
 */
export async function notifyOwner(
  db: Firestore,
  ownerUid: string,
  kind: AlertKind | "teste",
  text: string,
  opts: { force?: boolean; cfg?: OwnerAlertsConfig; pro?: boolean; actions?: boolean } = {}
): Promise<NotifyResult> {
  try {
    if (!isWhatsAppConfigured()) return { ok: false, reason: "not_configured" };
    const cfg = opts.cfg ?? (await readAlertsConfig(db, ownerUid));
    if (!cfg?.phone) return { ok: false, reason: "no_phone" };
    if (!opts.force && (kind === "teste" || !cfg.enabled?.[kind])) return { ok: false, reason: "disabled" };
    if (!(opts.pro ?? (await ownerHasPro(db, ownerUid)))) return { ok: false, reason: "not_pro" };

    const res = await sendWhatsAppAlert({
      phone: cfg.phone,
      name: String(cfg.name || "").trim().split(/\s+/)[0] || "",
      companyName: await companyName(db, ownerUid),
      text,
      actions: opts.actions,
    });

    await db.doc(`users/${ownerUid}/profile/whatsappAlerts`).set({
      lastResult: {
        at: Date.now(),
        kind,
        ok: res.ok,
        ...(res.ok ? {} : { reason: res.reason, detail: String(res.detail ?? "").slice(0, 300) }),
      },
    }, { merge: true }).catch(() => undefined);

    if (!res.ok) console.error(`[ownerAlerts] ${kind} falhou (${ownerUid}):`, res.reason, res.detail);
    return res;
  } catch (err) {
    console.error(`[ownerAlerts] erro inesperado (${ownerUid}/${kind}):`, err);
    return { ok: false, reason: "api_error", detail: (err as Error)?.message };
  }
}

/** R$ 1.234,56 — os avisos saem em pt-BR (o template é pt_BR). */
export const brl = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);
