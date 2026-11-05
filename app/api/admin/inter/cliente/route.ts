// app/api/admin/inter/cliente/route.ts
//
// POST { email } — adm supremo busca o cliente (dono da conta) pelo e-mail.
// Devolve { ok, nome, email, pro, conexao } — NUNCA o uid nem segredo. É só
// consulta (sem auditoria); as rotas de escrita re-resolvem o e-mail sozinhas
// e não confiam nesta busca.

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { errCode } from "@/lib/interErrors";
import { INVALID_BODY_ERROR, pickInterStatus } from "@/lib/interAdminRoutes";
import { guardAdmin, readJson, resolveAdminTarget } from "../_guard";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const g = await guardAdmin(req);
  if (g instanceof NextResponse) return g;

  const body = await readJson(req);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: INVALID_BODY_ERROR }, { status: 400 });
  }

  const alvo = await resolveAdminTarget((body as Record<string, unknown>).email);
  if (!alvo.ok) return NextResponse.json({ error: alvo.error }, { status: alvo.status });

  let conexao;
  try {
    const db = await getAdminDb();
    const snap = await db.doc(`users/${alvo.ownerUid}/profile/interStatus`).get();
    conexao = snap.exists ? pickInterStatus(snap.data()) : null;
  } catch (e) {
    console.error("[admin/inter/cliente] falha ao ler status:", errCode(e));
    return NextResponse.json({ error: "Não foi possível ler o status da conexão do cliente." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, nome: alvo.nome, email: alvo.email, pro: alvo.pro, conexao });
}
