// app/api/team/resend-invite/route.ts
// Reenvia o e-mail de "definir senha" pra um membro já criado (link
// perdido/expirado) — não recria a conta nem muda permissões.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireOwner } from "@/lib/teamAuth";
import { teamInviteEmail } from "@/lib/emailTemplates";
import { checkRateLimit } from "@/lib/rateLimit";
import { PERMISSION_CATEGORIES } from "@/lib/accountScope";

export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const memberUid = typeof body?.memberUid === "string" ? body.memberUid : "";
  if (!memberUid) return NextResponse.json({ error: "Membro inválido." }, { status: 400 });

  const { limited, retryAfterSec } = checkRateLimit(`team-resend:${memberUid}`, { windowMs: 15 * 60 * 1000, max: 3 });
  if (limited) {
    return NextResponse.json(
      { error: "Muitos reenvios em pouco tempo. Aguarde alguns minutos." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  const db = await getAdminDb();
  const teamSnap = await db.doc(`users/${auth.ownerUid}/team/${memberUid}`).get();
  if (!teamSnap.exists) return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });
  const member = teamSnap.data() as { email: string; permissions: string[] };

  try {
    const adminAuth = await getAdminAuth();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const setPasswordLink = await adminAuth.generatePasswordResetLink(member.email, { url: `${appUrl}/login` });

    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const permissionLabels = PERMISSION_CATEGORIES.filter((c) => member.permissions?.includes(c.key)).map((c) => c.label);
    const { subject, html, text } = teamInviteEmail({
      inviterName: auth.ownerName || auth.ownerEmail || "O administrador da conta",
      setPasswordLink,
      permissionLabels,
      logoUrl: `${appUrl}/nexus_fi_logo_branco.png`,
    });

    const { error } = await resend.emails.send({
      from: process.env.RESET_EMAIL_FROM ?? "NexusFi <naoresponda@nexusfi.com.br>",
      to: member.email, subject, html, text,
    });
    if (error) {
      console.error("Erro ao reenviar convite via Resend:", error);
      return NextResponse.json({ error: "Não foi possível enviar o e-mail agora." }, { status: 502 });
    }
  } catch (err) {
    console.error("Erro ao reenviar convite:", err);
    return NextResponse.json({ error: "Não foi possível reenviar agora." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
