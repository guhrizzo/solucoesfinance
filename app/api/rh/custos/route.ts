export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRh, isCtx, logRh, rhCol, apurarCompetencia, sincronizarCentros } from "@/lib/rh/server";
import { COMP_RE, monthOf, todayKey } from "@/lib/rh/datas";
import { r2 } from "@/lib/rh/custo";

// Custo mensal por colaborador numa competência. Competência ABERTA: cálculo
// vivo. FECHADA: devolve o retrato congelado (rhCustos) — alterações de
// salário/encargos feitas depois nunca mudam um mês fechado.

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "custos-get");
    if (!isCtx(ctx)) return ctx;
    const comp = new URL(request.url).searchParams.get("comp") ?? "";
    if (!COMP_RE.test(comp)) return NextResponse.json({ error: "Competência inválida." }, { status: 400 });

    const compSnap = await rhCol(ctx, "rhCompetencias").doc(comp).get();
    const fechada = compSnap.exists && compSnap.data()?.status === "fechada";

    let linhas;
    if (fechada) {
      const snap = await rhCol(ctx, "rhCustos").where("comp", "==", comp).get();
      linhas = snap.docs
        .map((d) => d.data() as { colaboradorId: string; nome: string; cargo: string; vinculo: string; custo: unknown })
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    } else {
      linhas = await apurarCompetencia(ctx, comp);
      // Competência aberta (até o mês atual): garante o lançamento nos centros de custo.
      if (comp <= monthOf(todayKey())) {
        await sincronizarCentros(ctx, comp).catch((e) => console.error("RH: sync ao consultar custos:", e));
      }
    }

    const total = r2(linhas.reduce((s, l) => s + ((l.custo as { total: number }).total || 0), 0));
    await logRh(ctx, "consultou_custos", { info: comp });
    return NextResponse.json({
      comp,
      status: fechada ? "fechada" : "aberta",
      fechadaPorNome: fechada ? compSnap.data()?.fechadaPorNome ?? null : null,
      fechadaEm: fechada ? compSnap.data()?.fechadaEm ?? null : null,
      historicoReaberturas: compSnap.exists ? compSnap.data()?.reaberturas ?? [] : [],
      linhas,
      total,
    });
  } catch (error) {
    console.error("Erro RH/custos GET:", error);
    return NextResponse.json({ error: "Erro ao calcular os custos." }, { status: 500 });
  }
}
