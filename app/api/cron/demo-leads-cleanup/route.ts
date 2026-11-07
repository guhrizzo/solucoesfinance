// app/api/cron/demo-leads-cleanup/route.ts
// GET (agendado — vercel.json, todo dia) → apaga leads da demo do Midas com
// expiresAt vencido (retenção de 12 meses).
// Proteção: header `Authorization: Bearer ${CRON_SECRET}`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { deleteExpiredLeads } from "@/lib/midas/leadServer";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const db = await getAdminDb();
  const deleted = await deleteExpiredLeads(db, Date.now());
  return NextResponse.json({ deleted });
}
