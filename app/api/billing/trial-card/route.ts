export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { isCompedEmail } from "@/lib/compAccounts";
import { requireCardTrial } from "@/lib/billingCardTrial";

// POST /api/billing/trial-card
//
// Chamada pelo cadastro que veio do CTA do Midas (?trial=cartao). Marca a
// conta RECÉM-CRIADA como "teste só com cartão": ela não ganha os 7 dias
// padrão; o teste começa quando o Asaas validar o cartão no checkout.
//
// Autenticado, só o dono. Não age em conta antiga, cortesia ou que já tem
// assinatura (ver requireCardTrial) — ou seja, não tira acesso de ninguém.

export async function POST(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }
  if (!scope.isOwner) {
    return NextResponse.json({ ok: false, reason: "não é o titular" }, { status: 403 });
  }

  try {
    const rec = await (await getAdminAuth()).getUser(scope.ownerUid);
    if (isCompedEmail(rec.email)) {
      return NextResponse.json({ ok: false, reason: "conta cortesia" });
    }
    const createdAt = Date.parse(rec.metadata?.creationTime || "") || 0;
    const db = await getAdminDb();
    const r = await requireCardTrial(db, scope.ownerUid, createdAt);
    return NextResponse.json(r);
  } catch (err: any) {
    console.error("Erro em /api/billing/trial-card:", err);
    return NextResponse.json({ ok: false, error: "Falha ao preparar o teste com cartão." }, { status: 500 });
  }
}
