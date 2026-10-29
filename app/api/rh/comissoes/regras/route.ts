export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRh, isCtx, logRh, rhCol, sincronizarSeguro } from "@/lib/rh/server";
import { carregarRegras } from "@/lib/rh/comissaoServer";
import { validarRegra } from "@/lib/rh/comissao";
import { monthOf } from "@/lib/rh/datas";

// Regras de comissão. Mudar uma regra só afeta competências ABERTAS: as
// fechadas usam o retrato congelado no fechamento (rhCustos / rhComissoes).

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "regras-get");
    if (!isCtx(ctx)) return ctx;
    const regras = (await carregarRegras(ctx)).sort((a, b) => b.inicio.localeCompare(a.inicio));
    return NextResponse.json({ regras });
  } catch (error) {
    console.error("Erro RH/comissoes/regras GET:", error);
    return NextResponse.json({ error: "Erro ao carregar as regras." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardRh(request, "regras-post", 40);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const col = rhCol(ctx, "rhComissaoRegras");

    if (body.acao === "remover") {
      const id = String(body.id ?? "");
      if (!id || id.includes("/")) return NextResponse.json({ error: "Regra inválida." }, { status: 400 });
      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists) return NextResponse.json({ error: "Regra não encontrada." }, { status: 404 });
      const inicio = String(snap.data()!.inicio);
      await ref.delete();
      await logRh(ctx, "removeu_regra_comissao", { info: String(snap.data()!.nome ?? "") });
      await sincronizarSeguro(ctx, monthOf(inicio));
      return NextResponse.json({ ok: true });
    }

    const v = validarRegra(body);
    if (!v.ok) return NextResponse.json({ error: v.erro }, { status: 400 });

    const id = body.id ? String(body.id) : "";
    if (id.includes("/")) return NextResponse.json({ error: "Regra inválida." }, { status: 400 });
    let desde = v.regra.inicio;
    const stamp = { updatedAt: Date.now(), updatedBy: ctx.actor.uid, updatedByName: ctx.actor.name };
    if (id) {
      const ref = col.doc(id);
      const atual = await ref.get();
      if (!atual.exists) return NextResponse.json({ error: "Regra não encontrada." }, { status: 404 });
      if (String(atual.data()!.inicio) < desde) desde = String(atual.data()!.inicio);
      await ref.set({ ...v.regra, ...stamp }, { merge: true });
    } else {
      await col.add({ ...v.regra, ...stamp, createdAt: Date.now(), createdBy: ctx.actor.uid, createdByName: ctx.actor.name });
    }
    await logRh(ctx, id ? "alterou_regra_comissao" : "criou_regra_comissao", { info: v.regra.nome });
    await sincronizarSeguro(ctx, monthOf(desde));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro RH/comissoes/regras POST:", error);
    return NextResponse.json({ error: "Erro ao salvar a regra." }, { status: 500 });
  }
}
