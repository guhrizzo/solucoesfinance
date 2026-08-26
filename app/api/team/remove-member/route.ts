// app/api/team/remove-member/route.ts
// Revoga o acesso de um membro: desabilita o login no Firebase Auth (não
// deleta a conta — reversível via update-member, que reativa se o admin
// liberar alguma categoria de novo) e zera as permissões nos dois docs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireOwner } from "@/lib/teamAuth";

export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const memberUid = typeof body?.memberUid === "string" ? body.memberUid : "";
  if (!memberUid) return NextResponse.json({ error: "Membro inválido." }, { status: 400 });

  const db = await getAdminDb();
  const teamRef = db.doc(`users/${auth.ownerUid}/team/${memberUid}`);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });

  const adminAuth = await getAdminAuth();
  await adminAuth.updateUser(memberUid, { disabled: true }).catch(() => {});

  try {
    const batch = db.batch();
    batch.update(teamRef, { status: "revoked", permissions: [] });
    batch.update(db.doc(`users/${memberUid}/profile/access`), { permissions: [] });
    await batch.commit();
  } catch (err) {
    console.error("Erro ao revogar acesso de equipe:", err);
    return NextResponse.json({ error: "Não foi possível revogar agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
