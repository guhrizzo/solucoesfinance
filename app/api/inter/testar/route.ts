// app/api/inter/testar/route.ts
//
// POST — testa a conexão com o Banco Inter usando as credenciais guardadas:
// valida o certificado e pede um token (lib/inter.ts interTestConnection).
// Só o DONO da conta, plano Pro, rate limit por conta. O resultado vai para
// users/{ownerUid}/profile/interStatus.lastSyncError (null = ok). A resposta e
// os logs nunca contêm segredo nem corpo devolvido pelo Inter.

import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { interTestConnection } from "@/lib/inter";
import { decryptInterSecrets, type EncryptedInterSecrets, type InterSecrets } from "@/lib/interCrypto";
import { errCode, guardInter, interKeyConfigured, SERVER_CONFIG_ERROR } from "../_guard";

export const runtime = "nodejs";
export const maxDuration = 30;

const RATE = { windowMs: 10 * 60 * 1000, max: 5 }; // 5 testes / 10 min por conta

const FALLBACK_ERROR = "Falha ao testar a conexão com o Banco Inter.";

/**
 * As mensagens de lib/inter.ts já são nossas e legíveis; mesmo assim, por
 * garantia, nada que pareça PEM ou seja longo demais vai para o status/resposta.
 */
function safeMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (!m || m.length > 300 || m.includes("-----BEGIN")) return FALLBACK_ERROR;
  return m;
}

export async function POST(req: NextRequest) {
  const scope = await guardInter(req, { rateKey: "inter-testar", rate: RATE });
  if (scope instanceof NextResponse) return scope;
  if (!interKeyConfigured()) return NextResponse.json({ error: SERVER_CONFIG_ERROR }, { status: 500 });

  let db: Awaited<ReturnType<typeof getAdminDb>>;
  let secrets: InterSecrets;
  try {
    db = await getAdminDb();
    const snap = await db.doc(`integracoesBanco/${scope.ownerUid}`).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "O Banco Inter não está conectado." }, { status: 404 });
    }
    const data = snap.data() ?? {};
    try {
      secrets = decryptInterSecrets(data as EncryptedInterSecrets);
    } catch {
      return NextResponse.json({ error: SERVER_CONFIG_ERROR }, { status: 500 });
    }
    if (typeof data.conta === "string" && data.conta) secrets.conta = data.conta;
  } catch (e) {
    console.error("[inter/testar] falha ao ler conexão:", errCode(e));
    return NextResponse.json({ error: "Não foi possível ler a conexão com o Banco Inter." }, { status: 500 });
  }

  const statusRef = db.doc(`users/${scope.ownerUid}/profile/interStatus`);
  try {
    await interTestConnection(secrets);
  } catch (e) {
    const error = safeMessage(e);
    await statusRef.set({ lastSyncError: error }, { merge: true }).catch((err) => {
      console.error("[inter/testar] falha ao gravar status:", errCode(err));
    });
    return NextResponse.json({ error }, { status: 502 });
  }

  try {
    await statusRef.set({ lastSyncError: null }, { merge: true });
  } catch (e) {
    console.error("[inter/testar] falha ao gravar status:", errCode(e));
  }
  return NextResponse.json({ ok: true });
}
