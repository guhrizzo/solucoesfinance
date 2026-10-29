export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRh, isCtx, logRh, rhCol, competenciasFechadas, sincronizarSeguro } from "@/lib/rh/server";
import { carregarAtribuicoes, carregarEstornos, lerVenda, margemDaVendaLida, type OrigemVenda } from "@/lib/rh/comissaoServer";
import { r2 } from "@/lib/rh/comissao";
import { isValidDate, monthOf } from "@/lib/rh/datas";

// Estorno / cancelamento / devolução de uma venda JÁ atribuída.
//  • Competência da venda ainda ABERTA: a comissão daquele mês é recalculada
//    sem a parte estornada.
//  • Competência da venda FECHADA (comissão já "paga"): o valor volta como
//    ajuste NEGATIVO na competência da data do estorno (que precisa estar aberta).
// Cada estorno afeta uma única competência (campo `incluidoEm` no fechamento).

const TIPOS = ["estorno", "cancelamento", "devolucao"] as const;

export async function POST(request: Request) {
  try {
    const ctx = await guardRh(request, "estorno-post", 60);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const fechadas = await competenciasFechadas(ctx);

    // ── Desfazer ───────────────────────────────────────────────────────────
    if (body.acao === "desfazer") {
      const id = String(body.id ?? "");
      if (!id || id.includes("/")) return NextResponse.json({ error: "Estorno inválido." }, { status: 400 });
      const ref = rhCol(ctx, "rhEstornos").doc(id);
      const s = await ref.get();
      if (!s.exists) return NextResponse.json({ error: "Estorno não encontrado." }, { status: 404 });
      const e = s.data()!;
      const alvo: string = e.incluidoEm ?? (fechadas.includes(e.compVenda) ? monthOf(e.data) : e.compVenda);
      if (fechadas.includes(alvo)) {
        return NextResponse.json({ error: `O efeito deste estorno está na competência ${alvo}, que está fechada. Reabra-a (com motivo) para desfazer.` }, { status: 409 });
      }
      await ref.delete();
      await logRh(ctx, "desfez_estorno", { info: `${e.vendaKey} — ${e.valor}` });
      await sincronizarSeguro(ctx, e.compVenda < monthOf(e.data) ? e.compVenda : monthOf(e.data));
      return NextResponse.json({ ok: true });
    }

    // ── Criar ──────────────────────────────────────────────────────────────
    const vendaKey = String(body.vendaKey ?? "");
    const m = /^(cashflow|vendas)_(.+)$/.exec(vendaKey);
    if (!m || m[2].includes("/")) return NextResponse.json({ error: "Venda inválida." }, { status: 400 });
    const origem = m[1] as OrigemVenda;
    const tipo = TIPOS.includes(body.tipo) ? (body.tipo as (typeof TIPOS)[number]) : null;
    if (!tipo) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
    const data = String(body.data ?? "");
    if (!isValidDate(data)) return NextResponse.json({ error: "Data inválida." }, { status: 400 });
    const motivo = String(body.motivo ?? "").trim().slice(0, 200);

    const [venda, atribs, anteriores] = await Promise.all([
      lerVenda(ctx, origem, m[2]), carregarAtribuicoes(ctx), carregarEstornos(ctx),
    ]);
    if (!venda) return NextResponse.json({ error: "Venda não encontrada (ela pode ter sido removida)." }, { status: 404 });
    const atrib = atribs.find((a) => a.key === vendaKey);
    if (!atrib) return NextResponse.json({ error: "Esta venda não tem vendedor atribuído; não há comissão a estornar." }, { status: 400 });

    const jaEstornado = r2(anteriores.filter((e) => e.vendaKey === vendaKey).reduce((s, e) => s + e.valor, 0));
    const restante = r2(venda.valor - jaEstornado);
    const valor = r2(Number(body.valor));
    if (!Number.isFinite(valor) || valor <= 0) return NextResponse.json({ error: "Informe o valor estornado." }, { status: 400 });
    if (valor > restante + 0.001) return NextResponse.json({ error: `O valor passa do que resta da venda (${restante.toFixed(2).replace(".", ",")}).` }, { status: 400 });
    if (data < venda.date) return NextResponse.json({ error: "A data do estorno não pode ser anterior à venda." }, { status: 400 });

    const compVenda = monthOf(venda.date);
    if (fechadas.includes(compVenda) && fechadas.includes(monthOf(data))) {
      return NextResponse.json({ error: "A competência da venda e a da data do estorno estão fechadas. Use uma data em competência aberta." }, { status: 409 });
    }

    const margem = await margemDaVendaLida(ctx, venda);
    const doc = {
      vendaKey, compVenda, data, valor, tipo, motivo, itens: atrib.itens,
      baseReceita: valor, baseMargem: margem === null ? null : r2((margem * valor) / venda.valor),
      createdAt: Date.now(), createdBy: ctx.actor.uid, createdByName: ctx.actor.name,
    };
    const ref = await rhCol(ctx, "rhEstornos").add(doc);
    await logRh(ctx, "registrou_estorno", { info: `${vendaKey} — ${valor}` });
    await sincronizarSeguro(ctx, compVenda < monthOf(data) ? compVenda : monthOf(data));
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    console.error("Erro RH/comissoes/estornos POST:", error);
    return NextResponse.json({ error: "Erro ao registrar o estorno." }, { status: 500 });
  }
}
