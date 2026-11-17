// app/api/inter/boletos/[id]/cancelar/route.ts
//
// POST — cancela um boleto no Banco Inter (lib/interBoletoServer.ts
// cancelarBoleto): recusa se já pago (confere no Inter antes), grava CANCELADO
// + cancelledBy e limpa o boleto da conta a receber ligada. Dono ou membro com a
// permissão de Contas a Receber, plano Pro, rate limit por conta.

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { cancelarBoleto } from "@/lib/interBoletoServer";
import { guardInter, interKeyConfigured, SERVER_CONFIG_ERROR } from "../../../_guard";
import { actorDe, PERMISSAO_BOLETOS, respostaErro } from "../../_comum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE = { windowMs: 10 * 60 * 1000, max: 20 }; // 20 cancelamentos / 10 min por conta

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await guardInter(req, { rateKey: "inter-boleto-cancelar", rate: RATE, permission: PERMISSAO_BOLETOS });
  if (scope instanceof NextResponse) return scope;
  if (!interKeyConfigured()) return NextResponse.json({ error: SERVER_CONFIG_ERROR }, { status: 500 });

  try {
    const { id } = await ctx.params;
    const db = await getAdminDb();
    await cancelarBoleto(db, scope.ownerUid, id, actorDe(scope));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaErro(e, "cancelar", "Falha ao cancelar o boleto no Banco Inter.");
  }
}
