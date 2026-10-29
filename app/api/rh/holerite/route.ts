export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { hasPermission } from "@/lib/accountScope";
import { guardRh, isCtx, logRh, rhCol } from "@/lib/rh/server";
import { apurarFolha } from "@/lib/rh/folhaServer";
import { buildHoleritePdf, type HoleriteDados } from "@/lib/rh/holeritePdf";
import { COMP_RE } from "@/lib/rh/datas";
import type { LinhaEvento } from "@/lib/rh/eventos";

// Holerite (folha) e recibos de férias / 13º / rescisão em PDF.
//  • Gestor/financeiro: qualquer colaborador; folha aberta sai como PRÉVIA.
//  • Colaborador ("rh_proprio"): só o PRÓPRIO, e só depois que a folha (ou o
//    evento) foi FECHADA — nunca uma prévia.

const TITULO: Record<string, string> = {
  folha: "Holerite — recibo de pagamento", ferias: "Recibo de férias", decimo1: "Recibo — 13º salário (1ª parcela)",
  decimo2: "Recibo — 13º salário (2ª parcela)", rescisao: "Termo de rescisão — demonstrativo",
};

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "holerite-get", 40, ["rh", "rh_proprio"]);
    if (!isCtx(ctx)) return ctx;
    const gestor = hasPermission(ctx.scope, "rh");
    const url = new URL(request.url);
    const eventoId = url.searchParams.get("evento");
    const comp = url.searchParams.get("comp") ?? "";
    let colaboradorId = url.searchParams.get("colaboradorId") ?? "";

    // Quem é o colaborador da visão "meus holerites".
    if (!gestor) {
      const meu = (await rhCol(ctx, "rhColaboradores").where("membroUid", "==", ctx.actor.uid).limit(1).get()).docs[0];
      if (!meu) return NextResponse.json({ error: "Seu usuário não está vinculado a um colaborador." }, { status: 404 });
      colaboradorId = meu.id;
    }

    // Lista de documentos disponíveis (folhas fechadas e eventos fechados) do colaborador.
    if (url.searchParams.get("lista") === "1") {
      if (!colaboradorId || colaboradorId.includes("/")) return NextResponse.json({ error: "Colaborador inválido." }, { status: 400 });
      const [f, e] = await Promise.all([
        rhCol(ctx, "rhFolhaItens").where("colaboradorId", "==", colaboradorId).get(),
        rhCol(ctx, "rhEventos").where("colaboradorId", "==", colaboradorId).where("status", "==", "fechado").get(),
      ]);
      return NextResponse.json({
        colaboradorId,
        folhas: f.docs.map((d) => String(d.data().comp)).sort().reverse(),
        eventos: e.docs.map((d) => ({ id: d.id, tipo: d.data().tipo, comp: d.data().comp })).sort((a, b) => String(b.comp).localeCompare(String(a.comp))),
      });
    }

    const [companySnap] = await Promise.all([ctx.db.doc(`users/${ctx.ownerUid}/profile/company`).get()]);
    const company = companySnap.exists ? companySnap.data() ?? {} : {};
    const empresa = { nome: String(company.nomeFantasia || company.razaoSocial || "Empresa"), cnpj: company.cnpj ? String(company.cnpj) : undefined };

    let dados: HoleriteDados;
    let nomeArquivo: string;

    if (eventoId) {
      if (eventoId.includes("/")) return NextResponse.json({ error: "Evento inválido." }, { status: 400 });
      const s = await rhCol(ctx, "rhEventos").doc(eventoId).get();
      if (!s.exists) return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 });
      const ev = s.data()!;
      if (!gestor && (ev.colaboradorId !== colaboradorId || ev.status !== "fechado")) return NextResponse.json({ error: "Documento indisponível." }, { status: 403 });
      const c = (await rhCol(ctx, "rhColaboradores").doc(ev.colaboradorId).get()).data() ?? {};
      const linhas = (ev.linhas as LinhaEvento[]).filter((l) => l.valor > 0).map((l) => ({
        codigo: l.codigo, descricao: l.descricao, ref: l.ref, informativo: l.informativo,
        provento: l.natureza === "provento" && !l.informativo ? l.valor : undefined,
        desconto: l.natureza === "desconto" && !l.informativo ? l.valor : undefined,
      }));
      const r = ev.resultado;
      if (r.inss > 0) linhas.push({ codigo: "INSS", descricao: "INSS", ref: undefined, informativo: undefined, provento: undefined, desconto: r.inss });
      if (r.irrf > 0) linhas.push({ codigo: "IRRF", descricao: "IRRF", ref: undefined, informativo: undefined, provento: undefined, desconto: r.irrf });
      dados = {
        titulo: TITULO[ev.tipo] ?? "Recibo", previa: ev.status !== "fechado", empresa,
        colaborador: { nome: String(c.nome ?? ev.nome), cargo: String(c.cargo ?? ""), cpfMascarado: `•••.•••.•••-${c.cpfFinal2 ?? "••"}`, admissao: String(c.dataEntrada ?? ""), dependentes: Number(c.dependentes) || 0 },
        competencia: ev.comp, linhas,
        bases: [
          { rotulo: "Base INSS (mensal)", valor: r.bases.inssNormal }, { rotulo: "Base INSS (13º)", valor: r.bases.inssDecimo },
          { rotulo: "Base IRRF (mensal)", valor: r.bases.irrfNormal }, { rotulo: "Base IRRF (13º)", valor: r.bases.irrfDecimo }, { rotulo: "FGTS do evento", valor: r.fgts },
        ],
        totais: { proventos: r.proventos, descontos: r.descontos, liquido: r.liquido },
        notas: ["Verbas e incidências conferidas manualmente antes do fechamento."],
      };
      nomeArquivo = `${ev.tipo}-${ev.comp}-${String(ev.nome).replace(/[^\p{L}\p{N}]+/gu, "_")}.pdf`;
      await logRh(ctx, "baixou_documento", { colaboradorId: ev.colaboradorId, colaboradorNome: ev.nome, info: `${ev.tipo} ${ev.comp}` });
    } else {
      if (!COMP_RE.test(comp) || !colaboradorId || colaboradorId.includes("/")) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
      const folha = await apurarFolha(ctx, comp);
      if (!gestor && !folha.fechada) return NextResponse.json({ error: "O holerite só fica disponível depois que a folha é fechada." }, { status: 403 });
      const l = folha.linhas.find((x) => x.colaboradorId === colaboradorId);
      if (!l) return NextResponse.json({ error: "Colaborador fora da folha deste mês." }, { status: 404 });
      const c = (await rhCol(ctx, "rhColaboradores").doc(colaboradorId).get()).data() ?? {};
      const r = l.resultado;
      dados = {
        titulo: TITULO.folha, previa: !folha.fechada, empresa,
        colaborador: { nome: l.nome, cargo: l.cargo, cpfMascarado: `•••.•••.•••-${c.cpfFinal2 ?? "••"}`, admissao: l.admissao, dependentes: l.dependentes },
        competencia: comp,
        linhas: r.itens.map((i) => ({ codigo: i.codigo, descricao: i.nome, ref: i.ref, provento: i.natureza === "provento" ? i.valor : undefined, desconto: i.natureza === "desconto" ? i.valor : undefined })),
        bases: [
          { rotulo: "Base INSS", valor: r.bases.inss }, { rotulo: "Base IRRF", valor: r.bases.irrf }, { rotulo: "Base FGTS", valor: r.bases.fgts }, { rotulo: "FGTS do mês", valor: r.fgts },
        ],
        totais: { proventos: r.proventos, descontos: r.descontos, liquido: r.liquido },
        notas: r.irrfMetodo === "simplificado" ? ["IRRF calculado pelo desconto simplificado (mais vantajoso)."] : [],
      };
      nomeArquivo = `holerite-${comp}-${l.nome.replace(/[^\p{L}\p{N}]+/gu, "_")}.pdf`;
      await logRh(ctx, "baixou_holerite", { colaboradorId, colaboradorNome: l.nome, info: comp });
    }

    const pdf = await buildHoleritePdf(dados);
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nomeArquivo}"`, "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Erro RH/holerite GET:", error);
    return NextResponse.json({ error: "Erro ao gerar o PDF." }, { status: 500 });
  }
}
