// app/api/compras/orders/[id]/attachments/route.ts — anexos pela EQUIPE.
// POST (multipart "file") anexa · GET ?att= baixa (qualquer lado) · DELETE ?att= remove (só anexo interno)
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireComprasInternal, jsonError } from "@/lib/compras/auth";
import { deleteAttachment, downloadAttachment, isAttId, uploadAttachment } from "@/lib/compras/attachmentsApi";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError("notFound", 404);
  const a = await requireComprasInternal(req, "edit");
  if (a instanceof NextResponse) return a;
  return uploadAttachment(req, a.scope.ownerUid, id, a.actor, null);
}

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const att = new URL(req.url).searchParams.get("att");
  if (!ID_RE.test(id) || !isAttId(att)) return jsonError("notFound", 404);
  const a = await requireComprasInternal(req, "view");
  if (a instanceof NextResponse) return a;
  return downloadAttachment(a.scope.ownerUid, id, att, null);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const att = new URL(req.url).searchParams.get("att");
  if (!ID_RE.test(id) || !isAttId(att)) return jsonError("notFound", 404);
  const a = await requireComprasInternal(req, "edit");
  if (a instanceof NextResponse) return a;
  return deleteAttachment(a.scope.ownerUid, id, att, a.actor, null);
}
