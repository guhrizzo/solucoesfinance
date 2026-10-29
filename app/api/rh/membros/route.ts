export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRh, isCtx } from "@/lib/rh/server";

// Usuários do sistema que podem ser vinculados a um colaborador (a equipe da
// conta + o próprio dono). O vínculo dá ao usuário a visão "meus indicadores".

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "membros-get");
    if (!isCtx(ctx)) return ctx;
    const snap = await ctx.db.collection("users").doc(ctx.ownerUid).collection("team").get();
    const membros = snap.docs
      .map((d) => ({ uid: d.id, nome: String(d.data().displayName || d.data().email || d.id), email: String(d.data().email ?? "") }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return NextResponse.json({ ownerUid: ctx.ownerUid, membros });
  } catch (error) {
    console.error("Erro RH/membros GET:", error);
    return NextResponse.json({ error: "Erro ao carregar a equipe." }, { status: 500 });
  }
}
