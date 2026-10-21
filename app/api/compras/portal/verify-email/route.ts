// app/api/compras/portal/verify-email/route.ts
// POST — (re)envia o link de confirmação de e-mail do login do fornecedor,
// pelo domínio próprio (Resend), com rate limit por login.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { checkRateLimit } from "@/lib/rateLimit";
import { verifyPortalToken } from "@/lib/compras/auth";
import { appUrl, sendEmail } from "@/lib/compras/notify";
import { verifyEmailEmail } from "@/lib/compras/emails";

export async function POST(req: Request) {
  const who = await verifyPortalToken(req);
  if (who instanceof NextResponse) return who;
  if (who.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });

  const rl = checkRateLimit(`compras:verify:${who.uid}`, { windowMs: 15 * 60 * 1000, max: 3 });
  if (rl.limited) return NextResponse.json({ error: "Aguarde alguns minutos antes de pedir outro e-mail.", code: "rateLimited" }, { status: 429 });

  try {
    const link = await (await getAdminAuth()).generateEmailVerificationLink(who.email, { url: `${appUrl()}/fornecedor` });
    const mail = verifyEmailEmail({ url: link, logoUrl: `${appUrl()}/nexus_fi_logo_branco.png` });
    const r = await sendEmail({ to: who.email, ...mail });
    if (!r.ok) {
      console.error("[compras] e-mail de verificação:", r.error);
      return NextResponse.json({ error: "Não foi possível enviar o e-mail agora.", code: "emailFailed" }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[compras] verify-email:", err);
    return NextResponse.json({ error: "Não foi possível enviar o e-mail agora.", code: "internal" }, { status: 500 });
  }
}
