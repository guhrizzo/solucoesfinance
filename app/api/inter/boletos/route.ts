// app/api/inter/boletos/route.ts
//
// POST — emite um boleto (Cobrança V3 do Banco Inter) avulso ou de uma conta a
// receber. Corpo: { receivableId?, payer: { nome, doc, email?, telefone?,
// endereco }, amount, dueDate, fineRate?, interestRate? }. Núcleo em
// lib/interBoletoServer.ts (emitirBoleto): valida, grava o doc local primeiro e
// chama o Inter UMA vez, sem retry. Dono ou membro com a permissão de Contas a
// Receber, plano Pro, rate limit por conta. Resposta e logs nunca trazem
// segredo nem corpo do Inter.

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { emitirBoleto } from "@/lib/interBoletoServer";
import { guardInter, interKeyConfigured, SERVER_CONFIG_ERROR } from "../_guard";
import { actorDe, PERMISSAO_BOLETOS, respostaErro } from "./_comum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE = { windowMs: 10 * 60 * 1000, max: 20 }; // 20 emissões / 10 min por conta

export async function POST(req: NextRequest) {
  const scope = await guardInter(req, { rateKey: "inter-boleto-emitir", rate: RATE, permission: PERMISSAO_BOLETOS });
  if (scope instanceof NextResponse) return scope;
  if (!interKeyConfigured()) return NextResponse.json({ error: SERVER_CONFIG_ERROR }, { status: 500 });

  let body: Record<string, unknown>;
  try {
    const raw = await req.json();
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("corpo");
    body = raw as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  try {
    const db = await getAdminDb();
    const r = await emitirBoleto(
      db,
      scope.ownerUid,
      {
        // Cru: o núcleo recusa (400) o que não for texto, em vez de emitir avulso em silêncio.
        receivableId: body.receivableId,
        payer: body.payer,
        amount: body.amount,
        dueDate: body.dueDate,
        fineRate: body.fineRate,
        interestRate: body.interestRate,
      },
      actorDe(scope),
    );
    return NextResponse.json({ ok: true, id: r.id, situacao: r.situacao });
  } catch (e) {
    return respostaErro(e, "emitir", "Falha ao emitir o boleto no Banco Inter.");
  }
}
