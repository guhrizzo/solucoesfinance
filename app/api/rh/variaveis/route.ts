export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRh, isCtx, logRh, rhCol, sincronizarSeguro } from "@/lib/rh/server";
import { COMP_RE } from "@/lib/rh/datas";

// Bônus do mês (lançamento manual) por colaborador e competência. A comissão
// virá do módulo de Vendas (etapa 3) e também cai neste documento.

export async function PUT(request: Request) {
  try {
    const ctx = await guardRh(request, "var-put", 60);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const comp = String(body.comp ?? "");
    const colaboradorId = String(body.colaboradorId ?? "");
    const bonus = Math.round(Number(body.bonus) * 100) / 100;
    if (!COMP_RE.test(comp) || !colaboradorId || colaboradorId.includes("/")) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
    }
    if (!Number.isFinite(bonus) || bonus < 0 || bonus > 10_000_000) {
      return NextResponse.json({ error: "Valor de bônus inválido." }, { status: 400 });
    }

    const [compSnap, colab] = await Promise.all([
      rhCol(ctx, "rhCompetencias").doc(comp).get(),
      rhCol(ctx, "rhColaboradores").doc(colaboradorId).get(),
    ]);
    if (!colab.exists) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
    if (compSnap.exists && compSnap.data()?.status === "fechada") {
      return NextResponse.json({ error: "Competência fechada. Reabra-a (com motivo) para alterar o bônus." }, { status: 409 });
    }

    await rhCol(ctx, "rhVariaveis").doc(`${comp}_${colaboradorId}`).set(
      { comp, colaboradorId, bonus, updatedAt: Date.now(), updatedBy: ctx.actor.uid, updatedByName: ctx.actor.name },
      { merge: true },
    );
    await logRh(ctx, "lancou_bonus", { colaboradorId, colaboradorNome: colab.data()?.nome, info: comp });
    await sincronizarSeguro(ctx, comp);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro RH/variaveis PUT:", error);
    return NextResponse.json({ error: "Erro ao salvar o bônus." }, { status: 500 });
  }
}
