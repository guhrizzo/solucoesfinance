import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
  }

  const clientId = process.env.MERCADOLIVRE_CLIENT_ID;
  const redirectUri = process.env.MERCADOLIVRE_REDIRECT_URI;

  // Se não estiver configurado ou for o padrão de exemplo, entra no modo simulado (mock)
  const isMock = !clientId || clientId === "SEU_CLIENT_ID_AQUI";

  console.log("🔍 Mercado Livre Redirect Debug:", {
    userId,
    clientId: clientId ? "✓ Configured" : "✗ Missing",
    redirectUri,
    isMock,
    env: process.env.NODE_ENV,
  });

  if (isMock) {
    console.log("📱 Usando modo simulado (mock) - credenciais não configuradas");
    // Redireciona para o callback simulando o retorno do Mercado Livre
    const callbackUrl = new URL("/api/auth/mercadolivre/callback", request.url);
    callbackUrl.searchParams.set("code", "mock_code_ml_123456");
    callbackUrl.searchParams.set("state", userId);
    callbackUrl.searchParams.set("mock", "true");
    return NextResponse.redirect(callbackUrl.toString());
  }

  // Modo real: redireciona para o OAuth2 do Mercado Livre
  const mlAuthUrl = `https://auth.mercadolibre.com/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri || ""
  )}&state=${userId}`;

  console.log("🔗 Mercado Livre Auth URL:", mlAuthUrl);

  return NextResponse.redirect(mlAuthUrl);
}
