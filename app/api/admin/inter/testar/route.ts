// app/api/admin/inter/testar/route.ts
//
// POST { clienteEmail } — adm supremo testa a conexão guardada do Banco Inter
// de um cliente (certificado + token). Ordem: guardAdmin → corpo →
// resolveAdminTarget (re-resolve o e-mail; ownerUid só daqui) → Pro do cliente
// → INTER_ENC_KEY → núcleo (testInter) → auditoria → resposta { ok } | { error }.

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { testInter } from "@/lib/interConexaoServer";
import { errCode, interKeyConfigured, SERVER_CONFIG_ERROR } from "@/lib/interErrors";
import {
  adminResponse,
  INVALID_BODY_ERROR,
  PRO_REQUIRED_ERROR,
  splitAdminBody,
  type AdminActionResult,
} from "@/lib/interAdminRoutes";
import { auditarAdmin, guardAdmin, readJson, resolveAdminTarget } from "../_guard";

export const runtime = "nodejs";
export const maxDuration = 30;

async function executar(alvo: { ownerUid: string; pro: boolean }): Promise<AdminActionResult> {
  if (!alvo.pro) return { ok: false, status: 403, error: PRO_REQUIRED_ERROR };
  if (!interKeyConfigured()) return { ok: false, status: 500, error: SERVER_CONFIG_ERROR };

  let db: Awaited<ReturnType<typeof getAdminDb>>;
  try {
    db = await getAdminDb();
  } catch (e) {
    console.error("[admin/inter/testar] falha ao abrir o banco:", errCode(e));
    return { ok: false, status: 500, error: "Não foi possível ler a conexão com o Banco Inter." };
  }
  return testInter(db, alvo.ownerUid);
}

export async function POST(req: Request) {
  const g = await guardAdmin(req);
  if (g instanceof NextResponse) return g;
  const { scope } = g;

  const parts = splitAdminBody(await readJson(req));
  if (!parts) return NextResponse.json({ error: INVALID_BODY_ERROR }, { status: 400 });

  const alvo = await resolveAdminTarget(parts.clienteEmail);
  if (!alvo.ok) return NextResponse.json({ error: alvo.error }, { status: alvo.status });

  const result = await executar(alvo);
  await auditarAdmin(scope, alvo, "testar", result);

  const { status, body } = adminResponse("testar", result);
  return NextResponse.json(body, { status });
}
