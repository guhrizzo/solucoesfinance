export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isWhatsAppConfigured, toWhatsAppNumber } from "@/lib/whatsapp";
import { isProAccess } from "@/lib/billing";
import { resolveScopeSubscription } from "@/lib/scopeSubscription";
import { ALERT_KINDS, notifyOwner, readAlertsConfig, type AlertKind } from "@/lib/ownerAlerts";

const KINDS = ALERT_KINDS;
const RATE_LIMIT = { windowMs: 60_000, max: 10 };

/**
 * Avisos por WhatsApp pro dono da conta (aba "WhatsApp" de Configurações).
 *
 *   GET                                   → { configured, pro, config }
 *   POST { action: "save", phone, name, enabled: { caixa, estoque, contas, receber, saldo, categorizar, orcamento, resumo },
 *       minBalance?, horizonDays?, resumoFreq?: "semanal" | "mensal" }
 *   POST { action: "test" }               → manda uma mensagem de teste
 *
 * Só o DONO da conta altera (o número é dele). Ver lib/ownerAlerts.ts.
 */
export async function GET(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) return NextResponse.json({ error: scope.error }, { status: scope.status });
  const db = await getAdminDb();
  const [state, cfg] = await Promise.all([resolveScopeSubscription(db, scope), readAlertsConfig(db, scope.ownerUid)]);
  return NextResponse.json({
    configured: isWhatsAppConfigured(),
    pro: isProAccess(state),
    isOwner: scope.isOwner,
    config: cfg ?? {},
  });
}

export async function POST(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) return NextResponse.json({ error: scope.error }, { status: scope.status });
  if (!scope.isOwner) {
    return NextResponse.json({ error: "Só o dono da conta altera os avisos por WhatsApp." }, { status: 403 });
  }

  const { limited, retryAfterSec } = checkRateLimit(
    `wa-alerts:${getClientIp(request)}:${scope.ownerUid}`, RATE_LIMIT, scope.isSupremeAdmin
  );
  if (limited) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  const db = await getAdminDb();
  if (!isProAccess(await resolveScopeSubscription(db, scope))) {
    return NextResponse.json({ error: "Os avisos por WhatsApp são exclusivos do plano Pro." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const ref = db.doc(`users/${scope.ownerUid}/profile/whatsappAlerts`);

  if (body.action === "save") {
    const rawPhone = String(body.phone ?? "").trim();
    if (rawPhone && !toWhatsAppNumber(rawPhone)) {
      return NextResponse.json({ error: "Número inválido. Use DDD + número, ex.: (11) 91234-5678." }, { status: 400 });
    }
    const enabled = {} as Record<AlertKind, boolean>;
    for (const k of KINDS) enabled[k] = body.enabled?.[k] === true;
    await ref.set({
      phone: rawPhone ? rawPhone.replace(/\D/g, "") : "",
      // Formato E.164: o webhook de entrada acha a conta por ele (lib/whatsappInbound.ts).
      phoneE164: toWhatsAppNumber(rawPhone) ?? "",
      name: String(body.name ?? "").trim().slice(0, 60),
      enabled,
      // Marca pro cron achar quem tem aviso ligado sem varrer todas as contas.
      alertsActive: !!rawPhone && KINDS.some((k) => enabled[k]),
      minBalance: Math.min(1e9, Math.max(0, Number(body.minBalance) || 0)),
      horizonDays: Math.min(90, Math.max(1, Math.round(Number(body.horizonDays) || 15))),
      resumoFreq: body.resumoFreq === "mensal" ? "mensal" : "semanal",
      updatedAt: Date.now(),
      updatedBy: scope.uid,
    }, { merge: true });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "test") {
    const res = await notifyOwner(db, scope.ownerUid, "teste",
      "esta é uma mensagem de teste. Os avisos por WhatsApp estão funcionando", { force: true });
    if (res.ok) return NextResponse.json({ ok: true });
    const msg: Record<string, string> = {
      not_configured: "O WhatsApp da plataforma ainda não foi configurado.",
      no_phone: "Salve um número antes de testar.",
      invalid_phone: "O número salvo é inválido.",
      not_pro: "Os avisos por WhatsApp são exclusivos do plano Pro.",
      api_error: "A Meta recusou o envio.",
    };
    return NextResponse.json(
      { error: msg[res.reason] ?? "Não foi possível enviar.", detail: "detail" in res ? res.detail : undefined },
      { status: 502 }
    );
  }

  return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
}
