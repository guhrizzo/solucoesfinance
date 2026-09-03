export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { freshBillingDoc, resolveSubscriptionState, type BillingDoc } from "@/lib/billing";

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
