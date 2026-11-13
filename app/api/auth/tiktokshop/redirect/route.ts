export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { RETURN_COOKIE, RETURN_COOKIE_OPTS, parseReturnTo } from "@/lib/oauthReturn";
import { randomBytes } from "crypto";
import { tiktokShopCredentials, buildTiktokAuthUrl } from "@/lib/tiktokshop";
import { requireScope, isScopeError } from "@/lib/apiScope";

// Cookie que carrega o state (CSRF) + userId entre este redirect e o /callback.
const OAUTH_COOKIE = "tiktokshop_oauth";

/**
 * POST autenticado (Bearer ID token) — mesmo padrão do redirect da Shopee. O
 * cliente faz o fetch, recebe `{ authUrl }` e navega pra lá; o uid vem SEMPRE
 * do token (nunca de um parâmetro do cliente).
 */
export async function POST(request: Request) {
  const scope = await requireScope(request, "estoque");
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }
  const userId = scope.ownerUid;
  // Página de volta (lista permitida); o callback lê do cookie.
  const returnBase = parseReturnTo(new URL(request.url).searchParams.get("returnTo"));

  const { redirectUri, configured } = tiktokShopCredentials();

  // Em localhost o OAuth real não fecha: a TikTok Shop sempre redireciona pro
  // TIKTOKSHOP_REDIRECT_URI cadastrado no console — se ele aponta pra produção
  // o callback roda em OUTRO domínio e o cookie deste redirect fica preso no
  // localhost. Nesse caso cai no mock pra testar a UI.
  const hostname = new URL(request.url).hostname;
  const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/.test(hostname);
  const redirectUriIsLocal = !!redirectUri && /localhost|127\.0\.0\.1/.test(redirectUri);
  const forceMock = isLocalHost && !redirectUriIsLocal;

  if (!configured || forceMock) {
    console.log(
      !configured
        ? "🎵 TikTok Shop em modo simulado — credenciais não configuradas"
        : `🎵 TikTok Shop em modo simulado — rodando em ${hostname} mas TIKTOKSHOP_REDIRECT_URI aponta pra ${redirectUri}. Teste em produção ou use um túnel https.`
    );
    const callbackUrl = new URL("/api/auth/tiktokshop/callback", request.url);
    callbackUrl.searchParams.set("code", "mock_code_tiktokshop_123456");
    callbackUrl.searchParams.set("state", userId);
    callbackUrl.searchParams.set("mock", "true");
    const mockRes = NextResponse.json({ authUrl: callbackUrl.toString() });
    mockRes.cookies.set(RETURN_COOKIE, returnBase, RETURN_COOKIE_OPTS);
    return mockRes;
  }

  const state = randomBytes(16).toString("hex");
  const authUrl = buildTiktokAuthUrl({ state });

  const res = NextResponse.json({ authUrl });
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ s: state, u: userId }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  res.cookies.set(RETURN_COOKIE, returnBase, RETURN_COOKIE_OPTS);
  return res;
}
