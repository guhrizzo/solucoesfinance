// app/api/compras/portal/accept/route.ts
// POST { token, password? } — ativa o acesso ao portal (consome o convite).
//
//  • Sem login (Bearer ausente): cria o login no Firebase Auth com o e-mail DO
//    CONVITE (a pessoa não escolhe outro) e a senha informada, marcado com a
//    claim `portalOnly` — essa conta não tem acesso a nada do app interno
//    (firestore.rules + lib/apiScope barram). Depois o client entra com
//    e-mail/senha normalmente.
//  • Com login (Bearer): vincula o login existente, desde que o e-mail bata
//    com o do convite.
//
// E-mail verificado: se o convite foi entregue SÓ por e-mail, receber o link já
// prova a posse do endereço; se foi por WhatsApp, o portal pede a confirmação
// por e-mail antes de liberar (lib/compras/auth requirePortal).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { passwordRules } from "@/lib/passwordRules";
import { handleError, jsonError, readJson, verifyPortalToken } from "@/lib/compras/auth";
import { acceptInvite, readInvite } from "@/lib/compras/service";
import { isTokenShape } from "@/lib/compras/token";

export async function POST(req: Request) {
  const rl = checkRateLimit(`compras:accept:${getClientIp(req)}`, { windowMs: 15 * 60 * 1000, max: 10 });
  if (rl.limited) return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos.", code: "rateLimited" }, { status: 429 });

  const body = await readJson(req);
  const token = body?.token;
  if (!isTokenShape(token)) return jsonError("inviteInvalid", 404);

  const db = await getAdminDb();
  const adminAuth = await getAdminAuth();
  const state = await readInvite(db, token);
  if (!state.ok) return jsonError(state.code, state.code === "inviteInvalid" ? 404 : 410);
  const emailProven = state.invite.channels.length === 1 && state.invite.channels[0] === "email";

  // ── Login já existente ──
  if (req.headers.get("authorization")) {
    const who = await verifyPortalToken(req);
    if (who instanceof NextResponse) return who;
    try {
      await acceptInvite(db, token, who.uid, who.email);
      if (emailProven && !who.emailVerified) await adminAuth.updateUser(who.uid, { emailVerified: true });
      return NextResponse.json({ ok: true, mode: "linked" });
    } catch (err) {
      return handleError(err, "accept.linked");
    }
  }

  // ── Login novo ──
  const password = typeof body?.password === "string" ? body.password : "";
  if (password.length > 128 || !passwordRules.every((r) => r.test(password))) {
    return NextResponse.json({ error: "A senha não atende aos requisitos.", code: "weakPassword", fields: { password: "weakPassword" } }, { status: 400 });
  }

  let uid: string;
  try {
    const created = await adminAuth.createUser({
      email: state.invite.email,
      password,
      displayName: (state.supplier.responsavel || state.supplier.nomeFantasia || state.supplier.razaoSocial).slice(0, 80),
      emailVerified: emailProven,
    });
    uid = created.uid;
    await adminAuth.setCustomUserClaims(uid, { portalOnly: true });
  } catch (err) {
    if ((err as { code?: string })?.code === "auth/email-already-exists") {
      return NextResponse.json({ error: "Já existe um login com este e-mail. Entre com sua senha para ativar o acesso.", code: "accountExists" }, { status: 409 });
    }
    console.error("[compras] criar login do fornecedor:", err);
    return NextResponse.json({ error: "Não foi possível criar o acesso agora.", code: "internal" }, { status: 500 });
  }

  try {
    await acceptInvite(db, token, uid, state.invite.email);
    return NextResponse.json({ ok: true, mode: "created", email: state.invite.email, emailVerified: emailProven });
  } catch (err) {
    // Convite consumido por outro aceite simultâneo (ou revogado no meio): não deixa login órfão.
    await adminAuth.deleteUser(uid).catch(() => undefined);
    return handleError(err, "accept.created");
  }
}
