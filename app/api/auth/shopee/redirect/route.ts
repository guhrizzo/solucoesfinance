import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
  }

  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const redirectUri = process.env.SHOPEE_REDIRECT_URI;

  const isMock = !partnerId || partnerId === "SEU_PARTNER_ID_AQUI";

  if (isMock) {
    const callbackUrl = new URL("/api/auth/shopee/callback", request.url);
    callbackUrl.searchParams.set("code", "mock_code_shopee_123456");
    callbackUrl.searchParams.set("shop_id", "998877");
    callbackUrl.searchParams.set("state", userId);
    callbackUrl.searchParams.set("mock", "true");
    return NextResponse.redirect(callbackUrl.toString());
  }

  // Modo Real Shopee: Montar assinatura e redirecionar
  const path = "/api/v2/shop/auth_partner";
  const timestamp = Math.floor(Date.now() / 1000);
  
  // Assinatura Shopee: partner_id + path + timestamp
  const signString = `${partnerId}${path}${timestamp}`;
  const sign = crypto
    .createHmac("sha256", partnerKey || "")
    .update(signString)
    .digest("hex");

  // A API da Shopee em Sandbox costuma usar: https://partner.test-stable.shopeesz.com/api/v2/shop/auth_partner
  // Em produção: https://partner.shopeesz.com/api/v2/shop/auth_partner
  const host = "https://partner.shopeesz.com";
  const shopeeAuthUrl = `${host}${path}?partner_id=${partnerId}&timestamp=${timestamp}&sign=${sign}&redirect=${encodeURIComponent(
    redirectUri || ""
  )}&state=${userId}`;

  return NextResponse.redirect(shopeeAuthUrl);
}
