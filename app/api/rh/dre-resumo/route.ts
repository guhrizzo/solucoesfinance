export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { COMP_RE } from "@/lib/rh/datas";

// Totais AGREGADOS do custo de pessoas por competência, pro DRE. Quem tem
// "relatorios" vê só os totais (pessoal e não alocado) — nunca o custo de
// uma pessoa. Os totais vêm de rhCompetencias, mantidos por sincronizarCentros.

export async function GET(request: Request) {
  try {
    const scope = await requireScope(request, ["relatorios", "rh"]);
    if (isScopeError(scope)) return NextResponse.json({ error: scope.error }, { status: scope.status });
    const { limited } = checkRateLimit(`rh-dre:${getClientIp(request)}:${scope.ownerUid}`, { windowMs: 60_000, max: 60 }, scope.isSupremeAdmin);
    if (limited) return NextResponse.json({ error: "Muitas tentativas em pouco tempo." }, { status: 429 });

    const url = new URL(request.url);
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!COMP_RE.test(from) || !COMP_RE.test(to) || from > to) return NextResponse.json({ error: "Período inválido." }, { status: 400 });

    const db = await getAdminDb();
    const snap = await db.collection("users").doc(scope.ownerUid).collection("rhCompetencias").get();
    const meses: Record<string, { pessoal: number; naoAlocado: number }> = {};
    for (const d of snap.docs) {
      if (d.id < from || d.id > to) continue;
      const x = d.data();
      const pessoal = Number(x.totalPessoal) || 0;
      if (pessoal > 0) meses[d.id] = { pessoal, naoAlocado: Number(x.totalNaoAlocado) || 0 };
    }
    return NextResponse.json({ meses });
  } catch (error) {
    console.error("Erro RH/dre-resumo GET:", error);
    return NextResponse.json({ error: "Erro ao carregar o custo de pessoal." }, { status: 500 });
  }
}
