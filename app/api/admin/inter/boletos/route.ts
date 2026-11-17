// app/api/admin/inter/boletos/route.ts
//
// POST { clienteEmail } — adm supremo ativa os boletos (cobrança) do Banco
// Inter de um cliente: testa os escopos boleto-cobranca.write/read, grava as
// flags e, com escrita + URL pública HTTPS, registra o webhook (token novo a
// cada ativação; o anterior deixa de valer). Ordem: guardAdmin → núcleo puro
// rotaAtivarBoletos (adm, corpo, alvo re-resolvido pelo e-mail, Pro,
// INTER_ENC_KEY) → ativarBoletos (grava a própria auditoria).
// A resposta só traz { ok, escopos, webhook } — nunca token, hash ou segredo.

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { ativarBoletos } from "@/lib/interBoletoWebhook";
import { errCode, interKeyConfigured } from "@/lib/interErrors";
import { rotaAtivarBoletos } from "@/lib/interAdminRoutes";
import { auditarAdmin, guardAdmin, readJson, resolveAdminTarget } from "../_guard";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const g = await guardAdmin(req);
  if (g instanceof NextResponse) return g;
  const { scope } = g;

  const { status, body } = await rotaAtivarBoletos(scope, await readJson(req), {
    resolveTarget: resolveAdminTarget,
    keyConfigured: interKeyConfigured,
    auditar: (alvo, result) => auditarAdmin(scope, alvo, "ativar-boletos", result),
    ativar: async (ownerUid, adminUid, ctx) => {
      try {
        const db = await getAdminDb();
        return await ativarBoletos(db, ownerUid, adminUid, { auditoria: ctx });
      } catch (e) {
        console.error("[admin/inter/boletos] falha:", errCode(e));
        return { ok: false, status: 500, error: "Não foi possível ativar os boletos agora. Tente novamente." };
      }
    },
  });
  return NextResponse.json(body, { status });
}
