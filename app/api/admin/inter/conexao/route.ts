// app/api/admin/inter/conexao/route.ts
//
// Adm supremo conecta/atualiza/desconecta o Banco Inter de um CLIENTE.
//   POST   — conectar   (corpo: { clienteEmail, clientId, clientSecret, certPem, keyPem, conta? })
//   PUT    — atualizar  (corpo: { clienteEmail, ...campos opcionais })
//   DELETE — desconectar (corpo: { clienteEmail }) — não exige Pro do cliente.
//
// Ordem em toda chamada: guardAdmin → corpo → resolveAdminTarget (re-resolve o
// e-mail; o ownerUid SÓ sai daqui, nunca do corpo) → Pro do cliente (exceto
// DELETE) → INTER_ENC_KEY (exceto DELETE) → validação → núcleo
// (lib/interConexaoServer.ts) → auditoria → resposta. A resposta nunca traz
// uid, segredo, PEM nem campo *Enc.

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { validateConexaoBody } from "@/lib/interConexao";
import { connectInter, disconnectInter, updateInter } from "@/lib/interConexaoServer";
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

type Acao = "conectar" | "atualizar" | "desconectar";

const DB_ERROR: Record<Acao, string> = {
  conectar: "Não foi possível salvar a conexão com o Banco Inter. Tente novamente.",
  atualizar: "Não foi possível atualizar a conexão com o Banco Inter. Tente novamente.",
  desconectar: "Não foi possível desconectar o Banco Inter. Tente novamente.",
};

async function executar(
  acao: Acao,
  alvo: { ownerUid: string; pro: boolean },
  campos: Record<string, unknown>,
  adminUid: string
): Promise<AdminActionResult> {
  if (acao !== "desconectar") {
    if (!alvo.pro) return { ok: false, status: 403, error: PRO_REQUIRED_ERROR };
    if (!interKeyConfigured()) return { ok: false, status: 500, error: SERVER_CONFIG_ERROR };
  }

  let input;
  if (acao !== "desconectar") {
    const v = validateConexaoBody(campos, acao === "conectar" ? "create" : "update");
    if (!v.ok) return { ok: false, status: 400, error: v.error };
    input = v.value;
  }

  let db: Awaited<ReturnType<typeof getAdminDb>>;
  try {
    db = await getAdminDb();
  } catch (e) {
    console.error(`[admin/inter/conexao ${acao}] falha ao abrir o banco:`, errCode(e));
    return { ok: false, status: 500, error: DB_ERROR[acao] };
  }

  const opts = { configuradoPelaEquipe: true, updatedBy: adminUid };
  if (acao === "conectar") return connectInter(db, alvo.ownerUid, input!, opts);
  if (acao === "atualizar") return updateInter(db, alvo.ownerUid, input!, opts);
  return disconnectInter(db, alvo.ownerUid);
}

async function handle(req: Request, acao: Acao) {
  const g = await guardAdmin(req);
  if (g instanceof NextResponse) return g;
  const { scope } = g;

  const parts = splitAdminBody(await readJson(req));
  if (!parts) return NextResponse.json({ error: INVALID_BODY_ERROR }, { status: 400 });

  const alvo = await resolveAdminTarget(parts.clienteEmail);
  if (!alvo.ok) return NextResponse.json({ error: alvo.error }, { status: alvo.status });

  const result = await executar(acao, alvo, parts.campos, scope.uid);
  await auditarAdmin(scope, alvo, acao, result);

  const { status, body } = adminResponse(acao, result);
  return NextResponse.json(body, { status });
}

export async function POST(req: Request) {
  return handle(req, "conectar");
}

export async function PUT(req: Request) {
  return handle(req, "atualizar");
}

export async function DELETE(req: Request) {
  return handle(req, "desconectar");
}
