export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { mlCredentials, generatePkce, buildAuthUrl } from "@/lib/mercadolivre";

// Cookie que carrega o PKCE + state entre este redirect e o /callback.
// httpOnly, curto (10 min) e SameSite=Lax pra sobreviver ao retorno do ML.
const OAUTH_COOKIE = "ml_oauth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
  }

  const { clientId, redirectUri, configured } = mlCredentials();

  // Sem credenciais reais → modo simulado (mock), como antes.
  if (!configured) {
    console.log("📱 Mercado Livre em modo simulado — credenciais não configuradas");
    const callbackUrl = new URL("/api/auth/mercadolivre/callback", request.url);
    callbackUrl.searchParams.set("code", "mock_code_ml_123456");
    callbackUrl.searchParams.set("state", userId);
    callbackUrl.searchParams.set("mock", "true");
    return NextResponse.redirect(callbackUrl.toString());
  }

  // Modo real: PKCE obrigatório no OAuth do ML.
  const { verifier, challenge } = generatePkce();
  const state = randomBytes(16).toString("hex");

  const authUrl = buildAuthUrl({
    clientId: clientId!,
    redirectUri: redirectUri!,
    state,
    codeChallenge: challenge,
  });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(
    OAUTH_COOKIE,
    JSON.stringify({ v: verifier, s: state, u: userId }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    }
  );
  return res;
}
