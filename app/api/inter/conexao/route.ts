// app/api/inter/conexao/route.ts
//
// Conexão com o Banco Inter (ver docs/superpowers/specs/2026-11-03-inter-extrato-conciliar-design.md):
//   POST   — conectar: recebe clientId, clientSecret, certPem, keyPem e conta (opcional).
//   PUT    — atualizar credenciais: campos opcionais; certificado e chave vêm juntos.
//   DELETE — desconectar: apaga os segredos (interPendentes ficam intactos).
//
// Só o DONO da conta, plano Pro (exceto DELETE). A lógica (validação final,
// certificado/chave, cifragem com INTER_ENC_KEY, gravação em
// integracoesBanco/{ownerUid} e users/{ownerUid}/profile/interStatus) mora em
// lib/interConexaoServer.ts; aqui fica só guarda → corpo → núcleo → resposta.
// As respostas NUNCA ecoam segredo, PEM nem campo *Enc, e nada do corpo é logado.

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { validateConexaoBody } from "@/lib/interConexao";
import { connectInter, disconnectInter, updateInter, type InterAccountResult } from "@/lib/interConexaoServer";
import { errCode, guardInter, interKeyConfigured, SERVER_CONFIG_ERROR } from "../_guard";

export const runtime = "nodejs";

const RATE = { windowMs: 10 * 60 * 1000, max: 10 }; // 10 alterações / 10 min por conta

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/** Resultado do núcleo → resposta HTTP (mesmo formato de antes da extração). */
function toResponse(r: InterAccountResult) {
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ ok: true, certExpiresAt: r.certExpiresAt, contaMasked: r.contaMasked ?? null });
}

async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

// ---------- POST: conectar ----------

export async function POST(req: NextRequest) {
  const scope = await guardInter(req, { rateKey: "inter-conexao", rate: RATE });
  if (scope instanceof NextResponse) return scope;
  if (!interKeyConfigured()) return bad(SERVER_CONFIG_ERROR, 500);

  const v = validateConexaoBody(await readJson(req), "create");
  if (!v.ok) return bad(v.error);

  let db: Awaited<ReturnType<typeof getAdminDb>>;
  try {
    db = await getAdminDb();
  } catch (e) {
    console.error("[inter/conexao POST] falha ao gravar:", errCode(e));
    return bad("Não foi possível salvar a conexão com o Banco Inter. Tente novamente.", 500);
  }
  return toResponse(await connectInter(db, scope.ownerUid, v.value, { updatedBy: scope.uid }));
}

// ---------- PUT: atualizar credenciais ----------

export async function PUT(req: NextRequest) {
  const scope = await guardInter(req, { rateKey: "inter-conexao", rate: RATE });
  if (scope instanceof NextResponse) return scope;
  if (!interKeyConfigured()) return bad(SERVER_CONFIG_ERROR, 500);

  const v = validateConexaoBody(await readJson(req), "update");
  if (!v.ok) return bad(v.error);

  let db: Awaited<ReturnType<typeof getAdminDb>>;
  try {
    db = await getAdminDb();
  } catch (e) {
    console.error("[inter/conexao PUT] falha ao atualizar:", errCode(e));
    return bad("Não foi possível atualizar a conexão com o Banco Inter. Tente novamente.", 500);
  }
  return toResponse(await updateInter(db, scope.ownerUid, v.value, { updatedBy: scope.uid }));
}

// ---------- DELETE: desconectar ----------

export async function DELETE(req: NextRequest) {
  // Sem exigir Pro: quem saiu do plano ainda precisa conseguir apagar os segredos.
  const scope = await guardInter(req, { rateKey: "inter-conexao", rate: RATE, requirePro: false });
  if (scope instanceof NextResponse) return scope;

  let db: Awaited<ReturnType<typeof getAdminDb>>;
  try {
    db = await getAdminDb();
  } catch (e) {
    console.error("[inter/conexao DELETE] falha ao desconectar:", errCode(e));
    return bad("Não foi possível desconectar o Banco Inter. Tente novamente.", 500);
  }
  const r = await disconnectInter(db, scope.ownerUid);
  if (!r.ok) return bad(r.error, r.status);
  return NextResponse.json({ ok: true });
}
