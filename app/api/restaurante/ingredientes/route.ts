export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRestaurante, isCtx, lerCorpo, respostaErro } from "@/lib/restaurante/server";
import { atualizarIngrediente, COL, criarIngrediente, excluirIngrediente } from "@/lib/restaurante/service";
import { toIngrediente } from "@/lib/restaurante/docs";

// Ingredientes (estoque do restaurante). Quantidades/custo chegam na unidade
// de exibição e são gravados na unidade base (lib/restaurante/validate.ts).
// O saldo só muda por movimento (/api/restaurante/movimentos), nunca aqui.

export async function GET(request: Request) {
  const ctx = await guardRestaurante(request, "ing-get");
  if (!isCtx(ctx)) return ctx;
  try {
    const snap = await ctx.db.collection(`users/${ctx.ownerUid}/${COL.ingredientes}`).get();
    const ingredientes = snap.docs.map((d) => toIngrediente(d.id, d.data())).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return NextResponse.json({ ingredientes });
  } catch (e) {
    return respostaErro(e, "ingredientes GET");
  }
}

export async function POST(request: Request) {
  const ctx = await guardRestaurante(request, "ing-post", 40);
  if (!isCtx(ctx)) return ctx;
  try {
    return NextResponse.json({ ok: true, ...(await criarIngrediente(ctx, await lerCorpo(request))) });
  } catch (e) {
    return respostaErro(e, "ingredientes POST");
  }
}

export async function PATCH(request: Request) {
  const ctx = await guardRestaurante(request, "ing-patch", 60);
  if (!isCtx(ctx)) return ctx;
  try {
    const body = await lerCorpo(request);
    await atualizarIngrediente(ctx, String(body.id ?? ""), body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaErro(e, "ingredientes PATCH");
  }
}

export async function DELETE(request: Request) {
  const ctx = await guardRestaurante(request, "ing-delete", 30);
  if (!isCtx(ctx)) return ctx;
  try {
    await excluirIngrediente(ctx, new URL(request.url).searchParams.get("id") ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaErro(e, "ingredientes DELETE");
  }
}
