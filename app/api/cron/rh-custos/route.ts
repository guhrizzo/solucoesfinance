// app/api/cron/rh-custos/route.ts
// GET (agendado — vercel.json, todo dia) → lança o custo de pessoas do mês
// anterior (se ainda aberto) e do mês atual nos centros de custo de cada conta
// com RH em uso. É o que garante o lançamento "todo mês, automaticamente",
// mesmo que ninguém abra a tela do RH. Idempotente (ids determinísticos).
//
// Proteção: header `Authorization: Bearer ${CRON_SECRET}`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { isCompedEmail } from "@/lib/compAccounts";
import { isProAccess, resolveSubscriptionState, type BillingDoc } from "@/lib/billing";
import { sincronizarDesde } from "@/lib/rh/server";
import { monthOf, todayKey } from "@/lib/rh/datas";

function mesAnterior(comp: string): string {
  const [y, m] = comp.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const db = await getAdminDb();
  const snap = await db.collectionGroup("rhColaboradores").select().get();
  const donos = new Set<string>();
  snap.docs.forEach((d) => { const uid = d.ref.parent.parent?.id; if (uid) donos.add(uid); });

  const desde = mesAnterior(monthOf(todayKey()));
  let ok = 0;
  let falhas = 0;
  for (const ownerUid of donos) {
    try {
      const b = await db.doc(`users/${ownerUid}/profile/billing`).get();
      const doc = (b.exists ? b.data() : null) as BillingDoc | null;
      let pro = isProAccess(resolveSubscriptionState(doc));
      if (!pro) {
        const email = await getAdminAuth().then((a) => a.getUser(ownerUid)).then((u) => u.email ?? null).catch(() => null);
        pro = isCompedEmail(email);
      }
      if (!pro) continue;
      await sincronizarDesde({ db, ownerUid }, desde);
      ok++;
    } catch (e) {
      falhas++;
      console.error(`Cron RH: falha na conta ${ownerUid}:`, e);
    }
  }
  return NextResponse.json({ contas: donos.size, sincronizadas: ok, falhas });
}
