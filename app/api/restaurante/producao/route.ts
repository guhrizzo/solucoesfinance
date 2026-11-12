export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, after } from "next/server";
import { avisarCruzamentos, guardRestaurante, isCtx, lerCorpo, respostaErro } from "@/lib/restaurante/server";
import { carregarTudo, COL, registrarLote } from "@/lib/restaurante/service";
import { agregarProducao } from "@/lib/restaurante/pedido";
import { toLote } from "@/lib/restaurante/docs";

// Produção: GET = o que precisa ser feito agora (pratos dos pedidos abertos e
// insumos × saldo) + últimos lotes. POST = registrar lote de um preparo
// (baixa os insumos da receita e soma ao saldo do preparo, em transação).
// Perda/desperdício vai por /api/restaurante/movimentos (tipo "perda").

export async function GET(request: Request) {
  const ctx = await guardRestaurante(request, "prod-get");
  if (!isCtx(ctx)) return ctx;
  try {
    const [{ ingredientes, pedidosAbertos }, lotes] = await Promise.all([
      carregarTudo(ctx),
      ctx.db.collection(`users/${ctx.ownerUid}/${COL.lotes}`).orderBy("em", "desc").limit(30).get(),
    ]);
    return NextResponse.json({
      producao: agregarProducao(pedidosAbertos, new Map(ingredientes.map((i) => [i.id, i]))),
      lotes: lotes.docs.map((d) => toLote(d.id, d.data())),
    });
  } catch (e) {
    return respostaErro(e, "producao GET");
  }
}

export async function POST(request: Request) {
  const ctx = await guardRestaurante(request, "prod-post", 40);
  if (!isCtx(ctx)) return ctx;
  try {
    const r = await registrarLote(ctx, await lerCorpo(request));
    if (r.cruzamentos.length) after(() => avisarCruzamentos(ctx, r.cruzamentos));
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e) {
    return respostaErro(e, "producao POST");
  }
}
