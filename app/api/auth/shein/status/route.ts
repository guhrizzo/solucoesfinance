export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { sheinCredentials } from "@/lib/shein";
import { getAdminDb } from "@/lib/firebaseAdmin";

// GET /api/auth/shein/status[?userId=...]
//
// Diagnóstico da integração Shein — espelha /api/auth/tiktokshop/status e
// /api/auth/shopee/status. Feito pra rodar EM PRODUÇÃO e dizer, sem vazar
// valores, o que está configurado e o que falta antes/depois de conectar a
// loja real.

function envInfo(name: string, placeholder?: string) {
  const v = process.env[name];
  return { present: !!v && (!placeholder || v !== placeholder), length: v ? v.length : 0 };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const host = new URL(request.url).host;

  const { redirectUri, configured, testMode } = sheinCredentials();

  const expectedRedirect = "https://nexusfi.com.br/api/auth/shein/callback";
  const expectedPushUrl = "https://nexusfi.com.br/api/webhooks/shein";

  const checks: Record<string, unknown> = {
    host,
    sheinCredentialsConfigured: configured,
    apiHost: testMode ? "https://openapi-test01.sheincorp.cn" : "https://openapi.sheincorp.com",
    empowerHost: testMode ? "https://openapi-sem-test01.dotfashion.cn" : "https://openapi-sem.sheincorp.com",
    env: {
      SHEIN_APP_ID: envInfo("SHEIN_APP_ID", "SEU_APP_ID_AQUI"),
      SHEIN_APP_SECRET: envInfo("SHEIN_APP_SECRET", "SEU_APP_SECRET_AQUI"),
      SHEIN_REDIRECT_URI: envInfo("SHEIN_REDIRECT_URI"),
      SHEIN_ENV: { present: !!process.env.SHEIN_ENV, value: process.env.SHEIN_ENV || "produção (padrão)" },
      SHEIN_PUSH_URL: envInfo("SHEIN_PUSH_URL"),
      SHEIN_WEBHOOK_STRICT: {
        present: process.env.SHEIN_WEBHOOK_STRICT === "true",
        value: process.env.SHEIN_WEBHOOK_STRICT || "",
      },
      FIREBASE_ADMIN_PROJECT_ID: envInfo("FIREBASE_ADMIN_PROJECT_ID"),
      FIREBASE_ADMIN_CLIENT_EMAIL: envInfo("FIREBASE_ADMIN_CLIENT_EMAIL"),
      FIREBASE_ADMIN_PRIVATE_KEY: envInfo("FIREBASE_ADMIN_PRIVATE_KEY"),
    },
    // Público — seguro exibir por extenso.
    redirectUri: redirectUri || null,
    redirectUriOk: redirectUri === expectedRedirect,
    expectedRedirect,
    pushUrl: process.env.SHEIN_PUSH_URL || null,
    pushUrlOk: (process.env.SHEIN_PUSH_URL || "") === expectedPushUrl,
    expectedPushUrl,
  };

  // ── Firebase Admin: conectividade real ─────────────────────────────────────
  try {
    const db = await getAdminDb();
    await db.collection("integracoes").limit(1).get();
    checks.firebaseAdmin = { ok: true };
  } catch (err: any) {
    checks.firebaseAdmin = { ok: false, error: err?.message || String(err) };
  }

  // ── Estado das integrações Shein já salvas ─────────────────────────────────
  try {
    const db = await getAdminDb();
    let q = db.collection("integracoes").where("platform", "==", "shein");
    if (userId) q = q.where("userId", "==", userId);
    const integ = await q.get();

    const integracoes = integ.docs.map((d) => {
      const x = d.data();
      const tok: string = typeof x.accessToken === "string" ? x.accessToken : "";
      return {
        userId: x.userId ?? null,
        accountId: x.accountId ?? null, // supplierId
        accountName: x.accountName ?? null,
        mock: !tok || tok.startsWith("mock_"),
        tokenPrefix: tok ? tok.slice(0, 6) + "…" : null,
        atualizadoEm: x.updatedAt ? new Date(x.updatedAt).toISOString() : null,
      };
    });

    let vinculosCount: number | undefined;
    if (userId) {
      const vinc = await db
        .collection("vinculos")
        .where("userId", "==", userId)
        .where("platform", "==", "shein")
        .get();
      vinculosCount = vinc.size;
    }

    checks.integracoesShein = {
      total: integracoes.length,
      conectadaReal: integracoes.some((i) => !i.mock),
      integracoes,
      ...(vinculosCount !== undefined ? { vinculosCount } : {}),
    };
  } catch (err: any) {
    checks.integracoesShein = { error: err?.message || String(err) };
  }

  // ── Veredito ──────────────────────────────────────────────────────────────
  const problemas: string[] = [];
  if (!configured)
    problemas.push("SHEIN_APP_ID/APP_SECRET/REDIRECT_URI incompletos (ou ainda placeholders) nesta implantação — cai em modo simulado.");
  if ((checks.firebaseAdmin as any)?.ok === false)
    problemas.push("Firebase Admin não inicializa — confira as 3 envs FIREBASE_ADMIN_* (a PRIVATE_KEY precisa vir inteira).");
  if (redirectUri && redirectUri !== expectedRedirect)
    problemas.push(`SHEIN_REDIRECT_URI (${redirectUri}) != ${expectedRedirect} — deve bater exatamente com a Redirect URL cadastrada no painel de desenvolvedor.`);
  if ((process.env.SHEIN_PUSH_URL || "") !== expectedPushUrl)
    problemas.push(`SHEIN_PUSH_URL != ${expectedPushUrl} — deve ser idêntica à URL de webhook cadastrada no painel.`);
  if (process.env.SHEIN_WEBHOOK_STRICT === "true")
    problemas.push("SHEIN_WEBHOOK_STRICT ligado — só deixe assim depois de ver 'assinatura valid' nos logs.");

  return NextResponse.json({
    ok: problemas.length === 0,
    problemas,
    checks,
  });
}
