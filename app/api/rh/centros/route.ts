export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRh, isCtx, logRh, rhCol, listarCentros } from "@/lib/rh/server";
import { CENTROS_SUGERIDOS, centrosSimilares } from "@/lib/rh/alocacao";
import { monthOf, todayKey } from "@/lib/rh/datas";

// Centros de custo vistos pelo RH. Criar aqui usa o MESMO documento do módulo
// Centro de custo (coleção raiz `costCenters`, campo userId) — o centro
// aparece lá normalmente, sem distinção. Nunca cria nada sem pedido explícito
// e sempre avisa quando já existe centro com nome igual ou parecido.

const COR = (n: number) => `var(--cat-${(n % 8) + 1})`;

async function criarCentro(
  ctx: Parameters<typeof listarCentros>[0],
  nome: string,
  orcamento: number,
  indice: number,
): Promise<string> {
  const ref = ctx.db.collection("costCenters").doc();
  await ref.set({
    name: nome,
    budgetsByMonth: orcamento > 0 ? { [monthOf(todayKey())]: orcamento } : {},
    color: COR(indice),
    userId: ctx.ownerUid,
    createdAt: new Date(),
    categories: [],
  });
  return ref.id;
}

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "centros-get");
    if (!isCtx(ctx)) return ctx;
    const [centros, cfg] = await Promise.all([listarCentros(ctx), rhCol(ctx, "rhConfig").doc("geral").get()]);
    return NextResponse.json({
      centros,
      sugestaoDispensada: cfg.exists && cfg.data()?.sugestaoDispensada === true,
      sugeridos: CENTROS_SUGERIDOS,
    });
  } catch (error) {
    console.error("Erro RH/centros GET:", error);
    return NextResponse.json({ error: "Erro ao carregar os centros de custo." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await guardRh(request, "centros-post", 30);
    if (!isCtx(ctx)) return ctx;
    const body = await request.json().catch(() => ({}));
    const existentes = await listarCentros(ctx);

    // ── Um centro (modal rápido na alocação) ───────────────────────────────
    if (body.acao === "criar") {
      const nome = String(body.nome ?? "").trim().slice(0, 60);
      if (nome.length < 2) return NextResponse.json({ error: "Informe o nome do centro de custo." }, { status: 400 });
      const orcamento = body.orcamento === undefined || body.orcamento === "" ? 0 : Math.round(Number(body.orcamento) * 100) / 100;
      if (!Number.isFinite(orcamento) || orcamento < 0 || orcamento > 1_000_000_000) {
        return NextResponse.json({ error: "Orçamento mensal inválido." }, { status: 400 });
      }
      const similares = centrosSimilares(nome, existentes);
      if (similares.length > 0 && body.forcar !== true) {
        return NextResponse.json(
          { error: "Já existe centro de custo com nome igual ou parecido.", similares: similares.map((c) => ({ id: c.id, nome: c.nome })) },
          { status: 409 },
        );
      }
      const id = await criarCentro(ctx, nome, orcamento, existentes.length);
      await logRh(ctx, "criou_centro", { info: nome });
      return NextResponse.json({ ok: true, id, nome });
    }

    // ── Sugeridos (só os que o usuário marcou) ─────────────────────────────
    if (body.acao === "sugeridos") {
      const pedidos = (Array.isArray(body.nomes) ? body.nomes : [])
        .map((n: unknown) => String(n))
        .filter((n: string) => (CENTROS_SUGERIDOS as readonly string[]).includes(n));
      if (pedidos.length === 0) return NextResponse.json({ error: "Escolha ao menos um centro." }, { status: 400 });
      const criados: { id: string; nome: string }[] = [];
      const ignorados: { nome: string; existente: string }[] = [];
      let lista = existentes;
      for (const nome of pedidos as string[]) {
        const sim = centrosSimilares(nome, lista);
        if (sim.length > 0) { ignorados.push({ nome, existente: sim[0].nome }); continue; }
        const id = await criarCentro(ctx, nome, 0, lista.length);
        criados.push({ id, nome });
        lista = [...lista, { id, nome, ativo: true, rhAlocados: 0 }];
      }
      await rhCol(ctx, "rhConfig").doc("geral").set({ sugestaoDispensada: true }, { merge: true });
      await logRh(ctx, "criou_centros_sugeridos", { info: criados.map((c) => c.nome).join(", ") });
      return NextResponse.json({ ok: true, criados, ignorados });
    }

    if (body.acao === "dispensarSugestao") {
      await rhCol(ctx, "rhConfig").doc("geral").set({ sugestaoDispensada: true }, { merge: true });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("Erro RH/centros POST:", error);
    return NextResponse.json({ error: "Erro ao criar o centro de custo." }, { status: 500 });
  }
}
