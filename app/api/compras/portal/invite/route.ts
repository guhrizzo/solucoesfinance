// app/api/compras/portal/invite/route.ts
// POST { token } — confere o convite antes do aceite (página /fornecedor/convite).
// Público (o token é a credencial), com rate limit por IP. Devolve só o
// necessário pra tela: empresa, fornecedor, e-mail mascarado e se já existe
// login com esse e-mail (aí a pessoa entra em vez de criar senha).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { jsonError, readJson } from "@/lib/compras/auth";
import { readInvite } from "@/lib/compras/service";
import { isTokenShape } from "@/lib/compras/token";
import { companyInfo } from "@/lib/compras/notify";

const maskEmail = (e: string) => {
  const [u, d] = e.split("@");
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${d}`;
};

export async function POST(req: Request) {
  const rl = checkRateLimit(`compras:invite-check:${getClientIp(req)}`, { windowMs: 15 * 60 * 1000, max: 30 });
  if (rl.limited) return NextResponse.json({ error: "Muitas tentativas. Aguarde alguns minutos.", code: "rateLimited" }, { status: 429 });

  const body = await readJson(req);
  const token = body?.token;
  if (!isTokenShape(token)) return jsonError("inviteInvalid", 404);

  const db = await getAdminDb();
  const state = await readInvite(db, token);
  if (!state.ok) return jsonError(state.code, state.code === "inviteInvalid" ? 404 : 410);

  const [company, existing] = await Promise.all([
    companyInfo(db, state.invite.ownerUid),
    getAdminAuth().then((a) => a.getUserByEmail(state.invite.email)).catch(() => null),
  ]);
  return NextResponse.json({
    ok: true,
    companyName: company.name,
    supplierName: state.supplier.nomeFantasia || state.supplier.razaoSocial,
    email: state.invite.email,
    emailMasked: maskEmail(state.invite.email),
    accountExists: !!existing,
    expiresAt: state.invite.expiresAt,
  });
}
