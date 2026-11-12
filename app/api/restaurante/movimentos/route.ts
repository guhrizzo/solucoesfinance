export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, after } from "next/server";
import { avisarCruzamentos, guardRestaurante, isCtx, lerCorpo, respostaErro } from "@/lib/restaurante/server";
import { COL, registrarAjuste, registrarEntrada } from "@/lib/restaurante/service";
import { toMovimento } from "@/lib/restaurante/docs";

// Movimentos de estoque: log IMUTÁVEL (não há PATCH/DELETE). Correção = novo
// movimento de ajuste. POST acao: "entrada" (compra, recalcula custo médio),
// "ajuste" (contagem física → novo saldo) ou "perda" (desperdício).

export async function GET(request: Request) {
  const ctx = await guardRestaurante(request, "mov-get");
  if (!isCtx(ctx)) return ctx;
  try {
    const url = new URL(request.url);
    const ingredienteId = url.searchParams.get("ingredienteId");
    const limite = Math.min(500, Math.max(1, Number(url.searchParams.get("limite")) || 200));
    // Sem índice composto: pega os mais recentes e filtra em memória.
    const snap = await ctx.db.collection(`users/${ctx.ownerUid}/${COL.movimentos}`).orderBy("em", "desc").limit(ingredienteId ? 500 : limite).get();
    const movimentos = snap.docs
      .map((d) => toMovimento(d.id, d.data()))
      .filter((m) => !ingredienteId || m.ingredienteId === ingredienteId)
      .slice(0, limite);
    return NextResponse.json({ movimentos });
  } catch (e) {
    return respostaErro(e, "movimentos GET");
  }
}

export async function POST(request: Request) {
  const ctx = await guardRestaurante(request, "mov-post", 60);
  if (!isCtx(ctx)) return ctx;
  try {
    const body = await lerCorpo(request);
    let r;
    if (body.acao === "entrada") r = await registrarEntrada(ctx, body);
    else if (body.acao === "ajuste" || body.acao === "perda") r = await registrarAjuste(ctx, { ...body, tipo: body.acao });
    else return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    if (r.cruzamentos.length) after(() => avisarCruzamentos(ctx, r.cruzamentos));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaErro(e, "movimentos POST");
  }
}
