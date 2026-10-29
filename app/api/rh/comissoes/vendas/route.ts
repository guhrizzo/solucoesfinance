export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRh, isCtx, logRh, rhCol } from "@/lib/rh/server";
import {
  apurarComissoes, carregarAtribuicoes, carregarConfigMargem, carregarCustos, carregarEstornos,
  listarVendasDoMes, taxasPorPedido, vendaCalc,
} from "@/lib/rh/comissaoServer";
import { margemDaVenda, r2 } from "@/lib/rh/comissao";
import { COMP_RE, monthOf } from "@/lib/rh/datas";

// Vendas do mês com a atribuição a vendedores, estornos e a comissão apurada.
// Competência aberta: cálculo vivo. Fechada: retrato congelado (rhComissoes).

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "cvendas-get");
    if (!isCtx(ctx)) return ctx;
    const comp = new URL(request.url).searchParams.get("comp") ?? "";
    if (!COMP_RE.test(comp)) return NextResponse.json({ error: "Competência inválida." }, { status: 400 });

    const [vendas, atribs, estornos, custos, cfg, compSnap, colabSnap] = await Promise.all([
      listarVendasDoMes(ctx, comp), carregarAtribuicoes(ctx, comp), carregarEstornos(ctx), carregarCustos(ctx),
      carregarConfigMargem(ctx), rhCol(ctx, "rhCompetencias").doc(comp).get(), rhCol(ctx, "rhColaboradores").get(),
    ]);
    const fechada = compSnap.exists && compSnap.data()?.status === "fechada";
    const nomes = new Map(colabSnap.docs.map((d) => [d.id, String(d.data().nome ?? "")]));
    const porKey = new Map(atribs.map((a) => [a.key, a]));
    const taxas = await taxasPorPedido(ctx, vendas);

    const linhas = vendas.slice(0, 500).map((v) => {
      const a = porKey.get(v.key);
      const est = estornos.filter((e) => e.vendaKey === v.key);
      const margem = margemDaVenda(vendaCalc(v, taxas, custos, []), cfg);
      return {
        ...v,
        atribuicao: a ? a.itens.map((i) => ({ ...i, nome: nomes.get(i.colaboradorId) ?? "—" })) : null,
        estornado: r2(est.reduce((s, e) => s + e.valor, 0)),
        margem,
      };
    });

    let resumo: unknown[];
    if (fechada) {
      const snap = await rhCol(ctx, "rhComissoes").where("comp", "==", comp).get();
      resumo = snap.docs.map((d) => ({ ...d.data(), nome: nomes.get(String(d.data().colaboradorId)) ?? "—", ajustes: [], semCusto: [] }));
    } else {
      const { porColab } = await apurarComissoes(ctx, comp);
      resumo = [...porColab.values()].map((r) => ({ ...r, nome: nomes.get(r.colaboradorId) ?? "—" }));
    }

    const relevantes = estornos
      .filter((e) => e.compVenda === comp || monthOf(e.data) === comp)
      .map((e) => ({ ...e, itens: e.itens.map((i) => ({ ...i, nome: nomes.get(i.colaboradorId) ?? "—" })) }));

    const colaboradores = colabSnap.docs
      .filter((d) => d.data().comissionado === true)
      .map((d) => ({ id: d.id, nome: String(d.data().nome ?? ""), ativo: d.data().status === "ativo" }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    await logRh(ctx, "consultou_comissoes", { info: comp });
    return NextResponse.json({ comp, status: fechada ? "fechada" : "aberta", vendas: linhas, truncado: vendas.length > 500, resumo, estornos: relevantes, colaboradores });
  } catch (error) {
    console.error("Erro RH/comissoes/vendas GET:", error);
    return NextResponse.json({ error: "Erro ao carregar as vendas." }, { status: 500 });
  }
}
