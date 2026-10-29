export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRh, isCtx, logRh, rhCol } from "@/lib/rh/server";
import { carregarParametros, carregarRubricas, carregarTabelas, folhasFechadas } from "@/lib/rh/folhaServer";
import { RUBRICAS_PADRAO, validarRubrica, validarTabelaInss, validarTabelaIrrf, type ParametrosFolha } from "@/lib/rh/folha";
import { validarNovaVigencia, type ErroVigencia } from "@/lib/rh/vigencia";
import { dayBefore, isValidDate, monthOf } from "@/lib/rh/datas";

// Configuração da folha: parâmetros da empresa, rubricas e tabelas legais
// (INSS/IRRF) com vigência. Nada de valor legal vem de fábrica: as tabelas
// começam vazias e quem preenche (você ou o contador) responde por elas.

const MSG: Record<ErroVigencia, string> = {
  inicio_invalido: "Data de início inválida.",
  sobreposicao: "Já existe tabela com início igual ou posterior. Uma nova tabela só vale a partir de uma data depois da última.",
  competencia_fechada: "Essa tabela alcançaria uma folha já fechada. Reabra a folha (com motivo) ou use uma data posterior.",
};

const LIMITES: Record<keyof ParametrosFolha, number> = {
  horasMes: 744, pctHE50: 500, pctHE100: 500, pctAdNoturno: 500, diasBaseMes: 31, pctVT: 100, aliquotaFgts: 100, pctTercoFerias: 100, pct1aParcela13: 100,
};

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "fcfg-get");
    if (!isCtx(ctx)) return ctx;
    const [parametros, rubricas, inss, irrf, fechadas] = await Promise.all([
      carregarParametros(ctx), carregarRubricas(ctx), carregarTabelas(ctx, "inss"), carregarTabelas(ctx, "irrf"), folhasFechadas(ctx),
    ]);
    return NextResponse.json({ parametros, rubricas, tabelas: { inss, irrf }, folhasFechadas: fechadas });
  } catch (error) {
    console.error("Erro RH/folha/config GET:", error);
    return NextResponse.json({ error: "Erro ao carregar a configuração da folha." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardRh(request, "fcfg-post", 40);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const stamp = { updatedAt: Date.now(), updatedBy: ctx.actor.uid, updatedByName: ctx.actor.name };

    // ── Parâmetros ─────────────────────────────────────────────────────────
    if (body.acao === "parametros") {
      const dados: Record<string, number | null> = {};
      for (const k of Object.keys(LIMITES) as (keyof ParametrosFolha)[]) {
        const raw = body.parametros?.[k];
        if (raw === null || raw === undefined || raw === "") { dados[k] = null; continue; }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || n > LIMITES[k]) return NextResponse.json({ error: `Valor inválido em "${k}".` }, { status: 400 });
        dados[k] = Math.round(n * 10000) / 10000;
      }
      await rhCol(ctx, "rhConfig").doc("folha").set({ ...dados, ...stamp }, { merge: true });
      await logRh(ctx, "alterou_parametros_folha");
      return NextResponse.json({ ok: true });
    }

    // ── Rubricas ───────────────────────────────────────────────────────────
    if (body.acao === "rubricasPadrao") {
      if ((await carregarRubricas(ctx)).length > 0) return NextResponse.json({ error: "Já existem rubricas cadastradas." }, { status: 409 });
      const batch = ctx.db.batch();
      RUBRICAS_PADRAO.forEach((r) => batch.set(rhCol(ctx, "rhRubricas").doc(), { ...r, createdAt: Date.now() }));
      await batch.commit();
      await logRh(ctx, "carregou_rubricas_padrao");
      return NextResponse.json({ ok: true });
    }
    if (body.acao === "rubrica") {
      const v = validarRubrica(body.rubrica ?? {});
      if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
      const id = body.rubrica?.id ? String(body.rubrica.id) : "";
      if (id.includes("/")) return NextResponse.json({ error: "Rubrica inválida." }, { status: 400 });
      const todas = await carregarRubricas(ctx);
      if (todas.some((r) => r.id !== id && r.codigo === v.rubrica.codigo)) return NextResponse.json({ error: "Já existe rubrica com este código." }, { status: 409 });
      if (v.rubrica.tipo !== "manual" && v.rubrica.ativa && todas.some((r) => r.id !== id && r.ativa && r.tipo === v.rubrica.tipo)) {
        return NextResponse.json({ error: "Já existe uma rubrica ativa deste tipo. Use o tipo \"manual\" para rubricas extras." }, { status: 409 });
      }
      if (id) await rhCol(ctx, "rhRubricas").doc(id).set({ ...v.rubrica, ...stamp }, { merge: true });
      else await rhCol(ctx, "rhRubricas").add({ ...v.rubrica, createdAt: Date.now(), ...stamp });
      await logRh(ctx, id ? "alterou_rubrica" : "criou_rubrica", { info: `${v.rubrica.codigo} ${v.rubrica.nome}` });
      return NextResponse.json({ ok: true });
    }
    if (body.acao === "rubricaRemover") {
      const id = String(body.id ?? "");
      if (!id || id.includes("/")) return NextResponse.json({ error: "Rubrica inválida." }, { status: 400 });
      await rhCol(ctx, "rhRubricas").doc(id).delete();
      await logRh(ctx, "removeu_rubrica", { info: id });
      return NextResponse.json({ ok: true });
    }

    // ── Tabelas de INSS / IRRF ─────────────────────────────────────────────
    if (body.acao === "tabela") {
      const t = body.tabela ?? {};
      const tipo = t.tipo === "irrf" ? "irrf" : t.tipo === "inss" ? "inss" : null;
      if (!tipo) return NextResponse.json({ error: "Tipo de tabela inválido." }, { status: 400 });
      const dadosTabela = tipo === "inss"
        ? { faixas: (t.faixas ?? []).map((f: { ate: number; aliquota: number }) => ({ ate: Number(f.ate), aliquota: Number(f.aliquota) })) }
        : {
            faixas: (t.faixas ?? []).map((f: { ate: number | null; aliquota: number; deduzir: number }) => ({ ate: f.ate === null || f.ate === undefined || (f.ate as unknown) === "" ? null : Number(f.ate), aliquota: Number(f.aliquota), deduzir: Number(f.deduzir) || 0 })),
            deducaoDependente: Number(t.deducaoDependente) || 0,
            descontoSimplificado: Number(t.descontoSimplificado) || 0,
          };
      const erro = tipo === "inss" ? validarTabelaInss(dadosTabela) : validarTabelaIrrf(dadosTabela);
      if (erro) return NextResponse.json({ error: erro }, { status: 400 });
      const obs = String(t.obs ?? "").trim().slice(0, 200);
      const fechadas = await folhasFechadas(ctx);

      if (t.id) {
        const ref = rhCol(ctx, "rhTabelasLegais").doc(String(t.id));
        const atual = await ref.get();
        if (!atual.exists || atual.data()?.tipo !== tipo) return NextResponse.json({ error: "Tabela não encontrada." }, { status: 404 });
        const inicio = String(atual.data()!.inicio);
        if (fechadas.some((c) => c >= monthOf(inicio))) return NextResponse.json({ error: MSG.competencia_fechada }, { status: 409 });
        await ref.set({ ...dadosTabela, obs, ...stamp }, { merge: true });
        await logRh(ctx, `alterou_tabela_${tipo}`, { info: `início ${inicio}` });
        return NextResponse.json({ ok: true });
      }

      const inicio = String(t.inicio ?? "");
      if (!isValidDate(inicio)) return NextResponse.json({ error: MSG.inicio_invalido }, { status: 400 });
      const existentes = await carregarTabelas(ctx, tipo);
      const e = validarNovaVigencia(existentes.map((x) => ({ inicio: x.inicio, fim: x.fim, dados: {} })), inicio, fechadas);
      if (e) return NextResponse.json({ error: MSG[e] }, { status: 409 });
      const batch = ctx.db.batch();
      existentes.forEach((x) => {
        if (x.inicio < inicio && (x.fim == null || x.fim >= inicio)) batch.update(rhCol(ctx, "rhTabelasLegais").doc(x.id), { fim: dayBefore(inicio) });
      });
      batch.set(rhCol(ctx, "rhTabelasLegais").doc(), { tipo, inicio, fim: null, ...dadosTabela, obs, createdAt: Date.now(), createdBy: ctx.actor.uid, createdByName: ctx.actor.name });
      await batch.commit();
      await logRh(ctx, `nova_tabela_${tipo}`, { info: `início ${inicio}` });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("Erro RH/folha/config POST:", error);
    return NextResponse.json({ error: "Erro ao salvar a configuração." }, { status: 500 });
  }
}

