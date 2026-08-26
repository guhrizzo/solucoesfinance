// app/api/team/update-member/route.ts
// Atualiza as permissões (por categoria) de um membro já existente. Se o
// membro estava com o acesso revogado (status "revoked", conta desabilitada
// no Firebase Auth) e o admin liberou pelo menos uma categoria de novo,
// reativa o login automaticamente — o admin não precisa de um botão à parte
// pra "desfazer" a revogação.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireOwner } from "@/lib/teamAuth";
import { PERMISSION_CATEGORIES, type PermissionKey } from "@/lib/accountScope";

const VALID_KEYS = new Set<string>(PERMISSION_CATEGORIES.map((c) => c.key));

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
  const permissions = (Array.isArray(body?.permissions) ? body.permissions : []).filter(
    (p: unknown): p is PermissionKey => typeof p === "string" && VALID_KEYS.has(p)
  );
  if (!memberUid) return NextResponse.json({ error: "Membro inválido." }, { status: 400 });

  const db = await getAdminDb();
  const teamRef = db.doc(`users/${auth.ownerUid}/team/${memberUid}`);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });

  const wasRevoked = teamSnap.data()?.status === "revoked";
  const nextStatus = wasRevoked && permissions.length > 0 ? "active" : (teamSnap.data()?.status ?? "active");

  try {
    const batch = db.batch();
    batch.update(teamRef, { permissions, status: nextStatus });
    batch.update(db.doc(`users/${memberUid}/profile/access`), { permissions });
    await batch.commit();

    if (wasRevoked && nextStatus === "active") {
      const adminAuth = await getAdminAuth();
      await adminAuth.updateUser(memberUid, { disabled: false }).catch(() => {});
    }
  } catch (err) {
    console.error("Erro ao atualizar permissões de equipe:", err);
    return NextResponse.json({ error: "Não foi possível salvar agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
