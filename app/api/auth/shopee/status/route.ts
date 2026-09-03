export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { shopeeCredentials, shopeeHost } from "@/lib/shopee";
import { getAdminDb } from "@/lib/firebaseAdmin";

// GET /api/auth/shopee/status[?userId=...]
//
// Diagnóstico da integração Shopee — espelha /api/auth/mercadolivre/status.
// Feito pra rodar EM PRODUÇÃO e dizer, sem vazar valores, o que está
// configurado e o que falta antes/depois de conectar a loja real.
//
// - envs: só `present` (bool) + `length`. REDIRECT_URI / PUSH_URL / SANDBOX
//   são públicos (aparecem na URL de auth ou no console) → vêm por extenso
//   pra pegar erro de domínio/barra final.
// - firebaseAdmin: tenta de fato abrir o Firestore Admin (causa nº1 de erro
//   no callback é FIREBASE_ADMIN_* ausente/quebrado no deploy).
// - com `?userId=` também conta integrações/vínculos Shopee já salvos.

function envInfo(name: string, placeholder?: string) {
  const v = process.env[name];
  return { present: !!v && (!placeholder || v !== placeholder), length: v ? v.length : 0 };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const host = new URL(request.url).host;

  const { redirectUri, configured } = shopeeCredentials();
  const sandbox = process.env.SHOPEE_SANDBOX === "true";

  const expectedRedirect = "https://nexusfi.com.br/api/auth/shopee/callback";
  const expectedPushUrl = "https://nexusfi.com.br/api/webhooks/shopee";

  const checks: Record<string, unknown> = {
    host,
    shopeeCredentialsConfigured: configured,
    ambiente: sandbox ? "sandbox (partner.test-stable.shopeemobile.com)" : "producao (partner.shopeemobile.com)",
    apiHost: shopeeHost(),
    env: {
      SHOPEE_PARTNER_ID: envInfo("SHOPEE_PARTNER_ID", "SEU_PARTNER_ID_AQUI"),
      SHOPEE_PARTNER_KEY: envInfo("SHOPEE_PARTNER_KEY", "SEU_PARTNER_KEY_AQUI"),
      SHOPEE_REDIRECT_URI: envInfo("SHOPEE_REDIRECT_URI"),
      SHOPEE_PUSH_URL: envInfo("SHOPEE_PUSH_URL"),
      SHOPEE_SANDBOX: { present: !!process.env.SHOPEE_SANDBOX, value: process.env.SHOPEE_SANDBOX || "" },
      SHOPEE_PUSH_STRICT: {
        present: process.env.SHOPEE_PUSH_STRICT === "true",
        value: process.env.SHOPEE_PUSH_STRICT || "",
      },
      FIREBASE_ADMIN_PROJECT_ID: envInfo("FIREBASE_ADMIN_PROJECT_ID"),
      FIREBASE_ADMIN_CLIENT_EMAIL: envInfo("FIREBASE_ADMIN_CLIENT_EMAIL"),
      FIREBASE_ADMIN_PRIVATE_KEY: envInfo("FIREBASE_ADMIN_PRIVATE_KEY"),
    },
    // Público — seguro exibir por extenso.
    redirectUri: redirectUri || null,
    redirectUriOk: redirectUri === expectedRedirect,
    expectedRedirect,
    pushUrl: process.env.SHOPEE_PUSH_URL || null,
    pushUrlOk: (process.env.SHOPEE_PUSH_URL || "") === expectedPushUrl,
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

  // ── Estado das integrações Shopee já salvas ────────────────────────────────
  try {
    const db = await getAdminDb();
    let q = db.collection("integracoes").where("platform", "==", "shopee");
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
        .where("platform", "==", "shopee")
        .get();
      vinculosCount = vinc.size;
    }

    checks.integracoesShopee = {
      total: integracoes.length,
      conectadaReal: integracoes.some((i) => !i.mock),
      integracoes,
      ...(vinculosCount !== undefined ? { vinculosCount } : {}),
    };
  } catch (err: any) {
    checks.integracoesShopee = { error: err?.message || String(err) };
  }

  // ── Veredito ──────────────────────────────────────────────────────────────
  const problemas: string[] = [];
  if (!configured)
    problemas.push("SHOPEE_PARTNER_ID/KEY/REDIRECT_URI incompletos (ou ainda placeholders) nesta implantação — cai em modo simulado.");
  if ((checks.firebaseAdmin as any)?.ok === false)
    problemas.push("Firebase Admin não inicializa — confira as 3 envs FIREBASE_ADMIN_* (a PRIVATE_KEY precisa vir inteira).");
  if (redirectUri && redirectUri !== expectedRedirect)
    problemas.push(`SHOPEE_REDIRECT_URI (${redirectUri}) != ${expectedRedirect} — deve bater exatamente com a Redirect URL do console Shopee.`);
  if ((process.env.SHOPEE_PUSH_URL || "") !== expectedPushUrl)
    problemas.push(`SHOPEE_PUSH_URL != ${expectedPushUrl} — deve ser idêntica à Push URL do console, senão a assinatura do push nunca valida.`);
  if (process.env.SHOPEE_PUSH_STRICT === "true")
    problemas.push("SHOPEE_PUSH_STRICT ligado — só deixe assim depois de ver 'assinatura valid' nos logs.");

  return NextResponse.json({
    ok: problemas.length === 0,
    problemas,
    checks,
  });
}
