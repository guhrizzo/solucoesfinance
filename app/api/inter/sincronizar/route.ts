// app/api/inter/sincronizar/route.ts
//
// POST — "Sincronizar agora": puxa o extrato do Banco Inter e grava os itens
// inéditos em users/{ownerUid}/interPendentes (lib/interSync.ts syncOwner).
// Dono ou membro com a permissão do Fluxo de Caixa ("fluxoCaixa"), plano Pro,
// rate limit por conta. Resposta e logs nunca contêm segredo nem extrato.

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { InterSyncError, syncOwner } from "@/lib/interSync";
import { errCode, guardInter, interKeyConfigured, SERVER_CONFIG_ERROR } from "../_guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE = { windowMs: 10 * 60 * 1000, max: 6 }; // 6 sincronizações / 10 min por conta

const STATUS: Record<InterSyncError["kind"], number> = {
  "nao-conectado": 404,
  config: 500,
  falha: 502,
};

export async function POST(req: NextRequest) {
  const scope = await guardInter(req, { rateKey: "inter-sincronizar", rate: RATE, permission: "fluxoCaixa" });
  if (scope instanceof NextResponse) return scope;
  if (!interKeyConfigured()) return NextResponse.json({ error: SERVER_CONFIG_ERROR }, { status: 500 });

  try {
    const db = await getAdminDb();
    const { novos } = await syncOwner(db, scope.ownerUid);
    return NextResponse.json({ ok: true, novos });
  } catch (e) {
    if (e instanceof InterSyncError) {
      return NextResponse.json({ error: e.message }, { status: STATUS[e.kind] });
    }
    console.error("[inter/sincronizar] falha:", errCode(e));
    return NextResponse.json({ error: "Falha ao sincronizar o extrato do Banco Inter." }, { status: 500 });
  }
}
