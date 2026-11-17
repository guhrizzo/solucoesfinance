// app/api/inter/boletos/atualizar/route.ts
//
// POST — "Atualizar": consulta no Banco Inter cada boleto em aberto e aplica a
// situação pelo núcleo idempotente (lib/interBoletoServer.ts atualizarBoletos).
// Pago vira entrada no Fluxo de Caixa uma vez só. Dono ou membro com a
// permissão de Contas a Receber, plano Pro, rate limit por conta.

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { atualizarBoletos } from "@/lib/interBoletoServer";
import { guardInter, interKeyConfigured, SERVER_CONFIG_ERROR } from "../../_guard";
import { actorDe, PERMISSAO_BOLETOS, respostaErro } from "../_comum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE = { windowMs: 10 * 60 * 1000, max: 6 }; // 6 atualizações / 10 min por conta

export async function POST(req: NextRequest) {
  const scope = await guardInter(req, { rateKey: "inter-boleto-atualizar", rate: RATE, permission: PERMISSAO_BOLETOS });
  if (scope instanceof NextResponse) return scope;
  if (!interKeyConfigured()) return NextResponse.json({ error: SERVER_CONFIG_ERROR }, { status: 500 });

  try {
    const db = await getAdminDb();
    const r = await atualizarBoletos(db, scope.ownerUid, actorDe(scope));
    return NextResponse.json({ ok: true, consultados: r.consultados, pagos: r.pagos });
  } catch (e) {
    return respostaErro(e, "atualizar", "Falha ao atualizar os boletos do Banco Inter.");
  }
}
