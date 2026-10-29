export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { guardRh, isCtx, logRh, rhCol, apurarCompetencia, sincronizarCentros } from "@/lib/rh/server";
import { COMP_RE, monthOf, todayKey } from "@/lib/rh/datas";
import { r2 } from "@/lib/rh/custo";
import { apurarComissoes } from "@/lib/rh/comissaoServer";

// Fechamento da competência: congela o custo de cada colaborador em rhCustos.
// Depois de fechada, nada altera aquele mês (salário, encargos, variáveis,
// datas). Correção só reabrindo — com motivo e registro de quem reabriu.

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "comp-get");
    if (!isCtx(ctx)) return ctx;
    const snap = await rhCol(ctx, "rhCompetencias").get();
    return NextResponse.json({
      competencias: snap.docs.map((d) => ({ comp: d.id, status: d.data().status, fechadaPorNome: d.data().fechadaPorNome ?? null })),
    });
  } catch (error) {
    console.error("Erro RH/competencias GET:", error);
    return NextResponse.json({ error: "Erro ao carregar as competências." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardRh(request, "comp-post", 20);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const comp = String(body.comp ?? "");
    if (!COMP_RE.test(comp)) return NextResponse.json({ error: "Competência inválida." }, { status: 400 });

    const ref = rhCol(ctx, "rhCompetencias").doc(comp);
    const atual = await ref.get();
    const fechada = atual.exists && atual.data()?.status === "fechada";

    if (body.acao === "fechar") {
      if (fechada) return NextResponse.json({ error: "Esta competência já está fechada." }, { status: 409 });
      if (comp > monthOf(todayKey())) return NextResponse.json({ error: "Não é possível fechar uma competência futura." }, { status: 400 });

      const linhas = await apurarCompetencia(ctx, comp);
      const semSalario = linhas.filter((l) => l.custo.semSalario);
      if (semSalario.length > 0) {
        return NextResponse.json(
          { error: `Há colaborador(es) sem salário cadastrado nesta competência: ${semSalario.map((l) => l.nome).join(", ")}.` },
          { status: 409 },
        );
      }

      const now = Date.now();
      const total = r2(linhas.reduce((s, l) => s + l.custo.total, 0));
      const batch = ctx.db.batch();
      for (const l of linhas) {
        batch.set(rhCol(ctx, "rhCustos").doc(`${comp}_${l.colaboradorId}`), {
          comp, colaboradorId: l.colaboradorId, nome: l.nome, cargo: l.cargo, vinculo: l.vinculo, custo: l.custo, rateio: l.rateio, fechadoEm: now,
        });
      }
      // Comissão congelada (base, regra e % efetivo): serve de referência pra
      // ajustar estornos futuros de vendas desta competência. Os estornos que
      // entraram neste fechamento ficam marcados e não afetam outro mês.
      const com = await apurarComissoes(ctx, comp);
      for (const r of com.porColab.values()) {
        batch.set(rhCol(ctx, "rhComissoes").doc(`${comp}_${r.colaboradorId}`), {
          comp, colaboradorId: r.colaboradorId, regraId: r.regraId, regraNome: r.regraNome, baseTipo: r.baseTipo,
          base: r.base, comissao: r.comissao, pctEfetivo: r.pctEfetivo, ajusteTotal: r.ajusteTotal, total: r.total, fechadoEm: now,
        });
      }
      com.estornosAplicados.forEach((id) => batch.update(rhCol(ctx, "rhEstornos").doc(id), { incluidoEm: comp }));
      batch.set(ref, {
        status: "fechada", fechadaEm: now, fechadaPor: ctx.actor.uid, fechadaPorNome: ctx.actor.name, total, qtd: linhas.length,
      }, { merge: true });
      await batch.commit();
      await logRh(ctx, "fechou_competencia", { info: comp });
      await sincronizarCentros(ctx, comp).catch((e) => console.error("RH: sync no fechamento:", e));
      return NextResponse.json({ ok: true, total, qtd: linhas.length });
    }

    if (body.acao === "reabrir") {
      if (!fechada) return NextResponse.json({ error: "Esta competência não está fechada." }, { status: 409 });
      const motivo = String(body.motivo ?? "").trim().slice(0, 300);
      if (motivo.length < 5) return NextResponse.json({ error: "Informe o motivo da reabertura (mínimo de 5 caracteres)." }, { status: 400 });

      const snap = await rhCol(ctx, "rhCustos").where("comp", "==", comp).get();
      const batch = ctx.db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      const [comSnap, estSnap] = await Promise.all([
        rhCol(ctx, "rhComissoes").where("comp", "==", comp).get(),
        rhCol(ctx, "rhEstornos").where("incluidoEm", "==", comp).get(),
      ]);
      comSnap.docs.forEach((d) => batch.delete(d.ref));
      estSnap.docs.forEach((d) => batch.update(d.ref, { incluidoEm: FieldValue.delete() }));
      batch.set(ref, {
        status: "aberta",
        reaberturas: FieldValue.arrayUnion({ em: Date.now(), por: ctx.actor.uid, porNome: ctx.actor.name, motivo }),
      }, { merge: true });
      await batch.commit();
      await logRh(ctx, "reabriu_competencia", { info: `${comp} — ${motivo}` });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("Erro RH/competencias POST:", error);
    return NextResponse.json({ error: "Erro ao atualizar a competência." }, { status: 500 });
  }
}
