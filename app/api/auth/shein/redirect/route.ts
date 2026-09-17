export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { sheinCredentials, buildSheinAuthUrl } from "@/lib/shein";
import { requireScope, isScopeError } from "@/lib/apiScope";

// Cookie que carrega o state (CSRF) + userId entre este redirect e o /callback.
const OAUTH_COOKIE = "shein_oauth";

/**
 * POST autenticado (Bearer ID token) — mesmo padrão do redirect da Shopee/
 * TikTok Shop. O cliente faz o fetch, recebe `{ authUrl }` e navega pra lá; o
 * uid vem SEMPRE do token (nunca de um parâmetro do cliente).
 */
export async function POST(request: Request) {
  const scope = await requireScope(request, "estoque");
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }
  const userId = scope.ownerUid;

  const { redirectUri, configured } = sheinCredentials();

  // Em localhost o fluxo real não fecha: a Shein sempre redireciona pro
  // SHEIN_REDIRECT_URI cadastrado no painel — se ele aponta pra produção o
  // callback roda em OUTRO domínio e o cookie deste redirect fica preso no
  // localhost. Nesse caso cai no mock pra testar a UI (mesmo padrão do
  // TikTok Shop).
  const hostname = new URL(request.url).hostname;
  const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/.test(hostname);
  const redirectUriIsLocal = !!redirectUri && /localhost|127\.0\.0\.1/.test(redirectUri);
  const forceMock = isLocalHost && !redirectUriIsLocal;

  if (!configured || forceMock) {
    console.log(
      !configured
        ? "🛍️ Shein em modo simulado — credenciais não configuradas"
        : `🛍️ Shein em modo simulado — rodando em ${hostname} mas SHEIN_REDIRECT_URI aponta pra ${redirectUri}. Teste em produção ou use um túnel https.`
    );
    const callbackUrl = new URL("/api/auth/shein/callback", request.url);
    callbackUrl.searchParams.set("tempToken", "mock_temp_token_shein_123456");
    callbackUrl.searchParams.set("state", userId);
    callbackUrl.searchParams.set("mock", "true");
    return NextResponse.json({ authUrl: callbackUrl.toString() });
  }

  const state = randomBytes(16).toString("hex");
  const authUrl = buildSheinAuthUrl({ state });

  const res = NextResponse.json({ authUrl });
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ s: state, u: userId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // o tempToken da Shein só vale 10 min — não precisa mais que isso
  });
  return res;
}
