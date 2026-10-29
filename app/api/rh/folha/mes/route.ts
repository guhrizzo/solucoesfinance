export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { guardRh, isCtx, logRh, rhCol, competenciasFechadas, sincronizarSeguro } from "@/lib/rh/server";
import { apurarFolha } from "@/lib/rh/folhaServer";
import { COMP_RE, isValidDate, monthOf, todayKey } from "@/lib/rh/datas";
import { r2 } from "@/lib/rh/custo";

// Folha do mês: cabeçalho (dias úteis / DSR), lançamentos variáveis por
// colaborador, conferência manual, fechamento e reabertura.
//  • Fechar exige: sem nenhum erro de cálculo, todos conferidos e a competência
//    de CUSTO ainda aberta (o custo passa a usar a folha). Congela o retrato,
//    cria as contas a pagar (salários, FGTS, INSS, IRRF) e atualiza o custo
//    lançado nos centros de custo.
//  • Reabrir exige motivo, registra quem reabriu e só é possível se as contas
//    geradas ainda não foram pagas.

const num = (v: unknown, max: number) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
};

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "fmes-get");
    if (!isCtx(ctx)) return ctx;
    const comp = new URL(request.url).searchParams.get("comp") ?? "";
    if (!COMP_RE.test(comp)) return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
    const folha = await apurarFolha(ctx, comp);
    await logRh(ctx, "consultou_folha", { info: comp });
    return NextResponse.json(folha);
  } catch (error) {
    console.error("Erro RH/folha/mes GET:", error);
    return NextResponse.json({ error: "Erro ao calcular a folha." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardRh(request, "fmes-post", 120);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const comp = String(body.comp ?? "");
    if (!COMP_RE.test(comp)) return NextResponse.json({ error: "Competência inválida." }, { status: 400 });
    const folhaRef = rhCol(ctx, "rhFolhas").doc(comp);
    const folhaSnap = await folhaRef.get();
    const fechada = folhaSnap.exists && folhaSnap.data()?.status === "fechada";
    const bloqueada = () => NextResponse.json({ error: "A folha desta competência está fechada. Reabra-a (com motivo) para alterar." }, { status: 409 });
    const stamp = { updatedAt: Date.now(), updatedBy: ctx.actor.uid, updatedByName: ctx.actor.name };

    // ── Cabeçalho (dias úteis / domingos e feriados, para o DSR) ───────────
    if (body.acao === "cabecalho") {
      if (fechada) return bloqueada();
      const diasUteis = num(body.diasUteis, 31);
      const domingosFeriados = num(body.domingosFeriados, 31);
      if (diasUteis === null || domingosFeriados === null) return NextResponse.json({ error: "Valores inválidos." }, { status: 400 });
      await folhaRef.set({ diasUteis, domingosFeriados, ...stamp }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    // ── Lançamentos variáveis de um colaborador ────────────────────────────
    if (body.acao === "lancamento") {
      if (fechada) return bloqueada();
      const colaboradorId = String(body.colaboradorId ?? "");
      if (!colaboradorId || colaboradorId.includes("/")) return NextResponse.json({ error: "Colaborador inválido." }, { status: 400 });
      const c = await rhCol(ctx, "rhColaboradores").doc(colaboradorId).get();
      if (!c.exists) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
      const l = body.lanc ?? {};
      const campos = { he50: num(l.he50, 744), he100: num(l.he100, 744), noturnas: num(l.noturnas, 744), faltasDias: num(l.faltasDias, 31), atrasosHoras: num(l.atrasosHoras, 744) };
      if (Object.values(campos).some((v) => v === null)) return NextResponse.json({ error: "Horas e dias devem ser números positivos." }, { status: 400 });
      const extras = (Array.isArray(l.extras) ? l.extras : []).slice(0, 20).map((x: { rubricaId?: string; valor?: number; obs?: string }) => ({
        rubricaId: String(x.rubricaId ?? ""), valor: num(x.valor, 10_000_000) ?? 0, obs: String(x.obs ?? "").slice(0, 80),
      })).filter((x: { rubricaId: string; valor: number }) => x.rubricaId && !x.rubricaId.includes("/") && x.valor > 0);
      await rhCol(ctx, "rhFolhaLancamentos").doc(`${comp}_${colaboradorId}`).set({ comp, colaboradorId, ...campos, extras, ...stamp });
      await logRh(ctx, "lancou_folha", { colaboradorId, colaboradorNome: c.data()?.nome, info: comp });
      return NextResponse.json({ ok: true });
    }

    // ── Limpar os lançamentos variáveis de um colaborador ──────────────────
    if (body.acao === "lancamentoLimpar") {
      if (fechada) return bloqueada();
      const colaboradorId = String(body.colaboradorId ?? "");
      if (!colaboradorId || colaboradorId.includes("/")) return NextResponse.json({ error: "Colaborador inválido." }, { status: 400 });
      await rhCol(ctx, "rhFolhaLancamentos").doc(`${comp}_${colaboradorId}`).delete();
      await logRh(ctx, "limpou_lancamentos_folha", { colaboradorId, info: comp });
      return NextResponse.json({ ok: true });
    }

    // ── Conferência manual ─────────────────────────────────────────────────
    if (body.acao === "conferir") {
      if (fechada) return bloqueada();
      const colaboradorId = String(body.colaboradorId ?? "");
      const ref = rhCol(ctx, "rhFolhaConferencias").doc(`${comp}_${colaboradorId}`);
      if (body.conferido === false) {
        await ref.delete();
        return NextResponse.json({ ok: true });
      }
      const linha = (await apurarFolha(ctx, comp)).linhas.find((x) => x.colaboradorId === colaboradorId);
      if (!linha) return NextResponse.json({ error: "Colaborador fora da folha deste mês." }, { status: 404 });
      if (linha.resultado.erros.length > 0) return NextResponse.json({ error: "Há erros de cálculo neste colaborador. Corrija antes de conferir." }, { status: 409 });
      await ref.set({ comp, colaboradorId, hash: linha.hash, por: ctx.actor.uid, porNome: ctx.actor.name, em: Date.now() });
      await logRh(ctx, "conferiu_folha", { colaboradorId, colaboradorNome: linha.nome, info: comp });
      return NextResponse.json({ ok: true });
    }

    // ── Fechar ─────────────────────────────────────────────────────────────
    if (body.acao === "fechar") {
      if (fechada) return NextResponse.json({ error: "Esta folha já está fechada." }, { status: 409 });
      if (comp > monthOf(todayKey())) return NextResponse.json({ error: "Não é possível fechar a folha de uma competência futura." }, { status: 400 });
      if ((await competenciasFechadas(ctx)).includes(comp)) {
        return NextResponse.json({ error: "A competência de custo deste mês já está fechada. Reabra-a na aba Custo mensal antes de fechar a folha." }, { status: 409 });
      }
      const folha = await apurarFolha(ctx, comp);
      if (folha.linhas.length === 0) return NextResponse.json({ error: "Não há colaboradores CLT na folha deste mês." }, { status: 409 });
      const comErro = folha.erros.length > 0 || folha.linhas.some((l) => l.resultado.erros.length > 0 || l.resultado.liquido < 0);
      if (comErro) return NextResponse.json({ error: "A folha tem erros de cálculo ou líquido negativo. Resolva antes de fechar.", erros: folha.erros }, { status: 409 });
      const faltam = folha.linhas.filter((l) => !l.conferido);
      if (faltam.length > 0) return NextResponse.json({ error: `Falta a conferência manual de: ${faltam.map((l) => l.nome).join(", ")}.` }, { status: 409 });

      const soma = (f: (l: (typeof folha.linhas)[number]) => number) => r2(folha.linhas.reduce((s, l) => s + f(l), 0));
      const totais = { liquido: soma((l) => l.resultado.liquido), fgts: soma((l) => l.resultado.fgts), inss: soma((l) => l.resultado.inss), irrf: soma((l) => l.resultado.irrf), proventos: soma((l) => l.resultado.proventos), descontos: soma((l) => l.resultado.descontos) };
      const venc = (body.vencimentos ?? {}) as Record<string, string>;
      const contas = [
        { id: "salarios", valor: totais.liquido, titulo: `Folha ${comp} — salários líquidos`, categoria: "Folha de pagamento" },
        { id: "fgts", valor: totais.fgts, titulo: `Folha ${comp} — FGTS`, categoria: "Encargos sociais (FGTS / INSS)" },
        { id: "inss", valor: totais.inss, titulo: `Folha ${comp} — INSS retido dos empregados`, categoria: "Encargos sociais (FGTS / INSS)" },
        { id: "irrf", valor: totais.irrf, titulo: `Folha ${comp} — IRRF retido`, categoria: "Encargos sociais (FGTS / INSS)" },
      ].filter((c) => c.valor > 0);
      for (const c of contas) {
        if (!isValidDate(String(venc[c.id] ?? ""))) return NextResponse.json({ error: `Informe o vencimento de: ${c.titulo}.` }, { status: 400 });
      }

      const now = Date.now();
      const batch = ctx.db.batch();
      for (const l of folha.linhas) {
        batch.set(rhCol(ctx, "rhFolhaItens").doc(`${comp}_${l.colaboradorId}`), { ...l, comp, conferido: true, fechadoEm: now });
      }
      const bills = ctx.db.collection("users").doc(ctx.ownerUid).collection("bills");
      const billIds: string[] = [];
      for (const c of contas) {
        const id = `rhfolha_${comp}_${c.id}`;
        billIds.push(id);
        batch.set(bills.doc(id), {
          title: c.titulo, amount: c.valor, dueDate: venc[c.id], category: c.categoria, status: "pendente", recurrence: "unica",
          notes: "Gerada pela folha de pagamento (RH). Valores devem ser conferidos pelo contador responsável.",
          photos: [], createdAt: now, userId: ctx.ownerUid, createdBy: ctx.actor.uid, createdByName: ctx.actor.name, rhFolhaComp: comp,
        });
      }
      batch.set(folhaRef, {
        status: "fechada", fechadaEm: now, fechadaPor: ctx.actor.uid, fechadaPorNome: ctx.actor.name, totais, vencimentos: venc, billIds,
        tabelas: folha.tabelas, ...stamp,
      }, { merge: true });
      await batch.commit();
      await logRh(ctx, "fechou_folha", { info: comp });
      await sincronizarSeguro(ctx, comp);
      return NextResponse.json({ ok: true, totais, contas: billIds.length });
    }

    // ── Reabrir ────────────────────────────────────────────────────────────
    if (body.acao === "reabrir") {
      if (!fechada) return NextResponse.json({ error: "Esta folha não está fechada." }, { status: 409 });
      const motivo = String(body.motivo ?? "").trim().slice(0, 300);
      if (motivo.length < 5) return NextResponse.json({ error: "Informe o motivo da reabertura (mínimo de 5 caracteres)." }, { status: 400 });
      if ((await competenciasFechadas(ctx)).includes(comp)) {
        return NextResponse.json({ error: "A competência de custo deste mês está fechada com os valores da folha. Reabra-a na aba Custo mensal primeiro." }, { status: 409 });
      }
      const billIds: string[] = folhaSnap.data()?.billIds ?? [];
      const billRefs = billIds.map((id) => ctx.db.collection("users").doc(ctx.ownerUid).collection("bills").doc(id));
      const bills = await Promise.all(billRefs.map((r) => r.get()));
      const paga = bills.find((b) => b.exists && (b.data()?.status === "pago" || Number(b.data()?.amountPaid) > 0));
      if (paga) return NextResponse.json({ error: `A conta "${paga.data()?.title}" já foi paga ou teve baixa. Estorne o pagamento em Contas a pagar antes de reabrir a folha.` }, { status: 409 });

      const itens = await rhCol(ctx, "rhFolhaItens").where("comp", "==", comp).get();
      const batch = ctx.db.batch();
      itens.docs.forEach((d) => batch.delete(d.ref));
      bills.forEach((b) => { if (b.exists) batch.delete(b.ref); });
      batch.set(folhaRef, {
        status: "aberta", billIds: [], reaberturas: FieldValue.arrayUnion({ em: Date.now(), por: ctx.actor.uid, porNome: ctx.actor.name, motivo }), ...stamp,
      }, { merge: true });
      await batch.commit();
      await logRh(ctx, "reabriu_folha", { info: `${comp} — ${motivo}` });
      await sincronizarSeguro(ctx, comp);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("Erro RH/folha/mes POST:", error);
    return NextResponse.json({ error: "Erro ao atualizar a folha." }, { status: 500 });
  }
}
