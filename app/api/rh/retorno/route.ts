export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/accountScope";
import { guardRh, isCtx, logRh, rhCol, apurarCompetencia, competenciasFechadas, listarCentros } from "@/lib/rh/server";
import { calcularRetorno, type CustoPessoaMes, type VendaRetorno } from "@/lib/rh/retorno";
import { COMP_RE, monthOf, nextComp, todayKey } from "@/lib/rh/datas";

// Relatório "Retorno por pessoa" (aba em /relatorios e "meus indicadores" em /rh).
//  • Gestor/financeiro (permissão "rh"): todos os colaboradores, com custo.
//  • Colaborador comum ("rh_proprio"): SÓ o colaborador vinculado ao seu usuário
//    e SEM custo de pessoal (salário/encargos são dado de gestão — LGPD).
// Período em meses inteiros (comissão e custo são mensais), no máx. 12.

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "retorno-get", 30, ["rh", "rh_proprio"]);
    if (!isCtx(ctx)) return ctx;
    const gestor = hasPermission(ctx.scope, "rh");

    const url = new URL(request.url);
    const hoje = monthOf(todayKey());
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!COMP_RE.test(from) || !COMP_RE.test(to) || from > to) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
    const comps: string[] = [];
    for (let c = from; c <= to && comps.length < 13; c = nextComp(c)) if (c <= hoje) comps.push(c);
    if (comps.length === 0 || comps.length > 12) return NextResponse.json({ error: "Escolha de 1 a 12 meses, até o mês atual." }, { status: 400 });

    // Quem aparece no relatório.
    const colabSnap = await rhCol(ctx, "rhColaboradores").get();
    const nomes = new Map(colabSnap.docs.map((d) => [d.id, String(d.data().nome ?? "")]));
    let colaboradorIds: string[] | undefined;
    if (gestor) {
      const pedido = url.searchParams.get("colaboradorId");
      if (pedido) colaboradorIds = [pedido];
    } else {
      const meu = colabSnap.docs.find((d) => d.data().membroUid === ctx.actor.uid);
      if (!meu) return NextResponse.json({ error: "Seu usuário ainda não está vinculado a um colaborador. Peça ao gestor de RH.", semVinculo: true }, { status: 404 });
      colaboradorIds = [meu.id];
    }
    const centroId = gestor ? url.searchParams.get("centroId") || null : null;
    const sku = (url.searchParams.get("sku") ?? "").trim().toUpperCase() || null;

    // ── Custo e comissão por pessoa e mês ────────────────────────────────────
    const fechadas = new Set(await competenciasFechadas(ctx));
    const custos: CustoPessoaMes[] = [];
    for (const comp of comps) {
      if (fechadas.has(comp)) {
        const [cs, ms] = await Promise.all([
          rhCol(ctx, "rhCustos").where("comp", "==", comp).get(),
          rhCol(ctx, "rhComissoes").where("comp", "==", comp).get(),
        ]);
        const meta = new Map(ms.docs.map((d) => [String(d.data().colaboradorId), d.data()]));
        cs.docs.forEach((d) => {
          const x = d.data();
          const m = meta.get(String(x.colaboradorId));
          custos.push({
            comp, colaboradorId: String(x.colaboradorId), total: Number(x.custo?.total) || 0, comissao: Number(x.custo?.comissao) || 0,
            rateio: { itens: (x.rateio?.itens ?? []).map((i: { centroId: string; valor: number }) => ({ centroId: i.centroId, valor: i.valor })), naoAlocado: Number(x.rateio?.naoAlocado) || 0 },
            pctEfetivo: Number(m?.pctEfetivo) || 0, baseTipo: m?.baseTipo ?? null,
          });
        });
      } else {
        for (const l of await apurarCompetencia(ctx, comp)) {
          custos.push({
            comp, colaboradorId: l.colaboradorId, total: l.custo.total, comissao: l.custo.comissao,
            rateio: { itens: l.rateio.itens.map((i) => ({ centroId: i.centroId, valor: i.valor })), naoAlocado: l.rateio.naoAlocado },
            pctEfetivo: l.comissao?.pctEfetivo ?? 0, baseTipo: l.comissao?.baseTipo ?? null,
          });
        }
      }
    }

    // O RH não usa vendas: o retorno parte só da comissão lançada e do custo da pessoa.
    const vendas: VendaRetorno[] = [];

    const r = calcularRetorno({ vendas, custos, nomes, filtros: { colaboradorIds, centroId, sku, semCustoPessoal: !gestor } });

    if (gestor) await logRh(ctx, "consultou_retorno", { info: `${from} a ${to}` });
    return NextResponse.json({
      selfOnly: !gestor,
      periodo: { from, to },
      linhas: r.linhas,
      totais: r.totais,
      opcoes: gestor
        ? {
            colaboradores: colabSnap.docs.map((d) => ({ id: d.id, nome: String(d.data().nome ?? "") })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
            centros: (await listarCentros(ctx)).map((c) => ({ id: c.id, nome: c.nome })),
            produtos: [],
          }
        : { colaboradores: [], centros: [], produtos: [] },
    });
  } catch (error) {
    console.error("Erro RH/retorno GET:", error);
    return NextResponse.json({ error: "Erro ao montar o relatório." }, { status: 500 });
  }
}
