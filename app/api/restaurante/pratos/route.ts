export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRestaurante, isCtx, lerCorpo, respostaErro } from "@/lib/restaurante/server";
import { atualizarPrato, carregarTudo, criarPrato, excluirPrato } from "@/lib/restaurante/service";
import { custoPrato } from "@/lib/restaurante/ficha";
import { faltasPrato } from "@/lib/restaurante/alertas";

// Pratos (cardápio) + ficha técnica. O custo/margem é sempre calculado aqui a
// partir do custo médio atual dos ingredientes — nunca gravado pelo client.

export async function GET(request: Request) {
  const ctx = await guardRestaurante(request, "prato-get");
  if (!isCtx(ctx)) return ctx;
  try {
    const { ingredientes, pratos } = await carregarTudo(ctx);
    const porId = new Map(ingredientes.map((i) => [i.id, i]));
    return NextResponse.json({
      pratos: pratos
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        .map((p) => ({ ...p, custo: custoPrato(p, porId), indisponivel: faltasPrato(p, porId) })),
    });
  } catch (e) {
    return respostaErro(e, "pratos GET");
  }
}

export async function POST(request: Request) {
  const ctx = await guardRestaurante(request, "prato-post", 40);
  if (!isCtx(ctx)) return ctx;
  try {
    return NextResponse.json({ ok: true, ...(await criarPrato(ctx, await lerCorpo(request))) });
  } catch (e) {
    return respostaErro(e, "pratos POST");
  }
}

export async function PATCH(request: Request) {
  const ctx = await guardRestaurante(request, "prato-patch", 60);
  if (!isCtx(ctx)) return ctx;
  try {
    const body = await lerCorpo(request);
    await atualizarPrato(ctx, String(body.id ?? ""), body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaErro(e, "pratos PATCH");
  }
}

export async function DELETE(request: Request) {
  const ctx = await guardRestaurante(request, "prato-delete", 30);
  if (!isCtx(ctx)) return ctx;
  try {
    await excluirPrato(ctx, new URL(request.url).searchParams.get("id") ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaErro(e, "pratos DELETE");
  }
}
