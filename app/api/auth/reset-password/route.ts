// app/api/auth/reset-password/route.ts
// Gera o link de redefinição de senha pelo Firebase Admin SDK e envia o
// e-mail pela Resend, usando o domínio próprio (naoresponda@nexusfi.com.br)
// em vez do domínio compartilhado do Firebase — isso é o que realmente
// resolve o problema de cair em spam (reputação do remetente é sua, não
// da infra genérica do *.firebaseapp.com).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { passwordResetEmail } from "@/lib/emailTemplates";
import { checkRateLimit } from "@/lib/rateLimit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 3 }; // 3 pedidos / 15 min por e-mail

export async function POST(req: NextRequest) {
  let email: string | undefined;
  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : undefined;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }

  const { limited, retryAfterSec } = checkRateLimit(`reset-password:${email}`, RATE_LIMIT);
  if (limited) {
    return NextResponse.json(
      { error: "Muitos pedidos para este e-mail. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  // Resposta genérica de sucesso — devolvida tanto se o e-mail existe quanto
  // se não existe, para não permitir descobrir quais e-mails têm conta
  // (enumeração de usuários).
  const genericOk = () => NextResponse.json({ ok: true });

  try {
    const adminAuth = await getAdminAuth();

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const continueUrl = `${appUrl}/login`;
    const resetLink = await adminAuth.generatePasswordResetLink(email, { url: continueUrl });

    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { subject, html, text } = passwordResetEmail(resetLink, `${appUrl}/nexus_fi_logo_branco.png`);

    const { error } = await resend.emails.send({
      from: process.env.RESET_EMAIL_FROM ?? "NexusFi <naoresponda@nexusfi.com.br>",
      to: email,
      subject,
      html,
      text,
    });

    if (error) {
      console.error("Erro ao enviar e-mail de reset via Resend:", error);
      return NextResponse.json({ error: "Não foi possível enviar o e-mail agora. Tente novamente em instantes." }, { status: 502 });
    }

    return genericOk();
  } catch (err: any) {
    // O Admin SDK deveria lançar "auth/user-not-found" para e-mail inexistente,
    // mas em muitos casos lança um "auth/internal-error" genérico nesse mesmo
    // cenário ("Unable to create the email action link") — sem tratar os dois,
    // a resposta (200 vs 500) vazava quais e-mails têm conta (enumeração).
    const looksLikeUserNotFound =
      err?.code === "auth/user-not-found" ||
      (err?.code === "auth/internal-error" && /unable to create the email action link/i.test(err?.message ?? ""));

    if (looksLikeUserNotFound) {
      return genericOk();
    }
    console.error("Erro ao gerar/enviar link de redefinição de senha:", err);
    return NextResponse.json({ error: "Não foi possível processar o pedido agora. Tente novamente em instantes." }, { status: 500 });
  }
}
