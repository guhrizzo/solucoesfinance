export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRh, isCtx, logRh, rhCol, competenciasFechadas, sincronizarSeguro } from "@/lib/rh/server";
import { carregarEstornos, chaveVenda, lerVenda, type OrigemVenda } from "@/lib/rh/comissaoServer";
import { validarAtribuicao } from "@/lib/rh/comissao";
import { monthOf } from "@/lib/rh/datas";

// Atribui uma venda a um ou mais vendedores (divisão em %, soma 100). Enviar
// `itens: []` remove a atribuição. Venda de competência fechada, ou que já tem
// estorno, não muda: o histórico de comissão não é reescrito.

export async function POST(request: Request) {
  try {
    const ctx = await guardRh(request, "atrib-post", 120);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const origem = body.origem as OrigemVenda;
    const refId = String(body.refId ?? "");
    if ((origem !== "cashflow" && origem !== "vendas") || !refId || refId.includes("/")) {
      return NextResponse.json({ error: "Venda inválida." }, { status: 400 });
    }
    const venda = await lerVenda(ctx, origem, refId);
    if (!venda) return NextResponse.json({ error: "Venda não encontrada." }, { status: 404 });
    const comp = monthOf(venda.date);
    if ((await competenciasFechadas(ctx)).includes(comp)) {
      return NextResponse.json({ error: "A competência desta venda está fechada. Reabra-a (com motivo) para alterar a atribuição." }, { status: 409 });
    }
    const key = chaveVenda(origem, refId);
    if ((await carregarEstornos(ctx)).some((e) => e.vendaKey === key)) {
      return NextResponse.json({ error: "Esta venda tem estorno registrado. Desfaça o estorno antes de mudar a atribuição." }, { status: 409 });
    }

    const ref = rhCol(ctx, "rhAtribuicoes").doc(key);
    if (Array.isArray(body.itens) && body.itens.length === 0) {
      await ref.delete();
      await logRh(ctx, "removeu_atribuicao_venda", { info: key });
    } else {
      const erro = validarAtribuicao(body.itens);
      if (erro) return NextResponse.json({ error: erro }, { status: 400 });
      const itens = (body.itens as { colaboradorId: string; pct: number }[]).map((i) => ({ colaboradorId: String(i.colaboradorId), pct: Math.round(Number(i.pct) * 100) / 100 }));
      const docs = await Promise.all(itens.map((i) => rhCol(ctx, "rhColaboradores").doc(i.colaboradorId).get()));
      const invalido = docs.findIndex((d) => !d.exists || d.data()?.comissionado !== true);
      if (invalido >= 0) return NextResponse.json({ error: "Só colaboradores marcados como comissionados podem receber comissão." }, { status: 400 });
      await ref.set({ origem, refId, comp, date: venda.date, itens, updatedAt: Date.now(), updatedBy: ctx.actor.uid, updatedByName: ctx.actor.name });
      await logRh(ctx, "atribuiu_venda", { info: key });
    }
    await sincronizarSeguro(ctx, comp);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro RH/comissoes/atribuicao POST:", error);
    return NextResponse.json({ error: "Erro ao salvar a atribuição." }, { status: 500 });
  }
}
