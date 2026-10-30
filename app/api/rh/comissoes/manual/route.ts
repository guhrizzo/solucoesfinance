export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRh, isCtx, logRh, rhCol, sincronizarSeguro } from "@/lib/rh/server";
import { idComissaoManual } from "@/lib/rh/comissaoServer";
import { r2 } from "@/lib/rh/comissao";
import { COMP_RE } from "@/lib/rh/datas";

// Comissão lançada à mão: base e percentual por colaborador e competência. Não usa
// vendas nem relatório de vendas. Competência fechada não aceita alteração.

const MAX = 1_000_000_000;

/** Lançamentos antigos guardavam só o valor: o % sai de valor ÷ base. */
function pctDoLancamento(l: FirebaseFirestore.DocumentData): number {
  if (l.pct != null) return Number(l.pct) || 0;
  const base = Number(l.base) || 0;
  return base > 0 ? r2(((Number(l.comissao) || 0) / base) * 100) : 0;
}

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "cmanual-get");
    if (!isCtx(ctx)) return ctx;
    const comp = new URL(request.url).searchParams.get("comp") ?? "";
    if (!COMP_RE.test(comp)) return NextResponse.json({ error: "Competência inválida." }, { status: 400 });

    const [compSnap, colabSnap, lancSnap] = await Promise.all([
      rhCol(ctx, "rhCompetencias").doc(comp).get(),
      rhCol(ctx, "rhColaboradores").get(),
      rhCol(ctx, "rhComissaoManual").where("comp", "==", comp).get(),
    ]);
    const fechada = compSnap.exists && compSnap.data()?.status === "fechada";
    const lanc = new Map(lancSnap.docs.map((d) => [String(d.data().colaboradorId), d.data()]));
    const colaboradores = colabSnap.docs
      .filter((d) => d.data().comissionado === true || lanc.has(d.id))
      .map((d) => {
        const l = lanc.get(d.id);
        return {
          colaboradorId: d.id, nome: String(d.data().nome ?? ""), ativo: d.data().status === "ativo",
          lancado: !!l, base: l ? Number(l.base) || 0 : 0, pct: l ? pctDoLancamento(l) : 0, comissao: l ? Number(l.comissao) || 0 : 0,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    await logRh(ctx, "consultou_comissoes", { info: comp });
    return NextResponse.json({ comp, status: fechada ? "fechada" : "aberta", colaboradores });
  } catch (error) {
    console.error("Erro RH/comissoes/manual GET:", error);
    return NextResponse.json({ error: "Erro ao carregar as comissões." }, { status: 500 });
  }
}

/** { comp, colaboradorId, base, pct } grava (valor a pagar = base × pct); { comp, colaboradorId, acao: "remover" } apaga o lançamento. */
export async function POST(request: Request) {
  try {
    const ctx = await guardRh(request, "cmanual-post", 60);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const comp = String(body.comp ?? "");
    const colaboradorId = String(body.colaboradorId ?? "");
    if (!COMP_RE.test(comp)) return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
    if (!colaboradorId || colaboradorId.includes("/")) return NextResponse.json({ error: "Colaborador inválido." }, { status: 400 });

    const [compSnap, colab] = await Promise.all([
      rhCol(ctx, "rhCompetencias").doc(comp).get(),
      rhCol(ctx, "rhColaboradores").doc(colaboradorId).get(),
    ]);
    if (compSnap.exists && compSnap.data()?.status === "fechada") {
      return NextResponse.json({ error: "Esta competência está fechada. Reabra para alterar a comissão." }, { status: 409 });
    }
    if (!colab.exists) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
    const nome = String(colab.data()!.nome ?? "");
    const ref = rhCol(ctx, "rhComissaoManual").doc(idComissaoManual(comp, colaboradorId));

    if (body.acao === "remover") {
      await ref.delete();
      await logRh(ctx, "removeu_comissao", { colaboradorId, colaboradorNome: nome, info: comp });
      await sincronizarSeguro(ctx, comp);
      return NextResponse.json({ ok: true });
    }

    const base = Number(body.base);
    const pct = Number(body.pct);
    if (!Number.isFinite(base) || base < 0 || base > MAX) return NextResponse.json({ error: "Informe uma base válida (zero ou maior)." }, { status: 400 });
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return NextResponse.json({ error: "Informe um percentual de comissão entre 0 e 100." }, { status: 400 });

    await ref.set({
      comp, colaboradorId, base: r2(base), pct: r2(pct), comissao: r2((base * pct) / 100),
      updatedAt: Date.now(), updatedBy: ctx.actor.uid, updatedByName: ctx.actor.name,
    });
    await logRh(ctx, "lancou_comissao", { colaboradorId, colaboradorNome: nome, info: comp });
    await sincronizarSeguro(ctx, comp);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro RH/comissoes/manual POST:", error);
    return NextResponse.json({ error: "Erro ao salvar a comissão." }, { status: 500 });
  }
}
