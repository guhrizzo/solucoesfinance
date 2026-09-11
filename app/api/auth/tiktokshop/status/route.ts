export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { tiktokShopCredentials } from "@/lib/tiktokshop";
import { getAdminDb } from "@/lib/firebaseAdmin";

// GET /api/auth/tiktokshop/status[?userId=...]
//
// Diagnóstico da integração TikTok Shop — espelha /api/auth/shopee/status e
// /api/auth/mercadolivre/status. Feito pra rodar EM PRODUÇÃO e dizer, sem
// vazar valores, o que está configurado e o que falta antes/depois de
// conectar a loja real.

function envInfo(name: string, placeholder?: string) {
  const v = process.env[name];
  return { present: !!v && (!placeholder || v !== placeholder), length: v ? v.length : 0 };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const host = new URL(request.url).host;

  const { redirectUri, configured } = tiktokShopCredentials();

  const expectedRedirect = "https://nexusfi.com.br/api/auth/tiktokshop/callback";
  const expectedPushUrl = "https://nexusfi.com.br/api/webhooks/tiktokshop";

  const checks: Record<string, unknown> = {
    host,
    tiktokShopCredentialsConfigured: configured,
    apiHost: "https://open-api.tiktokglobalshop.com",
    authHost: "https://auth.tiktok-shops.com",
    env: {
      TIKTOKSHOP_APP_KEY: envInfo("TIKTOKSHOP_APP_KEY", "SEU_APP_KEY_AQUI"),
      TIKTOKSHOP_APP_SECRET: envInfo("TIKTOKSHOP_APP_SECRET", "SEU_APP_SECRET_AQUI"),
      TIKTOKSHOP_REDIRECT_URI: envInfo("TIKTOKSHOP_REDIRECT_URI"),
      TIKTOKSHOP_WEBHOOK_SECRET: envInfo("TIKTOKSHOP_WEBHOOK_SECRET"),
      TIKTOKSHOP_PUSH_URL: envInfo("TIKTOKSHOP_PUSH_URL"),
      TIKTOKSHOP_WEBHOOK_STRICT: {
        present: process.env.TIKTOKSHOP_WEBHOOK_STRICT === "true",
        value: process.env.TIKTOKSHOP_WEBHOOK_STRICT || "",
      },
      FIREBASE_ADMIN_PROJECT_ID: envInfo("FIREBASE_ADMIN_PROJECT_ID"),
      FIREBASE_ADMIN_CLIENT_EMAIL: envInfo("FIREBASE_ADMIN_CLIENT_EMAIL"),
      FIREBASE_ADMIN_PRIVATE_KEY: envInfo("FIREBASE_ADMIN_PRIVATE_KEY"),
    },
    // Público — seguro exibir por extenso.
    redirectUri: redirectUri || null,
    redirectUriOk: redirectUri === expectedRedirect,
    expectedRedirect,
    pushUrl: process.env.TIKTOKSHOP_PUSH_URL || null,
    pushUrlOk: (process.env.TIKTOKSHOP_PUSH_URL || "") === expectedPushUrl,
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

  // ── Estado das integrações TikTok Shop já salvas ───────────────────────────
  try {
    const db = await getAdminDb();
    let q = db.collection("integracoes").where("platform", "==", "tiktokshop");
    if (userId) q = q.where("userId", "==", userId);
    const integ = await q.get();

    const integracoes = integ.docs.map((d) => {
      const x = d.data();
      const tok: string = typeof x.accessToken === "string" ? x.accessToken : "";
      return {
        userId: x.userId ?? null,
        accountId: x.accountId ?? null, // shop_id
        accountName: x.accountName ?? null,
        mock: !tok || tok.startsWith("mock_"),
        tokenPrefix: tok ? tok.slice(0, 6) + "…" : null,
        temRefreshToken: !!x.refreshToken && !String(x.refreshToken).startsWith("mock_"),
        tokenExpiraEm: x.expiresAt ? new Date(x.expiresAt).toISOString() : null,
        tokenExpirado: x.expiresAt ? x.expiresAt < Date.now() : null,
        atualizadoEm: x.updatedAt ? new Date(x.updatedAt).toISOString() : null,
      };
    });

    let vinculosCount: number | undefined;
    if (userId) {
      const vinc = await db
        .collection("vinculos")
        .where("userId", "==", userId)
        .where("platform", "==", "tiktokshop")
        .get();
      vinculosCount = vinc.size;
    }

    checks.integracoesTiktokShop = {
      total: integracoes.length,
      conectadaReal: integracoes.some((i) => !i.mock),
      integracoes,
      ...(vinculosCount !== undefined ? { vinculosCount } : {}),
    };
  } catch (err: any) {
    checks.integracoesTiktokShop = { error: err?.message || String(err) };
  }

  // ── Veredito ──────────────────────────────────────────────────────────────
  const problemas: string[] = [];
  if (!configured)
    problemas.push("TIKTOKSHOP_APP_KEY/APP_SECRET/REDIRECT_URI incompletos (ou ainda placeholders) nesta implantação — cai em modo simulado.");
  if ((checks.firebaseAdmin as any)?.ok === false)
    problemas.push("Firebase Admin não inicializa — confira as 3 envs FIREBASE_ADMIN_* (a PRIVATE_KEY precisa vir inteira).");
  if (redirectUri && redirectUri !== expectedRedirect)
    problemas.push(`TIKTOKSHOP_REDIRECT_URI (${redirectUri}) != ${expectedRedirect} — deve bater exatamente com a Redirect URL do Partner Center.`);
  if ((process.env.TIKTOKSHOP_PUSH_URL || "") !== expectedPushUrl)
    problemas.push(`TIKTOKSHOP_PUSH_URL != ${expectedPushUrl} — deve ser idêntica à URL de webhook cadastrada no Partner Center.`);
  if (process.env.TIKTOKSHOP_WEBHOOK_STRICT === "true")
    problemas.push("TIKTOKSHOP_WEBHOOK_STRICT ligado — só deixe assim depois de ver 'assinatura valid' nos logs.");

  return NextResponse.json({
    ok: problemas.length === 0,
    problemas,
    checks,
  });
}
