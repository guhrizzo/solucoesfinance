// app/api/cron/receivable-reminders/route.ts
// GET (agendado — vercel.json, todo dia 08:00 de Brasília) → lembretes
// automáticos de vencimento das contas a receber com `autoReminder: true`:
//   • 5 dias antes do vencimento  (stage "d5")
//   • no dia do vencimento        (stage "d0")
// por e-mail e WhatsApp (se configurado — lib/whatsapp.ts). Só contas cujo
// DONO tem acesso Pro. Idempotente: `reminders.{stage}.dueDate` marca o que já
// foi enviado pra aquele vencimento, então rodar de novo no dia não duplica.
//
// Proteção: header `Authorization: Bearer ${CRON_SECRET}` (a Vercel manda
// sozinha quando CRON_SECRET está configurada no projeto).
//
// Índice: consulta de collectionGroup em `receivables.dueDate` — ver
// firestore.indexes.json (fieldOverrides) e `firebase deploy --only firestore:indexes`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { isCompedEmail } from "@/lib/compAccounts";
import { isProAccess, resolveSubscriptionState, type BillingDoc } from "@/lib/billing";
import { sendReceivableCharge, todaySP, type ReceivableChargeDoc } from "@/lib/receivableChargeSend";
import { isWhatsAppConfigured } from "@/lib/whatsapp";

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const db = await getAdminDb();
  const today = todaySP();
  const in5 = addDays(today, 5);
  const stageFor = (due: string) => (due === today ? "d0" : due === in5 ? "d5" : null);

  const snap = await db.collectionGroup("receivables").where("dueDate", "in", [today, in5]).get();

  // Plano Pro do dono — uma leitura por conta.
  const proCache = new Map<string, Promise<boolean>>();
  const ownerIsPro = (ownerUid: string) => {
    let p = proCache.get(ownerUid);
    if (!p) {
      p = (async () => {
        const b = await db.doc(`users/${ownerUid}/profile/billing`).get();
        const doc = (b.exists ? b.data() : null) as BillingDoc | null;
        if (isProAccess(resolveSubscriptionState(doc))) return true;
        const email = await getAdminAuth().then((a) => a.getUser(ownerUid)).then((u) => u.email ?? null).catch(() => null);
        return isCompedEmail(email);
      })();
      proCache.set(ownerUid, p);
    }
    return p;
  };

  const whatsapp = isWhatsAppConfigured();
  const summary = { candidates: snap.size, sent: 0, skipped: 0, emailOk: 0, whatsappOk: 0, errors: 0 };

  for (const d of snap.docs) {
    const r = d.data() as ReceivableChargeDoc;
    const ownerUid = d.ref.parent.parent?.id;
    const stage = stageFor(String(r.dueDate ?? ""));
    if (
      !ownerUid || !stage || !r.autoReminder || r.status === "recebido" ||
      r.reminders?.[stage]?.dueDate === r.dueDate ||
      !(await ownerIsPro(ownerUid))
    ) {
      summary.skipped++;
      continue;
    }
    try {
      const res = await sendReceivableCharge({
        db, ownerUid, receivableId: d.id, stage,
        channels: { email: !!r.partyEmail, whatsapp: whatsapp && !!r.partyPhone },
      });
      if (res.email?.ok) summary.emailOk++;
      if (res.whatsapp?.ok) summary.whatsappOk++;
      if (res.email?.ok || res.whatsapp?.ok) summary.sent++;
      else summary.errors++;
    } catch (err) {
      console.error(`Lembrete de cobrança falhou (${ownerUid}/${d.id}):`, err);
      summary.errors++;
    }
  }

  return NextResponse.json({ ok: true, today, in5, whatsapp, ...summary });
}
