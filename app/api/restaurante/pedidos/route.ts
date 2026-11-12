export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, after } from "next/server";
import { avisarCruzamentos, guardRestaurante, isCtx, lerCorpo, respostaErro } from "@/lib/restaurante/server";
import { COL, criarPedido, editarPedido, mudarStatus } from "@/lib/restaurante/service";
import { toPedido } from "@/lib/restaurante/docs";

// Pedidos. Criar/editar recalculam itens e total a partir do cardápio.
// PATCH acao "status": transição (a baixa de estoque acontece UMA vez em
// recebido→em_preparo, dentro de transação; reenvio é idempotente). Não há
// exclusão: pedido é histórico — corrige-se cancelando e criando outro.

export async function GET(request: Request) {
  const ctx = await guardRestaurante(request, "ped-get", 120);
  if (!isCtx(ctx)) return ctx;
  try {
    const base = ctx.db.collection(`users/${ctx.ownerUid}/${COL.pedidos}`);
    const [abertos, recentes] = await Promise.all([
      base.where("status", "in", ["recebido", "em_preparo", "pronto"]).get(),
      base.orderBy("criadoEm", "desc").limit(60).get(),
    ]);
    const mapa = new Map<string, ReturnType<typeof toPedido>>();
    for (const d of [...abertos.docs, ...recentes.docs]) mapa.set(d.id, toPedido(d.id, d.data()));
    return NextResponse.json({ pedidos: [...mapa.values()].sort((a, b) => b.criadoEm - a.criadoEm) });
  } catch (e) {
    return respostaErro(e, "pedidos GET");
  }
}

export async function POST(request: Request) {
  const ctx = await guardRestaurante(request, "ped-post", 60);
  if (!isCtx(ctx)) return ctx;
  try {
    return NextResponse.json({ ok: true, ...(await criarPedido(ctx, await lerCorpo(request))) });
  } catch (e) {
    return respostaErro(e, "pedidos POST");
  }
}

export async function PATCH(request: Request) {
  const ctx = await guardRestaurante(request, "ped-patch", 120);
  if (!isCtx(ctx)) return ctx;
  try {
    const body = await lerCorpo(request);
    const id = String(body.id ?? "");
    if (body.acao === "editar") {
      await editarPedido(ctx, id, body);
      return NextResponse.json({ ok: true });
    }
    if (body.acao === "status") {
      const r = await mudarStatus(ctx, id, body.para, {
        forcar: body.forcar === true,
        perda: body.perda === true,
        motivo: typeof body.motivo === "string" ? body.motivo : "",
      });
      if (r.cruzamentos.length) after(() => avisarCruzamentos(ctx, r.cruzamentos));
      return NextResponse.json({ ok: true, noop: r.noop, status: r.pedido.status });
    }
    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (e) {
    return respostaErro(e, "pedidos PATCH");
  }
}
