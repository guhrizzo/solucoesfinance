export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import type { DocumentData } from "firebase-admin/firestore";
import { guardRh, isCtx, logRh, rhCol, competenciasFechadas, carregarAlocacoes, listarCentros, recomputarUsoCentros, sincronizarSeguro } from "@/lib/rh/server";
import { decryptJson, decryptText, encryptJson, encryptText, hashCpf, maskCpf } from "@/lib/rh/crypto";
import { validarColaborador, validarCoerencia, type Banco } from "@/lib/rh/validate";
import { validarMudancaDeData } from "@/lib/rh/vigencia";
import { monthOf, todayKey } from "@/lib/rh/datas";
import { vigenciaEm } from "@/lib/rh/vigencia";

// Cadastro de colaboradores. CPF e dados bancários são cifrados (AES-256-GCM);
// a lista nunca devolve o CPF inteiro — só o fim mascarado. Ver o cadastro
// completo (?revelar=1) gera registro em rhLog. Toda gravação também.

const publico = (id: string, d: DocumentData) => ({
  id,
  nome: d.nome,
  cargo: d.cargo ?? "",
  vinculo: d.vinculo,
  dataEntrada: d.dataEntrada,
  dataSaida: d.dataSaida ?? null,
  status: d.status,
  dependentes: d.dependentes ?? 0,
  comissionado: !!d.comissionado,
  cpfMascarado: d.cpfFinal2 ? `•••.•••.•••-${d.cpfFinal2}` : maskCpf(""),
  temBanco: !!d.bancoEnc,
  membroUid: d.membroUid ?? null,
  updatedByName: d.updatedByName ?? d.createdByName ?? null,
  updatedAt: d.updatedAt ?? d.createdAt ?? null,
});

/**
 * Vincula o colaborador a um usuário do sistema (membro da equipe, ou o próprio
 * dono) — é o que dá ao usuário a visão "meus indicadores". Um usuário só pode
 * estar ligado a um colaborador.
 */
async function resolverMembro(ctx: NonNullable<Parameters<typeof logRh>[0]>, valor: unknown, selfId: string | null): Promise<{ uid: string | null } | { erro: string }> {
  const uid = valor ? String(valor) : null;
  if (!uid) return { uid: null };
  if (uid.includes("/")) return { erro: "Usuário inválido." };
  if (uid !== ctx.ownerUid) {
    const m = await ctx.db.collection("users").doc(ctx.ownerUid).collection("team").doc(uid).get();
    if (!m.exists) return { erro: "Usuário não encontrado na sua equipe." };
  }
  const outro = await rhCol(ctx, "rhColaboradores").where("membroUid", "==", uid).get();
  if (outro.docs.some((d) => d.id !== selfId)) return { erro: "Este usuário já está vinculado a outro colaborador." };
  return { uid };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    // Ver CPF e dados bancários completos exige o PIN.
    const ctx = await guardRh(request, "colab-get", 60, "rh", url.searchParams.get("revelar") === "1");
    if (!isCtx(ctx)) return ctx;
    const id = url.searchParams.get("id");

    if (id) {
      if (id.includes("/")) return NextResponse.json({ error: "Colaborador inválido." }, { status: 400 });
      const snap = await rhCol(ctx, "rhColaboradores").doc(id).get();
      if (!snap.exists) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
      const d = snap.data()!;
      const out: Record<string, unknown> = publico(snap.id, d);
      if (url.searchParams.get("revelar") === "1") {
        try {
          out.cpf = d.cpfEnc ? decryptText(d.cpfEnc) : "";
          out.banco = d.bancoEnc ? decryptJson<Banco>(d.bancoEnc) : null;
        } catch (e) {
          console.error("RH: falha ao decifrar:", e);
          return NextResponse.json({ error: "Não foi possível ler os dados protegidos. Verifique a chave RH_ENC_KEY." }, { status: 500 });
        }
        await logRh(ctx, "visualizou_dados_sensiveis", { colaboradorId: snap.id, colaboradorNome: d.nome, campos: ["cpf", "banco"] });
      }
      return NextResponse.json(out);
    }

    const [snap, aloc, centros] = await Promise.all([rhCol(ctx, "rhColaboradores").get(), carregarAlocacoes(ctx), listarCentros(ctx)]);
    const hoje = todayKey();
    const nomes = new Map(centros.map((c) => [c.id, c.nome]));
    const lista = snap.docs
      .map((d) => {
        const base = publico(d.id, d.data());
        const v = vigenciaEm(aloc.get(d.id) ?? [], hoje);
        const ativo = d.data().status === "ativo" && (!d.data().dataSaida || d.data().dataSaida >= hoje);
        return {
          ...base,
          alocacao: v ? v.dados.itens.map((i) => ({ centroId: i.centroId, centroNome: nomes.get(i.centroId) ?? i.centroNome ?? "—", pct: i.pct })) : [],
          semAlocacao: ativo && !v,
        };
      })
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    return NextResponse.json({ colaboradores: lista });
  } catch (error) {
    console.error("Erro RH/colaboradores GET:", error);
    return NextResponse.json({ error: "Erro ao carregar os colaboradores." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardRh(request, "colab-post", 30);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));

    const v = validarColaborador(body);
    if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
    const d = v.dados as Required<typeof v.dados>;
    const incoerente = validarCoerencia({ dataEntrada: d.dataEntrada, dataSaida: d.dataSaida, status: d.status });
    if (incoerente) return NextResponse.json({ error: incoerente }, { status: 400 });

    let salario = 0;
    if (body.salarioInicial !== undefined && body.salarioInicial !== "") {
      salario = Math.round(Number(body.salarioInicial) * 100) / 100;
      if (!Number.isFinite(salario) || salario < 0 || salario > 10_000_000) {
        return NextResponse.json({ error: "Salário inválido." }, { status: 400 });
      }
    }

    // Entrada num mês já fechado mudaria o custo de um mês congelado.
    const fechadas = await competenciasFechadas(ctx);
    if (fechadas.some((c) => c >= monthOf(d.dataEntrada))) {
      return NextResponse.json({ error: "A data de entrada cai em uma competência já fechada. Reabra a competência ou use uma data posterior." }, { status: 409 });
    }

    const hash = hashCpf(d.cpf);
    const dup = await rhCol(ctx, "rhColaboradores").where("cpfHash", "==", hash).limit(1).get();
    if (!dup.empty) return NextResponse.json({ error: "Já existe um colaborador com este CPF." }, { status: 409 });

    const vinculo = await resolverMembro(ctx, body.membroUid, null);
    if ("erro" in vinculo) return NextResponse.json({ error: vinculo.erro }, { status: 400 });

    const ref = rhCol(ctx, "rhColaboradores").doc();
    const now = Date.now();
    const batch = ctx.db.batch();
    batch.set(ref, {
      nome: d.nome, cargo: d.cargo, vinculo: d.vinculo, dataEntrada: d.dataEntrada, dataSaida: d.dataSaida,
      status: d.status, dependentes: d.dependentes, comissionado: d.comissionado,
      cpfEnc: encryptText(d.cpf), cpfHash: hash, cpfFinal2: d.cpf.slice(9),
      bancoEnc: encryptJson(d.banco), membroUid: vinculo.uid,
      createdAt: now, createdBy: ctx.actor.uid, createdByName: ctx.actor.name,
    });
    if (salario > 0) {
      batch.set(rhCol(ctx, "rhVigencias").doc(), {
        colaboradorId: ref.id, tipo: "salario", valor: salario, inicio: d.dataEntrada, fim: null,
        createdAt: now, createdBy: ctx.actor.uid, createdByName: ctx.actor.name,
      });
    }
    await batch.commit();
    await logRh(ctx, "criou_colaborador", { colaboradorId: ref.id, colaboradorNome: d.nome });
    await sincronizarSeguro(ctx, monthOf(d.dataEntrada));
    return NextResponse.json({ ok: true, id: ref.id });
  } catch (error) {
    console.error("Erro RH/colaboradores POST:", error);
    const falta = error instanceof Error && error.message.includes("RH_ENC_KEY");
    return NextResponse.json(
      { error: falta ? "Chave de criptografia do RH (RH_ENC_KEY) não configurada no servidor." : "Erro ao salvar o colaborador." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const ctx = await guardRh(request, "colab-patch", 60);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const id = String(body.id ?? "");
    if (!id || id.includes("/")) return NextResponse.json({ error: "Colaborador inválido." }, { status: 400 });

    const ref = rhCol(ctx, "rhColaboradores").doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
    const atual = snap.data()!;

    const v = validarColaborador(body, true);
    if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });
    const d = v.dados;

    const final = {
      dataEntrada: d.dataEntrada ?? atual.dataEntrada,
      dataSaida: d.dataSaida !== undefined ? d.dataSaida : (atual.dataSaida ?? null),
      status: d.status ?? atual.status,
    };
    const incoerente = validarCoerencia(final);
    if (incoerente) return NextResponse.json({ error: incoerente }, { status: 400 });

    const fechadas = await competenciasFechadas(ctx);
    if (
      validarMudancaDeData(atual.dataEntrada, final.dataEntrada, fechadas) ||
      validarMudancaDeData(atual.dataSaida ?? null, final.dataSaida, fechadas) ||
      (d.vinculo && d.vinculo !== atual.vinculo && fechadas.some((c) => c >= monthOf(final.dataEntrada) && (!final.dataSaida || c <= monthOf(final.dataSaida))))
    ) {
      return NextResponse.json({ error: "Essa alteração mudaria o custo de uma competência já fechada. Reabra a competência (com motivo) antes." }, { status: 409 });
    }

    const upd: Record<string, unknown> = {};
    const campos: string[] = [];
    for (const k of ["nome", "cargo", "vinculo", "dataEntrada", "dataSaida", "status", "dependentes", "comissionado"] as const) {
      if (d[k] !== undefined && d[k] !== atual[k]) { upd[k] = d[k]; campos.push(k); }
    }
    if (d.cpf !== undefined) {
      const hash = hashCpf(d.cpf);
      if (hash !== atual.cpfHash) {
        const dup = await rhCol(ctx, "rhColaboradores").where("cpfHash", "==", hash).limit(1).get();
        if (!dup.empty) return NextResponse.json({ error: "Já existe um colaborador com este CPF." }, { status: 409 });
        Object.assign(upd, { cpfEnc: encryptText(d.cpf), cpfHash: hash, cpfFinal2: d.cpf.slice(9) });
        campos.push("cpf");
      }
    }
    if (d.banco !== undefined) { upd.bancoEnc = encryptJson(d.banco); campos.push("banco"); }
    if ("membroUid" in body) {
      const vinculo = await resolverMembro(ctx, body.membroUid, id);
      if ("erro" in vinculo) return NextResponse.json({ error: vinculo.erro }, { status: 400 });
      if (vinculo.uid !== (atual.membroUid ?? null)) { upd.membroUid = vinculo.uid; campos.push("membroUid"); }
    }

    if (campos.length === 0) return NextResponse.json({ ok: true, alterado: false });
    Object.assign(upd, { updatedAt: Date.now(), updatedBy: ctx.actor.uid, updatedByName: ctx.actor.name });
    await ref.update(upd);
    await logRh(ctx, "alterou_colaborador", { colaboradorId: id, colaboradorNome: d.nome ?? atual.nome, campos });
    await recomputarUsoCentros(ctx);
    await sincronizarSeguro(ctx, monthOf(final.dataEntrada < atual.dataEntrada ? final.dataEntrada : atual.dataEntrada));
    return NextResponse.json({ ok: true, alterado: true });
  } catch (error) {
    console.error("Erro RH/colaboradores PATCH:", error);
    const falta = error instanceof Error && error.message.includes("RH_ENC_KEY");
    return NextResponse.json(
      { error: falta ? "Chave de criptografia do RH (RH_ENC_KEY) não configurada no servidor." : "Erro ao atualizar o colaborador." },
      { status: 500 },
    );
  }
}

