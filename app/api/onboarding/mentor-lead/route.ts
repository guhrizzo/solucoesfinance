// app/api/onboarding/mentor-lead/route.ts
// POST → quem marca "Preciso de ajuda de um mentor financeiro" no onboarding
// vira um lead: grava em `mentorLeads/{uid}` (Admin SDK) e avisa a equipe NexusFi
// no WhatsApp (template de aviso, lib/whatsapp.ts). Um lead por conta — refazer o
// onboarding não manda outra mensagem.
//
// Destino do aviso: MENTOR_LEAD_WHATSAPP (padrão: número comercial da landing).
// Sem a Cloud API configurada o lead fica salvo com `whatsapp: "not_configured"`.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { sendWhatsAppAlert } from "@/lib/whatsapp";

const TEAM_PHONE_FALLBACK = "5511926198042";

export async function POST(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    /* corpo é opcional */
  }
  const cargo = String(body?.cargo ?? "").trim().slice(0, 80);
  const faturamento = String(body?.faturamento ?? "").trim().slice(0, 80);
  const ramo = String(body?.ramo ?? "").trim().slice(0, 80);

  try {
    const db = await getAdminDb();
    const ref = db.collection("mentorLeads").doc(scope.uid);
    if ((await ref.get()).exists) return NextResponse.json({ ok: true, duplicate: true });

    let email = "";
    let name = "";
    try {
      const rec = await (await getAdminAuth()).getUser(scope.uid);
      email = rec.email ?? "";
      name = rec.displayName ?? "";
    } catch { /* segue só com o uid */ }

    let company = "";
    try {
      const snap = await db.doc(`users/${scope.ownerUid}/profile/company`).get();
      const c = snap.exists ? snap.data() : null;
      company = String(c?.nomeFantasia || c?.razaoSocial || "").trim();
    } catch { /* empresa ainda não cadastrada */ }

    const details = [cargo && `cargo: ${cargo}`, faturamento && `faturamento: ${faturamento}`, ramo && `ramo: ${ramo}`]
      .filter(Boolean)
      .join("; ");
    const text =
      `Novo lead pediu mentor financeiro: ${name || "sem nome"} (${email || "sem e-mail"})` +
      (company ? `, empresa ${company}` : "") +
      (details ? `. ${details}` : "") +
      ".";

    const result = await sendWhatsAppAlert({
      phone: process.env.MENTOR_LEAD_WHATSAPP || TEAM_PHONE_FALLBACK,
      name: "equipe",
      companyName: company || "NexusFi",
      text,
    });

    await ref.set({
      userId: scope.uid,
      email,
      name,
      company,
      cargo,
      faturamento,
      ramo,
      createdAt: Date.now(),
      whatsapp: result.ok ? "sent" : result.reason,
      whatsappDetail: result.ok ? null : result.detail ?? null,
    });

    return NextResponse.json({ ok: true, whatsapp: result.ok ? "sent" : result.reason });
  } catch (err) {
    console.error("Erro ao registrar lead de mentor:", err);
    return NextResponse.json({ error: "Não foi possível registrar agora." }, { status: 500 });
  }
}
