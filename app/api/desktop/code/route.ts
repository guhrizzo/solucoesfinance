// app/api/desktop/code/route.ts
// POST → o navegador do sistema (já logado, ex.: com Google) troca o ID token
// por um código de uso único que o app desktop resgata em /api/desktop/exchange.
// Ver lib/deviceLogin.ts.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { createDeviceLoginCode } from "@/lib/deviceLogin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const { limited, retryAfterSec } = checkRateLimit(`desktop-code:${getClientIp(request)}`, {
    windowMs: 10 * 60 * 1000,
    max: 20,
  });
  if (limited) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde um pouco." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  const m = /^Bearer (.+)$/.exec((request.headers.get("authorization") ?? "").trim());
  if (!m) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let uid: string;
  try {
    uid = (await (await getAdminAuth()).verifyIdToken(m[1])).uid;
  } catch {
    return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
  }

  const code = await createDeviceLoginCode(uid);
  return NextResponse.json({ code });
}
