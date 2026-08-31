export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { mlCredentials } from "@/lib/mercadolivre";
import { getAdminDb } from "@/lib/firebaseAdmin";

// GET /api/auth/mercadolivre/status[?userId=...]
//
// Diagnóstico da integração Mercado Livre — feito pra rodar EM PRODUÇÃO e
// dizer, sem vazar valores, o que está configurado e o que falta.
//
// - envs: só `present` (bool) + `length`. CLIENT_ID e REDIRECT_URI são
//   públicos (aparecem na URL de autorização) então vêm por extenso pra
//   pegar erro de domínio/barra final.
// - firebaseAdmin: tenta de fato abrir o Firestore Admin (a causa nº1 de
//   `ml_error` no callback é FIREBASE_ADMIN_* ausente/quebrado no deploy).
// - com `?userId=` também conta integrações/vínculos já salvos.

function envInfo(name: string) {
  const v = process.env[name];
  return { present: !!v && v !== "SEU_CLIENT_ID_AQUI", length: v ? v.length : 0 };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  const host = new URL(request.url).host;

  const { clientId, redirectUri, configured } = mlCredentials();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const expectedRedirect = appUrl
    ? `${appUrl.replace(/\/$/, "")}/api/auth/mercadolivre/callback`
    : null;

  const checks: Record<string, unknown> = {
    host,
    mlCredentialsConfigured: configured,
    env: {
      MERCADOLIVRE_CLIENT_ID: envInfo("MERCADOLIVRE_CLIENT_ID"),
      MERCADOLIVRE_CLIENT_SECRET: envInfo("MERCADOLIVRE_CLIENT_SECRET"),
      MERCADOLIVRE_REDIRECT_URI: envInfo("MERCADOLIVRE_REDIRECT_URI"),
      MERCADOLIVRE_WEBHOOK_SECRET: envInfo("MERCADOLIVRE_WEBHOOK_SECRET"),
      MERCADOLIVRE_WEBHOOK_STRICT: {
        present: process.env.MERCADOLIVRE_WEBHOOK_STRICT === "true",
        value: process.env.MERCADOLIVRE_WEBHOOK_STRICT || "",
      },
      NEXT_PUBLIC_APP_URL: envInfo("NEXT_PUBLIC_APP_URL"),
      FIREBASE_ADMIN_PROJECT_ID: envInfo("FIREBASE_ADMIN_PROJECT_ID"),
      FIREBASE_ADMIN_CLIENT_EMAIL: envInfo("FIREBASE_ADMIN_CLIENT_EMAIL"),
      FIREBASE_ADMIN_PRIVATE_KEY: envInfo("FIREBASE_ADMIN_PRIVATE_KEY"),
    },
    // Público — seguro exibir por extenso.
    clientIdPublic: clientId || null,
    redirectUri: redirectUri || null,
    redirectUriMatchesAppUrl: expectedRedirect ? redirectUri === expectedRedirect : null,
    expectedRedirect,
    webhookUrl: appUrl ? `${appUrl.replace(/\/$/, "")}/api/webhooks/mercadolivre` : null,
  };

  // ── Firebase Admin: conectividade real ─────────────────────────────────────
  try {
    const db = await getAdminDb();
    await db.collection("integracoes").limit(1).get();
    checks.firebaseAdmin = { ok: true };
  } catch (err: any) {
    checks.firebaseAdmin = { ok: false, error: err?.message || String(err) };
  }

  // ── Estado das integrações ML já salvas ────────────────────────────────────
  // Sem `userId` = lista TODAS as integrações ML (só metadados, nunca o token) —
  // é como conferir "conectou de verdade ou caiu no mock" sem saber o uid.
  try {
    const db = await getAdminDb();
    let q = db.collection("integracoes").where("platform", "==", "mercadolivre");
    if (userId) q = q.where("userId", "==", userId);
    const integ = await q.get();

    const integracoes = integ.docs.map((d) => {
      const x = d.data();
      const tok: string = typeof x.accessToken === "string" ? x.accessToken : "";
      return {
        userId: x.userId ?? null,
        accountId: x.accountId ?? null,
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
        .where("platform", "==", "mercadolivre")
        .get();
      vinculosCount = vinc.size;
    }

    checks.integracoesML = {
      total: integracoes.length,
      conectadaReal: integracoes.some((i) => !i.mock),
      integracoes,
      ...(vinculosCount !== undefined ? { vinculosCount } : {}),
    };
  } catch (err: any) {
    checks.integracoesML = { error: err?.message || String(err) };
  }

  // ── Veredito ──────────────────────────────────────────────────────────────
  const problemas: string[] = [];
  if (!configured) problemas.push("MERCADOLIVRE_CLIENT_ID/SECRET/REDIRECT_URI incompletos nesta implantação.");
  if ((checks.firebaseAdmin as any)?.ok === false)
    problemas.push("Firebase Admin não inicializa — confira as 3 envs FIREBASE_ADMIN_* (a PRIVATE_KEY precisa vir inteira).");
  if (redirectUri && expectedRedirect && redirectUri !== expectedRedirect)
    problemas.push(`MERCADOLIVRE_REDIRECT_URI (${redirectUri}) != ${expectedRedirect} — devem bater e estar cadastrados iguais no DevCenter.`);
  if (!process.env.MERCADOLIVRE_WEBHOOK_SECRET)
    problemas.push("MERCADOLIVRE_WEBHOOK_SECRET vazio — o webhook aceita, mas sem validar assinatura (não ligue STRICT ainda).");

  return NextResponse.json({
    ok: problemas.length === 0,
    problemas,
    checks,
  });
}
