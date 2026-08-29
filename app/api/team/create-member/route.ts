// app/api/team/create-member/route.ts
// Cria uma conta de equipe (Firebase Auth) e permissiona por categoria —
// só quem é dono da conta (ver lib/teamAuth) pode chamar isto. A pessoa
// convidada recebe um e-mail com link do Firebase pra definir a própria
// senha (mesmo padrão do "esqueci minha senha"); ninguém, nem o admin,
// fica sabendo a senha dela.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireOwner } from "@/lib/teamAuth";
import { teamInviteEmail } from "@/lib/emailTemplates";
import { checkRateLimit } from "@/lib/rateLimit";
import { PERMISSION_CATEGORIES, type PermissionKey } from "@/lib/accountScope";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_KEYS = new Set<string>(PERMISSION_CATEGORIES.map((c) => c.key));
const MAX_TEAM_SIZE = 25;

export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 80) : "";
  const permissions = (Array.isArray(body?.permissions) ? body.permissions : []).filter(
    (p: unknown): p is PermissionKey => typeof p === "string" && VALID_KEYS.has(p)
  );

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }
  if (!displayName) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }

  const { limited, retryAfterSec } = checkRateLimit(`team-invite:${auth.ownerUid}`, {
    windowMs: 60 * 60 * 1000,
    max: 20,
  });
  if (limited) {
    return NextResponse.json(
      { error: "Muitos convites em pouco tempo. Aguarde e tente novamente." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }

  const adminAuth = await getAdminAuth();
  const db = await getAdminDb();

  const teamSnap = await db.collection(`users/${auth.ownerUid}/team`).get();
  if (teamSnap.size >= MAX_TEAM_SIZE) {
    return NextResponse.json({ error: `Limite de ${MAX_TEAM_SIZE} membros de equipe atingido.` }, { status: 400 });
  }

  let newUid: string;
  try {
    // Senha descartável — a pessoa nunca a usa, ela define a própria pelo
    // link de "definir senha" enviado por e-mail logo abaixo. O sufixo
    // garante maiúscula/minúscula/dígito/símbolo caso o projeto tenha uma
    // política de senha forte habilitada no Firebase Auth.
    const throwawayPassword = randomUUID() + randomUUID().toUpperCase() + "Aa1!";
    const created = await adminAuth.createUser({
      email, displayName, password: throwawayPassword, emailVerified: false,
    });
    newUid = created.uid;
  } catch (err: any) {
    if (err?.code === "auth/email-already-exists") {
      return NextResponse.json({ error: "Já existe uma conta com este e-mail." }, { status: 409 });
    }
    console.error("Erro ao criar usuário de equipe:", err);
    return NextResponse.json({ error: "Não foi possível criar o acesso agora." }, { status: 500 });
  }

  const now = Date.now();
  try {
    const batch = db.batch();
    batch.set(db.doc(`users/${newUid}/profile/access`), {
      ownerId: auth.ownerUid, role: "member", permissions, email, displayName, createdAt: now,
    });
    batch.set(db.doc(`users/${auth.ownerUid}/team/${newUid}`), {
      memberUid: newUid, email, displayName, permissions, status: "active", createdAt: now,
    });
    await batch.commit();
  } catch (err) {
    // Reverte a criação do login pra não deixar um usuário "órfão" sem docs.
    await adminAuth.deleteUser(newUid).catch(() => {});
    console.error("Erro ao gravar permissões da equipe:", err);
    return NextResponse.json({ error: "Não foi possível salvar as permissões agora." }, { status: 500 });
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const setPasswordLink = await adminAuth.generatePasswordResetLink(email, { url: `${appUrl}/login` });

    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const permissionLabels = PERMISSION_CATEGORIES.filter((c) => permissions.includes(c.key)).map((c) => c.label);
    const { subject, html, text } = teamInviteEmail({
      inviterName: auth.ownerName || auth.ownerEmail || "O administrador da conta",
      setPasswordLink,
      permissionLabels,
      logoUrl: `${appUrl}/nexus_fi_logo_branco.png`,
    });

    const { error } = await resend.emails.send({
      from: process.env.RESET_EMAIL_FROM ?? "NexusFi <naoresponda@nexusfi.com.br>",
      to: email, subject, html, text,
    });
    if (error) console.error("Erro ao enviar convite de equipe via Resend:", error);
  } catch (err) {
    // Não desfaz a criação — o acesso já existe e está permissionado; o
    // admin pode reenviar o convite depois (ver /api/team/resend-invite se
    // vier a existir; por ora, recriar via update-member já cobre reenvio
    // manual se necessário).
    console.error("Erro ao gerar/enviar convite de equipe:", err);
  }

  return NextResponse.json({ ok: true, uid: newUid });
}
