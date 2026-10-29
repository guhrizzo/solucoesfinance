export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRh, isCtx, logRh, rhCol, sincronizarSeguro } from "@/lib/rh/server";
import { carregarConfigMargem } from "@/lib/rh/comissaoServer";
import { r2 } from "@/lib/rh/comissao";
import { monthOf, todayKey } from "@/lib/rh/datas";

// Premissas da margem de contribuição (estimativas por percentual da receita):
// imposto efetivo, taxa de cartão (débito/crédito) e outros custos (frete etc.).
// A taxa do marketplace NÃO entra aqui: vem real, do lançamento do pedido.

const CAMPOS = ["aliquotaImpostoPct", "taxaDebitoPct", "taxaCreditoPct", "outrosCustosPct"] as const;

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "cfg-get");
    if (!isCtx(ctx)) return ctx;
    return NextResponse.json(await carregarConfigMargem(ctx));
  } catch (error) {
    console.error("Erro RH/comissoes/config GET:", error);
    return NextResponse.json({ error: "Erro ao carregar as premissas." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const ctx = await guardRh(request, "cfg-put", 20);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const dados: Record<string, number> = {};
    for (const k of CAMPOS) {
      const n = Number(body[k] ?? 0);
      if (!Number.isFinite(n) || n < 0 || n > 100) return NextResponse.json({ error: "Os percentuais devem estar entre 0 e 100." }, { status: 400 });
      dados[k] = r2(n);
    }
    await rhCol(ctx, "rhConfig").doc("margem").set({ ...dados, updatedAt: Date.now(), updatedByName: ctx.actor.name }, { merge: true });
    await logRh(ctx, "alterou_premissas_margem");
    // Recalcula as competências abertas dos últimos 6 meses.
    const [y, m] = monthOf(todayKey()).split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 - 5, 1));
    await sincronizarSeguro(ctx, d.toISOString().slice(0, 7));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Erro RH/comissoes/config PUT:", error);
    return NextResponse.json({ error: "Erro ao salvar as premissas." }, { status: 500 });
  }
}
