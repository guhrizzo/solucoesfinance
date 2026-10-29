export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { guardRh, isCtx, logRh, rhCol, type RhCtx } from "@/lib/rh/server";
import { carregarParametros, carregarTabelas, tabelaDaCompetencia } from "@/lib/rh/folhaServer";
import { assinaturaEvento, calcularEvento, sugerirLinhas, type EntradaEvento, type LinhaEvento, type Motivo, type TipoEvento } from "@/lib/rh/eventos";
import type { TabelaInss, TabelaIrrf } from "@/lib/rh/folha";
import { vigenciaEm, type Vigencia } from "@/lib/rh/vigencia";
import { COMP_RE, isValidDate, lastDay } from "@/lib/rh/datas";
import { r2 } from "@/lib/rh/custo";

// Férias, 13º (1ª e 2ª parcelas) e rescisão — cada um é uma ETAPA própria:
//   rascunho → conferido (conferência manual obrigatória) → fechado
// Qualquer alteração depois de conferido volta o evento para rascunho, e o
// fechamento recalcula e recusa se o resultado mudou desde a conferência.
// Ao fechar gera contas a pagar (líquido e encargos). O custo gerencial NÃO
// recebe estes valores de novo: férias e 13º já são provisionados todo mês.

const TIPOS: TipoEvento[] = ["ferias", "decimo1", "decimo2", "rescisao"];
const MOTIVOS: Motivo[] = ["sem_justa_causa", "pedido_demissao", "justa_causa", "acordo"];
const CATEGORIA: Record<TipoEvento, string> = {
  ferias: "Férias / 13º salário", decimo1: "Férias / 13º salário", decimo2: "Férias / 13º salário", rescisao: "Rescisões trabalhistas",
};

const n = (v: unknown, max = 1_000_000_000) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) && x >= 0 && x <= max ? x : 0;
};

function sanitizarLinhas(raw: unknown): LinhaEvento[] | null {
  if (!Array.isArray(raw) || raw.length > 40) return null;
  return raw.map((l: Partial<LinhaEvento>) => ({
    codigo: String(l.codigo ?? "").slice(0, 8),
    descricao: String(l.descricao ?? "").slice(0, 120),
    natureza: l.natureza === "desconto" ? "desconto" : "provento",
    valor: r2(n(l.valor)),
    inss: l.inss === true, irrf: l.irrf === true, fgts: l.fgts === true,
    grupo: l.grupo === "decimo" ? "decimo" : "normal",
    informativo: l.informativo === true,
    ...(l.ref ? { ref: String(l.ref).slice(0, 30) } : {}),
  }));
}

async function contexto(ctx: RhCtx, colaboradorId: string, comp: string) {
  const c = await rhCol(ctx, "rhColaboradores").doc(colaboradorId).get();
  if (!c.exists) return null;
  const vigs = await rhCol(ctx, "rhVigencias").where("colaboradorId", "==", colaboradorId).where("tipo", "==", "salario").get();
  const lista: Vigencia<{ valor: number }>[] = vigs.docs.map((d) => ({ inicio: String(d.data().inicio), fim: (d.data().fim as string | null) ?? null, dados: { valor: Number(d.data().valor) || 0 } }));
  const ate = lastDay(comp);
  const salarioMensal = vigenciaEm(lista, ate)?.dados.valor ?? [...lista].sort((a, b) => b.inicio.localeCompare(a.inicio))[0]?.dados.valor ?? 0;
  const [params, tInss, tIrrf] = await Promise.all([carregarParametros(ctx), carregarTabelas(ctx, "inss"), carregarTabelas(ctx, "irrf")]);
  return {
    colab: c.data()!, salarioMensal, params,
    inss: (tabelaDaCompetencia(tInss, comp)?.dados as TabelaInss | undefined) ?? null,
    irrf: (tabelaDaCompetencia(tIrrf, comp)?.dados as TabelaIrrf | undefined) ?? null,
  };
}

function entradaDe(tipo: TipoEvento, inputs: Record<string, unknown>, base: { salarioMensal: number; params: EntradaEvento["params"] }): EntradaEvento {
  const motivo = MOTIVOS.includes(inputs.motivo as Motivo) ? (inputs.motivo as Motivo) : "sem_justa_causa";
  return {
    salarioMensal: base.salarioMensal, params: base.params, mediaVariaveis: n(inputs.mediaVariaveis, 10_000_000),
    diasGozo: n(inputs.diasGozo, 60), diasAbono: n(inputs.diasAbono, 30), avos: n(inputs.avos, 12), valor1aParcela: n(inputs.valor1aParcela, 10_000_000),
    motivo: tipo === "rescisao" ? motivo : undefined, diasSaldoSalario: n(inputs.diasSaldoSalario, 31), diasAvisoIndenizado: n(inputs.diasAvisoIndenizado, 90),
    avosDecimo: n(inputs.avosDecimo, 12), avosFerias: n(inputs.avosFerias, 12), periodosFeriasVencidas: n(inputs.periodosFeriasVencidas, 5),
    saldoFgts: n(inputs.saldoFgts, 100_000_000), pctMultaFgts: n(inputs.pctMultaFgts, 100),
  };
}

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "ev-get");
    if (!isCtx(ctx)) return ctx;
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      if (id.includes("/")) return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
      const s = await rhCol(ctx, "rhEventos").doc(id).get();
      if (!s.exists) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
      return NextResponse.json({ id: s.id, ...s.data() });
    }
    const snap = await rhCol(ctx, "rhEventos").orderBy("createdAt", "desc").limit(200).get();
    return NextResponse.json({
      eventos: snap.docs.map((d) => {
        const x = d.data();
        return { id: d.id, tipo: x.tipo, colaboradorId: x.colaboradorId, nome: x.nome, comp: x.comp, status: x.status, liquido: x.resultado?.liquido ?? 0, conferidoPorNome: x.conferencia?.porNome ?? null };
      }),
    });
  } catch (error) {
    console.error("Erro RH/folha/eventos GET:", error);
    return NextResponse.json({ error: "Erro ao carregar os eventos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardRh(request, "ev-post", 80);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const stamp = { updatedAt: Date.now(), updatedBy: ctx.actor.uid, updatedByName: ctx.actor.name };

    // ── Sugerir / salvar: precisam de tipo, colaborador e competência ──────
    if (body.acao === "sugerir" || body.acao === "salvar") {
      const tipo = body.tipo as TipoEvento;
      const colaboradorId = String(body.colaboradorId ?? "");
      const comp = String(body.comp ?? "");
      if (!TIPOS.includes(tipo) || !colaboradorId || colaboradorId.includes("/") || !COMP_RE.test(comp)) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
      const c = await contexto(ctx, colaboradorId, comp);
      if (!c) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
      const inputs = (body.inputs ?? {}) as Record<string, unknown>;

      if (body.acao === "sugerir") {
        if (!(c.salarioMensal > 0)) return NextResponse.json({ error: "Colaborador sem salário cadastrado." }, { status: 409 });
        // Recalcular as linhas que o usuário editou (sem salvar).
        const editadas = body.linhas ? sanitizarLinhas(body.linhas) : null;
        if (editadas) {
          const resultado = calcularEvento({ linhas: editadas, dependentes: Number(c.colab.dependentes) || 0, inss: c.inss, irrf: c.irrf, aliquotaFgts: c.params.aliquotaFgts });
          return NextResponse.json({ linhas: editadas, resultado, erros: resultado.erros, salarioMensal: c.salarioMensal });
        }
        const { linhas, erros } = sugerirLinhas(tipo, entradaDe(tipo, inputs, c));
        const resultado = calcularEvento({ linhas, dependentes: Number(c.colab.dependentes) || 0, inss: c.inss, irrf: c.irrf, aliquotaFgts: c.params.aliquotaFgts });
        return NextResponse.json({ linhas, resultado, erros: [...erros, ...resultado.erros], salarioMensal: c.salarioMensal });
      }

      const linhas = sanitizarLinhas(body.linhas);
      if (!linhas || linhas.length === 0 || linhas.some((l) => !l.descricao)) return NextResponse.json({ error: "Informe ao menos uma verba, todas com descrição." }, { status: 400 });
      const resultado = calcularEvento({ linhas, dependentes: Number(c.colab.dependentes) || 0, inss: c.inss, irrf: c.irrf, aliquotaFgts: c.params.aliquotaFgts });
      const doc = {
        tipo, colaboradorId, nome: String(c.colab.nome), comp, inputs, linhas,
        resultado: { bases: resultado.bases, inss: resultado.inss, irrf: resultado.irrf, fgts: resultado.fgts, proventos: resultado.proventos, descontos: resultado.descontos, liquido: resultado.liquido },
        erros: resultado.erros, status: "rascunho", conferencia: FieldValue.delete(), ...stamp,
      };
      if (body.id) {
        const id = String(body.id);
        if (id.includes("/")) return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
        const ref = rhCol(ctx, "rhEventos").doc(id);
        const atual = await ref.get();
        if (!atual.exists) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
        if (atual.data()?.status === "fechado") return NextResponse.json({ error: "Evento fechado. Reabra-o (com motivo) para alterar." }, { status: 409 });
        await ref.set(doc, { merge: true });
        await logRh(ctx, "alterou_evento_folha", { colaboradorId, colaboradorNome: doc.nome, info: `${tipo} ${comp}` });
        return NextResponse.json({ ok: true, id, resultado });
      }
      const ref = await rhCol(ctx, "rhEventos").add({ ...doc, conferencia: null, createdAt: Date.now(), createdBy: ctx.actor.uid, createdByName: ctx.actor.name });
      await logRh(ctx, "criou_evento_folha", { colaboradorId, colaboradorNome: doc.nome, info: `${tipo} ${comp}` });
      return NextResponse.json({ ok: true, id: ref.id, resultado });
    }

    // ── Ações sobre um evento existente ────────────────────────────────────
    const id = String(body.id ?? "");
    if (!id || id.includes("/")) return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
    const ref = rhCol(ctx, "rhEventos").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
    const ev = snap.data()!;
    const recalcular = async () => {
      const c = await contexto(ctx, ev.colaboradorId, ev.comp);
      if (!c) return null;
      return calcularEvento({ linhas: ev.linhas as LinhaEvento[], dependentes: Number(c.colab.dependentes) || 0, inss: c.inss, irrf: c.irrf, aliquotaFgts: c.params.aliquotaFgts });
    };

    if (body.acao === "excluir") {
      if (ev.status === "fechado") return NextResponse.json({ error: "Evento fechado. Reabra-o antes de excluir." }, { status: 409 });
      await ref.delete();
      await logRh(ctx, "excluiu_evento_folha", { colaboradorId: ev.colaboradorId, colaboradorNome: ev.nome, info: `${ev.tipo} ${ev.comp}` });
      return NextResponse.json({ ok: true });
    }

    if (body.acao === "conferir") {
      if (ev.status !== "rascunho") return NextResponse.json({ error: "Só um rascunho pode ser conferido." }, { status: 409 });
      const r = await recalcular();
      if (!r || r.erros.length > 0) return NextResponse.json({ error: r ? r.erros.join(" ") : "Colaborador não encontrado." }, { status: 409 });
      await ref.update({
        status: "conferido", conferencia: { hash: assinaturaEvento(r), por: ctx.actor.uid, porNome: ctx.actor.name, em: Date.now() },
        resultado: { bases: r.bases, inss: r.inss, irrf: r.irrf, fgts: r.fgts, proventos: r.proventos, descontos: r.descontos, liquido: r.liquido }, ...stamp,
      });
      await logRh(ctx, "conferiu_evento_folha", { colaboradorId: ev.colaboradorId, colaboradorNome: ev.nome, info: `${ev.tipo} ${ev.comp}` });
      return NextResponse.json({ ok: true });
    }

    if (body.acao === "fechar") {
      if (ev.status !== "conferido") return NextResponse.json({ error: "A conferência manual é obrigatória antes de fechar." }, { status: 409 });
      const r = await recalcular();
      if (!r || r.erros.length > 0) return NextResponse.json({ error: r ? r.erros.join(" ") : "Colaborador não encontrado." }, { status: 409 });
      if (assinaturaEvento(r) !== ev.conferencia?.hash) {
        await ref.update({ status: "rascunho", conferencia: null });
        return NextResponse.json({ error: "O cálculo mudou desde a conferência (tabelas ou parâmetros). Confira de novo." }, { status: 409 });
      }
      if (r.liquido < 0) return NextResponse.json({ error: "O líquido está negativo. Ajuste as verbas." }, { status: 409 });
      const venc = (body.vencimentos ?? {}) as Record<string, string>;
      const encargos = r2(r.inss + r.irrf + r.fgts);
      const contas = [
        { id: "liquido", valor: r.liquido, titulo: `${ev.nome} — ${rotulo(ev.tipo)} ${ev.comp}`, categoria: CATEGORIA[ev.tipo as TipoEvento] },
        { id: "encargos", valor: encargos, titulo: `${ev.nome} — encargos de ${rotulo(ev.tipo)} ${ev.comp} (FGTS/INSS/IRRF)`, categoria: "Encargos sociais (FGTS / INSS)" },
      ].filter((c) => c.valor > 0);
      for (const c of contas) if (!isValidDate(String(venc[c.id] ?? ""))) return NextResponse.json({ error: `Informe o vencimento de: ${c.titulo}.` }, { status: 400 });
      const now = Date.now();
      const batch = ctx.db.batch();
      const bills = ctx.db.collection("users").doc(ctx.ownerUid).collection("bills");
      const billIds: string[] = [];
      for (const c of contas) {
        const bid = `rhevento_${id}_${c.id}`;
        billIds.push(bid);
        batch.set(bills.doc(bid), {
          title: c.titulo, amount: c.valor, dueDate: venc[c.id], category: c.categoria, status: "pendente", recurrence: "unica",
          notes: "Gerada pelo RH. Valores devem ser conferidos pelo contador responsável.", photos: [], createdAt: now,
          userId: ctx.ownerUid, createdBy: ctx.actor.uid, createdByName: ctx.actor.name, rhEventoId: id,
        });
      }
      batch.update(ref, { status: "fechado", fechadoEm: now, fechadoPorNome: ctx.actor.name, vencimentos: venc, billIds, ...stamp });
      await batch.commit();
      await logRh(ctx, "fechou_evento_folha", { colaboradorId: ev.colaboradorId, colaboradorNome: ev.nome, info: `${ev.tipo} ${ev.comp}` });
      return NextResponse.json({ ok: true });
    }

    if (body.acao === "reabrir") {
      if (ev.status !== "fechado") return NextResponse.json({ error: "Este evento não está fechado." }, { status: 409 });
      const motivo = String(body.motivo ?? "").trim().slice(0, 300);
      if (motivo.length < 5) return NextResponse.json({ error: "Informe o motivo da reabertura (mínimo de 5 caracteres)." }, { status: 400 });
      const refs = ((ev.billIds ?? []) as string[]).map((b) => ctx.db.collection("users").doc(ctx.ownerUid).collection("bills").doc(b));
      const bills = await Promise.all(refs.map((r) => r.get()));
      const paga = bills.find((b) => b.exists && (b.data()?.status === "pago" || Number(b.data()?.amountPaid) > 0));
      if (paga) return NextResponse.json({ error: `A conta "${paga.data()?.title}" já foi paga ou teve baixa. Estorne o pagamento em Contas a pagar antes de reabrir.` }, { status: 409 });
      const batch = ctx.db.batch();
      bills.forEach((b) => { if (b.exists) batch.delete(b.ref); });
      batch.update(ref, { status: "rascunho", conferencia: null, billIds: [], reaberturas: FieldValue.arrayUnion({ em: Date.now(), por: ctx.actor.uid, porNome: ctx.actor.name, motivo }), ...stamp });
      await batch.commit();
      await logRh(ctx, "reabriu_evento_folha", { colaboradorId: ev.colaboradorId, colaboradorNome: ev.nome, info: `${ev.tipo} ${ev.comp} — ${motivo}` });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("Erro RH/folha/eventos POST:", error);
    return NextResponse.json({ error: "Erro ao salvar o evento." }, { status: 500 });
  }
}

function rotulo(tipo: string): string {
  return tipo === "ferias" ? "férias" : tipo === "decimo1" ? "13º (1ª parcela)" : tipo === "decimo2" ? "13º (2ª parcela)" : "rescisão";
}
