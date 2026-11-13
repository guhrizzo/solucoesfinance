// app/api/cron/inter-sync/route.ts
// GET (agendado — vercel.json, todo dia) → sincroniza o extrato do Banco Inter
// de todas as contas conectadas (integracoesBanco), as mais atrasadas primeiro
// (lastSyncAt crescente, sem cursor na frente). Pula contas sem Pro. Respeita
// um orçamento de tempo: o que não couber fica para a próxima execução (como a
// fila é por lastSyncAt, quem ficou de fora vai para a frente). Uma conta com
// falha não interrompe as outras. Idempotente (txKey como id).
//
// Proteção: header `Authorization: Bearer ${CRON_SECRET}`.
// Logs: só contagens e códigos de erro — nunca segredo nem extrato.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { isCompedEmail } from "@/lib/compAccounts";
import { isProAccess, resolveSubscriptionState, type BillingDoc } from "@/lib/billing";
import { InterSyncError, syncOwner } from "@/lib/interSync";

/** Para de PEGAR contas novas 30 s antes do maxDuration. */
const ORCAMENTO_MS = (maxDuration - 30) * 1000;
const CONCORRENCIA = 3;

async function temPro(db: Awaited<ReturnType<typeof getAdminDb>>, ownerUid: string): Promise<boolean> {
  const b = await db.doc(`users/${ownerUid}/profile/billing`).get();
  const doc = (b.exists ? b.data() : null) as BillingDoc | null;
  if (isProAccess(resolveSubscriptionState(doc))) return true;
  const email = await getAdminAuth().then((a) => a.getUser(ownerUid)).then((u) => u.email ?? null).catch(() => null);
  return isCompedEmail(email);
}

export async function GET(request: Request) {
  const inicio = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!process.env.INTER_ENC_KEY?.trim()) {
    return NextResponse.json({ error: "INTER_ENC_KEY não configurada." }, { status: 500 });
  }

  const db = await getAdminDb();
  // Sem orderBy no Firestore: ele descartaria quem ainda não tem lastSyncAt.
  const snap = await db.collection("integracoesBanco").select("lastSyncAt").get();
  const fila = snap.docs
    .map((d) => ({ ownerUid: d.id, last: typeof d.get("lastSyncAt") === "number" ? (d.get("lastSyncAt") as number) : -1 }))
    .sort((a, b) => a.last - b.last)
    .map((x) => x.ownerUid);

  let sincronizadas = 0;
  let falhas = 0;
  let puladas = 0;
  let proximo = 0;

  const worker = async () => {
    while (proximo < fila.length && Date.now() - inicio < ORCAMENTO_MS) {
      const ownerUid = fila[proximo++];
      try {
        if (!(await temPro(db, ownerUid))) {
          puladas++;
          continue;
        }
        await syncOwner(db, ownerUid);
        sincronizadas++;
      } catch (e) {
        falhas++;
        // syncOwner já gravou lastSyncError da conta; aqui só o tipo/código.
        const motivo = e instanceof InterSyncError ? e.kind : (typeof (e as { code?: unknown })?.code === "string" ? (e as { code: string }).code : "sem-codigo");
        console.error(`Cron Inter: falha na conta ${ownerUid}:`, motivo);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCORRENCIA, fila.length) }, worker));

  const restantes = fila.length - proximo;
  return NextResponse.json({ contas: fila.length, sincronizadas, falhas, puladas, restantes });
}
