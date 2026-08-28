export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { shopeeCredentials, buildShopeeAuthUrl } from "@/lib/shopee";

// Cookie que carrega o state (CSRF) + userId entre este redirect e o /callback.
// A Shopee só devolve `code` e `shop_id`, então o rastro do usuário vem daqui.
const OAUTH_COOKIE = "shopee_oauth";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
  }

  const { redirectUri, configured } = shopeeCredentials();

  // Em localhost o OAuth real não fecha: a Shopee sempre redireciona pro
  // SHOPEE_REDIRECT_URI, então se ele aponta pra produção o callback roda em
  // OUTRO domínio e o cookie deste redirect fica preso no localhost. Nesse
  // caso cai no mock pra testar a UI. (Túnel https tipo ngrok não é localhost.)
  const hostname = new URL(request.url).hostname;
  const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)$/.test(hostname);
  const redirectUriIsLocal = !!redirectUri && /localhost|127\.0\.0\.1/.test(redirectUri);
  const forceMock = isLocalHost && !redirectUriIsLocal;

  if (!configured || forceMock) {
    console.log(
      !configured
        ? "🛍️ Shopee em modo simulado — credenciais não configuradas"
        : `🛍️ Shopee em modo simulado — rodando em ${hostname} mas SHOPEE_REDIRECT_URI aponta pra ${redirectUri}. O OAuth real precisa terminar no mesmo domínio; use um túnel https + ajuste a env, ou teste em produção.`
    );
    const callbackUrl = new URL("/api/auth/shopee/callback", request.url);
    callbackUrl.searchParams.set("code", "mock_code_shopee_123456");
    callbackUrl.searchParams.set("shop_id", "998877");
    callbackUrl.searchParams.set("state", userId);
    callbackUrl.searchParams.set("mock", "true");
    return NextResponse.redirect(callbackUrl.toString());
  }

  const state = randomBytes(16).toString("hex");
  const authUrl = buildShopeeAuthUrl({ state });

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(
    OAUTH_COOKIE,
    JSON.stringify({ s: state, u: userId }),
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
