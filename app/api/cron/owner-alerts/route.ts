// app/api/cron/owner-alerts/route.ts
// GET (agendado — vercel.json, todo dia 08:05 de Brasília) → avisos diários por
// WhatsApp pro dono da conta: contas a pagar/receber (D-3, D-1, hoje, atraso),
// saldo projetado, lançamentos sem categoria, orçamento e resumo semanal/mensal
// (lib/ownerDigest.ts). Só quem ligou algum aviso em Configurações > WhatsApp
// (campo `alertsActive` no profile/whatsappAlerts) e é Pro (lib/ownerAlerts.ts).
//
// Proteção: header `Authorization: Bearer ${CRON_SECRET}` (a Vercel manda
// sozinha quando CRON_SECRET está configurada no projeto).
//
// Índice: collectionGroup em `profile.alertsActive` — ver firestore.indexes.json
// (fieldOverrides) e `firebase deploy --only firestore:indexes`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { todaySP } from "@/lib/receivableChargeSend";
import { isWhatsAppConfigured } from "@/lib/whatsapp";
import { ownerHasPro, type OwnerAlertsConfig } from "@/lib/ownerAlerts";
import { runOwnerDigest } from "@/lib/ownerDigest";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!isWhatsAppConfigured()) {
    return NextResponse.json({ ok: true, skipped: "whatsapp_not_configured" });
  }

  const db = await getAdminDb();
  const today = todaySP();
  const snap = await db.collectionGroup("profile").where("alertsActive", "==", true).get();

  const summary = { owners: 0, sent: 0, skipped: 0, errors: 0 };
  for (const d of snap.docs) {
    const ownerUid = d.ref.parent.parent?.id;
    if (d.id !== "whatsappAlerts" || !ownerUid) continue;
    summary.owners++;
    try {
      const cfg = d.data() as OwnerAlertsConfig;
      if (!cfg.phone || !(await ownerHasPro(db, ownerUid))) { summary.skipped++; continue; }
      const r = await runOwnerDigest(db, ownerUid, cfg, today);
      summary.sent += r.sent; summary.skipped += r.skipped; summary.errors += r.errors;
    } catch (err) {
      console.error(`[owner-alerts] falhou (${ownerUid}):`, err);
      summary.errors++;
    }
  }

  return NextResponse.json({ ok: true, today, ...summary });
}
