// app/api/feedback/resolve/route.ts
// POST → adm supremo (lib/compAccounts) marca um chamado como resolvido e,
// por padrão, envia um e-mail ao usuário que abriu com o que foi feito.
// `{ id, reopen: true }` reabre um chamado (sem e-mail).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { isCompedEmail } from "@/lib/compAccounts";
import { feedbackResolvedEmail } from "@/lib/emailTemplates";
import { FEEDBACK_LIMITS, type FeedbackDoc } from "@/lib/feedback";

async function verifiedEmail(uid: string): Promise<string | null> {
  try {
    return (await (await getAdminAuth()).getUser(uid)).email ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }

  const adminEmail = await verifiedEmail(scope.uid);
  if (!isCompedEmail(adminEmail)) {
    return NextResponse.json({ error: "Você não tem acesso a esta ação." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Chamado não informado." }, { status: 400 });

  const db = await getAdminDb();
  const ref = db.collection("feedback").doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Chamado não encontrado." }, { status: 404 });
  const fb = { id: snap.id, ...(snap.data() as Omit<FeedbackDoc, "id">) };

  const now = Date.now();

  // ── Reabrir ──────────────────────────────────────────────────────────────
  if (body?.reopen === true) {
    await ref.set(
      { status: "aberto", resolvedAt: null, resolvedByEmail: null, updatedAt: now },
      { merge: true }
    );
    return NextResponse.json({ ok: true, status: "aberto" });
  }

  // ── Resolver ─────────────────────────────────────────────────────────────
  const resolution = String(body?.resolution ?? "").trim().slice(0, FEEDBACK_LIMITS.resolution);
  if (!resolution) {
    return NextResponse.json({ error: "Escreva o que foi feito." }, { status: 400 });
  }
  const notify = body?.notify !== false;

  let notifiedAt: number | null = fb.notifiedAt ?? null;
  let emailWarning: string | undefined;

  if (notify && fb.userEmail) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { subject, html, text } = feedbackResolvedEmail({
        type: fb.type,
        local: fb.local,
        atual: fb.atual,
        esperado: fb.esperado,
        resolution,
        appUrl,
        logoUrl: `${appUrl}/nexus_fi_logo_branco.png`,
      });
      const { error } = await resend.emails.send({
        from: process.env.RESET_EMAIL_FROM ?? "NexusFi <naoresponda@nexusfi.com.br>",
        to: fb.userEmail,
        subject,
        html,
        text,
      });
      if (error) {
        console.error("Erro ao enviar e-mail de retorno do feedback via Resend:", error);
        emailWarning = "Chamado resolvido, mas o e-mail de aviso falhou.";
      } else {
        notifiedAt = now;
      }
    } catch (err) {
      console.error("Erro ao enviar e-mail de retorno do feedback:", err);
      emailWarning = "Chamado resolvido, mas o e-mail de aviso falhou.";
    }
  }

  await ref.set(
    {
      status: "resolvido",
      resolution,
      resolvedAt: now,
      resolvedByEmail: adminEmail,
      notifiedAt,
      updatedAt: now,
    },
    { merge: true }
  );

  return NextResponse.json({ ok: true, status: "resolvido", notifiedAt, warning: emailWarning });
}
