export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { freshBillingDoc, resolveSubscriptionState, type BillingDoc } from "@/lib/billing";
import { isCompedEmail } from "@/lib/compAccounts";

// GET /api/billing/status
//
// Autenticado (qualquer usuário logado). Resolve a assinatura da CONTA (o dono
// — membros herdam) e, se ainda não existe o doc de billing, cria com o trial
// começando agora (idempotente). Retorna o estado já calculado.
//
// O client também escuta `users/{ownerUid}/profile/billing` via onSnapshot pra
// atualização ao vivo quando o webhook confirma um pagamento; esta rota existe
// pra garantir o bootstrap do trial sem depender de escrita pelo client
// (as regras do Firestore proíbem o client de escrever esse doc).

export async function GET(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }
  const ownerUid = scope.ownerUid;

  try {
    const db = await getAdminDb();
    const ref = db.doc(`users/${ownerUid}/profile/billing`);
    const snap = await ref.get();

    let doc: BillingDoc;
    if (!snap.exists) {
      doc = freshBillingDoc();
      await ref.set(doc);
    } else {
      doc = snap.data() as BillingDoc;
    }

    // Conta cortesia (adm supremo): se o DONO está na allowlist e o doc ainda
    // não foi marcado, marca agora. O client destrava via onSnapshot.
    if (!doc.comped) {
      let ownerEmail: string | null = null;
      try {
        ownerEmail = (await (await getAdminAuth()).getUser(ownerUid)).email ?? null;
      } catch {
        /* sem e-mail → trata como conta normal */
      }
      if (isCompedEmail(ownerEmail)) {
        const now = Date.now();
        await ref.set({ comped: true, updatedAt: now }, { merge: true });
        doc = { ...doc, comped: true, updatedAt: now };
      }
    }

    const state = resolveSubscriptionState(doc);
    return NextResponse.json({
      ...state,
      isOwner: scope.isOwner,
      trialEndsAt: doc.trialEndsAt,
      currentPeriodEnd: doc.currentPeriodEnd,
    });
  } catch (err: any) {
    console.error("Erro em /api/billing/status:", err);
    return NextResponse.json({ error: err?.message || "Erro ao consultar assinatura" }, { status: 500 });
  }
}
