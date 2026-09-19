// app/api/desktop/exchange/route.ts
// POST { code } → troca o código de uso único (gerado em /api/desktop/code) por
// um custom token do Firebase, que o app desktop usa em signInWithCustomToken.
// O código é consumido no ato. Ver lib/deviceLogin.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { redeemDeviceLoginCode } from "@/lib/deviceLogin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const { limited, retryAfterSec } = checkRateLimit(`desktop-exchange:${getClientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    max: 30,
  });
  if (limited) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um pouco." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    if (typeof body.code === "string") code = body.code;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const customToken = await redeemDeviceLoginCode(code);
  if (!customToken) {
    return NextResponse.json({ error: "Código inválido ou expirado." }, { status: 400 });
  }
  return NextResponse.json({ customToken });
}
