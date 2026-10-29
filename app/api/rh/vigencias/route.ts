export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRh, isCtx, logRh, rhCol, competenciasFechadas, EMPRESA, listarCentros, recomputarUsoCentros, sincronizarSeguro } from "@/lib/rh/server";
import { validarItens } from "@/lib/rh/alocacao";
import { isValidDate, dayBefore, monthOf } from "@/lib/rh/datas";
import { validarNovaVigencia, validarEncerramento, type ErroVigencia, type Vigencia } from "@/lib/rh/vigencia";

// Histórico com vigência: salário e benefícios por colaborador; encargos da
// empresa (colaboradorId "_empresa"). Nova vigência encerra a anterior no dia
// anterior e NUNCA toca competência fechada.

const TIPOS = ["salario", "beneficio", "encargos", "alocacao"] as const;
type Tipo = (typeof TIPOS)[number];

const MSG: Record<ErroVigencia, string> = {
  inicio_invalido: "Data inválida.",
  sobreposicao: "Já existe uma vigência com início igual ou posterior. Vigências novas só valem a partir de uma data depois da última.",
  competencia_fechada: "Essa mudança alcançaria uma competência já fechada. Reabra a competência (com motivo) ou use uma data posterior.",
};

const ehNumero = (n: number, max: number) => Number.isFinite(n) && n >= 0 && n <= max;

export async function GET(request: Request) {
  try {
    // Remuneração individual é dado sensível: exige o PIN.
    const ctx = await guardRh(request, "vig-get", 60, "rh", true);
    if (!isCtx(ctx)) return ctx;
    const colaboradorId = new URL(request.url).searchParams.get("colaboradorId") ?? "";
    if (!colaboradorId || colaboradorId.includes("/")) return NextResponse.json({ error: "Colaborador inválido." }, { status: 400 });

    const snap = await rhCol(ctx, "rhVigencias").where("colaboradorId", "==", colaboradorId).get();
    const vigencias = snap.docs
      .map((d) => ({ id: d.id, ...d.data() } as { id: string; inicio: string }))
      .sort((a, b) => b.inicio.localeCompare(a.inicio));
    if (colaboradorId !== EMPRESA) {
      const c = await rhCol(ctx, "rhColaboradores").doc(colaboradorId).get();
      await logRh(ctx, "consultou_remuneracao", { colaboradorId, colaboradorNome: c.data()?.nome });
    }
    return NextResponse.json({ vigencias });
  } catch (error) {
    console.error("Erro RH/vigencias GET:", error);
    return NextResponse.json({ error: "Erro ao carregar o histórico." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardRh(request, "vig-post", 40);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const fechadas = await competenciasFechadas(ctx);
    const col = rhCol(ctx, "rhVigencias");

    // ── Encerrar uma vigência (ex.: benefício cancelado) ───────────────────
    if (body.acao === "encerrar") {
      const id = String(body.id ?? "");
      const fim = String(body.fim ?? "");
      if (!id || id.includes("/") || !isValidDate(fim)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: "Vigência não encontrada." }, { status: 404 });
      const v = snap.data()!;
      if (v.tipo !== "beneficio") return NextResponse.json({ error: "Só benefícios podem ser encerrados. Para salário e encargos, cadastre uma nova vigência." }, { status: 400 });
      const erro = validarEncerramento({ inicio: v.inicio, fim: v.fim ?? null, dados: {} }, fim, fechadas);
      if (erro) return NextResponse.json({ error: MSG[erro] }, { status: 409 });
      await ref.update({ fim, updatedAt: Date.now(), updatedBy: ctx.actor.uid, updatedByName: ctx.actor.name });
      await logRh(ctx, "encerrou_beneficio", { colaboradorId: v.colaboradorId, info: String(v.nome ?? "") });
      await sincronizarSeguro(ctx, monthOf(fim));
      return NextResponse.json({ ok: true });
    }

    // ── Nova vigência ──────────────────────────────────────────────────────
    const tipo = body.tipo as Tipo;
    if (!TIPOS.includes(tipo)) return NextResponse.json({ error: "Tipo inválido." }, { status: 400 });
    const colaboradorId = tipo === "encargos" ? EMPRESA : String(body.colaboradorId ?? "");
    if (!colaboradorId || colaboradorId.includes("/")) return NextResponse.json({ error: "Colaborador inválido." }, { status: 400 });
    const inicio = String(body.inicio ?? "");
    if (!isValidDate(inicio)) return NextResponse.json({ error: "Data de início inválida." }, { status: 400 });

    const dados: Record<string, unknown> = {};
    if (tipo === "alocacao") {
      const erroItens = validarItens(body.itens);
      if (erroItens) return NextResponse.json({ error: erroItens }, { status: 400 });
      const centros = await listarCentros(ctx);
      const porId = new Map(centros.map((c) => [c.id, c]));
      const itens: { centroId: string; pct: number; centroNome: string }[] = [];
      for (const it of body.itens as { centroId: string; pct: number }[]) {
        const c = porId.get(String(it.centroId));
        if (!c) return NextResponse.json({ error: "Centro de custo não encontrado." }, { status: 400 });
        if (!c.ativo) return NextResponse.json({ error: `O centro "${c.nome}" está inativo. Reative-o ou escolha outro.` }, { status: 400 });
        itens.push({ centroId: c.id, pct: Math.round(Number(it.pct) * 100) / 100, centroNome: c.nome });
      }
      dados.itens = itens;
    } else if (tipo === "encargos") {
      const pct = Number(body.pct);
      if (!ehNumero(pct, 200)) return NextResponse.json({ error: "Percentual de encargos inválido." }, { status: 400 });
      dados.pct = Math.round(pct * 100) / 100;
    } else {
      const valor = Math.round(Number(body.valor) * 100) / 100;
      if (!ehNumero(valor, 10_000_000) || (tipo === "salario" && valor <= 0)) {
        return NextResponse.json({ error: tipo === "salario" ? "Informe um salário maior que zero." : "Valor inválido." }, { status: 400 });
      }
      dados.valor = valor;
      if (tipo === "beneficio") {
        const nome = String(body.nome ?? "").trim().slice(0, 60);
        if (nome.length < 2) return NextResponse.json({ error: "Informe o nome do benefício." }, { status: 400 });
        dados.nome = nome;
        dados.tipoBeneficio = ["vt", "vr", "saude", "outro"].includes(String(body.tipoBeneficio)) ? String(body.tipoBeneficio) : "outro";
      }
    }

    if (colaboradorId !== EMPRESA) {
      const c = await rhCol(ctx, "rhColaboradores").doc(colaboradorId).get();
      if (!c.exists) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
    }

    const resultado = await ctx.db.runTransaction(async (tx) => {
      const snap = await tx.get(col.where("colaboradorId", "==", colaboradorId).where("tipo", "==", tipo));
      let grupo = snap.docs.map((d) => ({ ref: d.ref, ...(d.data() as { inicio: string; fim: string | null; nome?: string }) }));
      if (tipo === "beneficio") {
        const alvo = String(dados.nome).toLowerCase();
        grupo = grupo.filter((g) => String(g.nome ?? "").trim().toLowerCase() === alvo);
      }
      const existentes: Vigencia[] = grupo.map((g) => ({ inicio: g.inicio, fim: g.fim ?? null, dados: {} }));
      const erro = validarNovaVigencia(existentes, inicio, fechadas);
      if (erro) return { erro };

      // Encerra a(s) vigência(s) que cobriam o início da nova.
      for (const g of grupo) {
        if (g.inicio < inicio && (g.fim == null || g.fim >= inicio)) {
          tx.update(g.ref, { fim: dayBefore(inicio), updatedAt: Date.now(), updatedBy: ctx.actor.uid, updatedByName: ctx.actor.name });
        }
      }
      const nova = col.doc();
      tx.set(nova, {
        colaboradorId, tipo, inicio, fim: null, ...dados,
        createdAt: Date.now(), createdBy: ctx.actor.uid, createdByName: ctx.actor.name,
      });
      return { id: nova.id };
    });

    if ("erro" in resultado && resultado.erro) return NextResponse.json({ error: MSG[resultado.erro] }, { status: 409 });
    await logRh(ctx, `nova_vigencia_${tipo}`, { colaboradorId: colaboradorId === EMPRESA ? undefined : colaboradorId, info: `início ${inicio}` });
    if (tipo === "alocacao") await recomputarUsoCentros(ctx);
    await sincronizarSeguro(ctx, monthOf(inicio));
    return NextResponse.json({ ok: true, id: resultado.id });
  } catch (error) {
    console.error("Erro RH/vigencias POST:", error);
    return NextResponse.json({ error: "Erro ao salvar a vigência." }, { status: 500 });
  }
}
