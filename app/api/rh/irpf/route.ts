export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { guardRh, isCtx, logRh, rhCol } from "@/lib/rh/server";
import { montarDemonstrativoIrpf, type EventoFechadoIrpf, type FolhaFechadaIrpf } from "@/lib/rh/irpf";
import { buildIrpfPdf } from "@/lib/rh/irpfPdf";

// Demonstrativo anual de IRPF por colaborador (folhas e eventos FECHADOS).
// Dado sensível: gestor de RH + PIN. ?pdf=1 devolve o PDF; sem ele, o JSON.

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "irpf-get", 30, "rh", true);
    if (!isCtx(ctx)) return ctx;
    const url = new URL(request.url);
    const colaboradorId = url.searchParams.get("colaboradorId") ?? "";
    const ano = Number(url.searchParams.get("ano"));
    if (!colaboradorId || colaboradorId.includes("/")) return NextResponse.json({ error: "Colaborador inválido." }, { status: 400 });
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return NextResponse.json({ error: "Ano inválido." }, { status: 400 });

    const colab = await rhCol(ctx, "rhColaboradores").doc(colaboradorId).get();
    if (!colab.exists) return NextResponse.json({ error: "Colaborador não encontrado." }, { status: 404 });
    const c = colab.data()!;

    const [folhasSnap, eventosSnap] = await Promise.all([
      rhCol(ctx, "rhFolhaItens").where("colaboradorId", "==", colaboradorId).get(),
      rhCol(ctx, "rhEventos").where("colaboradorId", "==", colaboradorId).where("status", "==", "fechado").get(),
    ]);
    const folhas: FolhaFechadaIrpf[] = folhasSnap.docs.map((d) => {
      const x = d.data();
      return {
        comp: String(x.comp), dependentes: Number(x.dependentes) || 0, baseIrrf: Number(x.resultado?.bases?.irrf) || 0,
        inss: Number(x.resultado?.inss) || 0, irrf: Number(x.resultado?.irrf) || 0, metodo: x.resultado?.irrfMetodo ?? null,
      };
    });
    const eventos: EventoFechadoIrpf[] = eventosSnap.docs.map((d) => {
      const x = d.data();
      const b = x.resultado?.bases ?? {};
      return {
        id: d.id, tipo: String(x.tipo), comp: String(x.comp), rendimentoNormal: Number(b.irrfNormal) || 0, rendimento13: Number(b.irrfDecimo) || 0,
        inss: Number(x.resultado?.inss) || 0, irrf: Number(x.resultado?.irrf) || 0,
      };
    });
    const demonstrativo = montarDemonstrativoIrpf(ano, folhas, eventos);
    await logRh(ctx, "consultou_irpf", { colaboradorId, colaboradorNome: String(c.nome ?? ""), info: String(ano) });

    if (url.searchParams.get("pdf") !== "1") return NextResponse.json({ demonstrativo });

    const companySnap = await ctx.db.doc(`users/${ctx.ownerUid}/profile/company`).get();
    const company = companySnap.exists ? companySnap.data() ?? {} : {};
    const pdf = await buildIrpfPdf({
      empresa: { nome: String(company.nomeFantasia || company.razaoSocial || "Empresa"), cnpj: company.cnpj ? String(company.cnpj) : undefined },
      colaborador: { nome: String(c.nome ?? ""), cargo: String(c.cargo ?? ""), cpfMascarado: `•••.•••.•••-${c.cpfFinal2 ?? "••"}` },
      demonstrativo,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf", "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="irpf-${ano}-${String(c.nome ?? "colaborador").replace(/[^\p{L}\p{N}]+/gu, "_")}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Erro RH/irpf GET:", error);
    return NextResponse.json({ error: "Erro ao montar o demonstrativo." }, { status: 500 });
  }
}
