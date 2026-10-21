// app/api/compras/suppliers/[id]/invite/route.ts
// POST { channels: ["email" | "whatsapp"] } — gera convite ao portal (token
// aleatório; só o SHA-256 vai pro banco), válido por 7 dias e de uso único, e
// envia pelos canais pedidos. WhatsApp sem credencial da Meta devolve um link
// wa.me com a mensagem pronta (fallback) — nunca marca como enviado.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { checkRateLimit } from "@/lib/rateLimit";
import { requireComprasInternal, handleError, jsonError, readJson } from "@/lib/compras/auth";
import { createInvite } from "@/lib/compras/service";
import { generateInviteToken } from "@/lib/compras/token";
import { sendInvite } from "@/lib/compras/notify";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError("notFound", 404);
  const a = await requireComprasInternal(req, "edit");
  if (a instanceof NextResponse) return a;

  const body = await readJson(req);
  const raw = Array.isArray(body?.channels) ? body.channels : ["email"];
  const channels = (["email", "whatsapp"] as const).filter((c) => raw.includes(c));
  if (channels.length === 0) return jsonError("validation", 400, { channels: "required" });

  const rl = checkRateLimit(`compras:invite:${a.scope.ownerUid}`, { windowMs: 60 * 60 * 1000, max: 30 }, a.scope.isSupremeAdmin);
  if (rl.limited) {
    return NextResponse.json({ error: "Muitos convites em pouco tempo. Aguarde e tente novamente.", code: "rateLimited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  try {
    const db = await getAdminDb();
    const { token, hash } = generateInviteToken();
    const { supplier, expiresAt } = await createInvite(db, a.scope.ownerUid, id, hash, [...channels], a.actor);
    const sent = await sendInvite(db, a.scope.ownerUid, supplier, token, expiresAt, [...channels]);
    // O link só volta pra quem convidou quando o WhatsApp caiu no fallback
    // (a pessoa precisa dele pra abrir o wa.me) — nunca é gravado em claro.
    return NextResponse.json({ ok: true, expiresAt, email: sent.email ?? null, whatsapp: sent.whatsapp ?? null });
  } catch (err) {
    return handleError(err, "invite.POST");
  }
}
