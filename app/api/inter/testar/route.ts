// app/api/inter/testar/route.ts
//
// POST — testa a conexão com o Banco Inter usando as credenciais guardadas:
// valida o certificado e pede um token (lib/inter.ts interTestConnection).
// Só o DONO da conta, plano Pro, rate limit por conta. O resultado vai para
// users/{ownerUid}/profile/interStatus.lastSyncError (null = ok). A lógica mora
// em lib/interConexaoServer.ts (testInter). A resposta e os logs nunca contêm
// segredo nem corpo devolvido pelo Inter.

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { testInter } from "@/lib/interConexaoServer";
import { errCode, guardInter, interKeyConfigured, SERVER_CONFIG_ERROR } from "../_guard";

export const runtime = "nodejs";
export const maxDuration = 30;

const RATE = { windowMs: 10 * 60 * 1000, max: 5 }; // 5 testes / 10 min por conta

export async function POST(req: NextRequest) {
  const scope = await guardInter(req, { rateKey: "inter-testar", rate: RATE });
  if (scope instanceof NextResponse) return scope;
  if (!interKeyConfigured()) return NextResponse.json({ error: SERVER_CONFIG_ERROR }, { status: 500 });

  let db: Awaited<ReturnType<typeof getAdminDb>>;
  try {
    db = await getAdminDb();
  } catch (e) {
    console.error("[inter/testar] falha ao ler conexão:", errCode(e));
    return NextResponse.json({ error: "Não foi possível ler a conexão com o Banco Inter." }, { status: 500 });
  }

  const r = await testInter(db, scope.ownerUid);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
