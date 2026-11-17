// app/api/inter/boletos/[id]/pdf/route.ts
//
// GET — PDF oficial do boleto, baixado do Banco Inter na hora (não é guardado).
// Dono ou membro com a permissão de Contas a Receber, plano Pro, rate limit por
// conta. Erros em JSON com mensagem em português.

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { pdfBoleto } from "@/lib/interBoletoServer";
import { guardInter, interKeyConfigured, SERVER_CONFIG_ERROR } from "../../../_guard";
import { PERMISSAO_BOLETOS, respostaErro } from "../../_comum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RATE = { windowMs: 10 * 60 * 1000, max: 60 }; // 60 PDFs / 10 min por conta

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const scope = await guardInter(req, { rateKey: "inter-boleto-pdf", rate: RATE, permission: PERMISSAO_BOLETOS });
  if (scope instanceof NextResponse) return scope;
  if (!interKeyConfigured()) return NextResponse.json({ error: SERVER_CONFIG_ERROR }, { status: 500 });

  try {
    const { id } = await ctx.params;
    const db = await getAdminDb();
    const pdf = await pdfBoleto(db, scope.ownerUid, id);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // id já validado no núcleo ([0-9a-z]{1,15}): seguro no cabeçalho.
        "Content-Disposition": `inline; filename="boleto-${id}.pdf"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return respostaErro(e, "pdf", "Falha ao baixar o PDF do boleto.");
  }
}
