// app/api/compras/portal/orders/[id]/attachments/route.ts — anexos pelo FORNECEDOR.
// POST (multipart "file") anexa (só no rascunho) · GET ?att= baixa · DELETE ?att= remove
// Só enxerga/mexe nos anexos do próprio lado, do próprio pedido.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { jsonError, requirePortal } from "@/lib/compras/auth";
import { deleteAttachment, downloadAttachment, isAttId, uploadAttachment } from "@/lib/compras/attachmentsApi";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError("notFound", 404);
  const p = await requirePortal(req);
  if (p instanceof NextResponse) return p;
  return uploadAttachment(req, p.ctx.ownerUid, id, p.actor, p.ctx.supplierId);
}

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const att = new URL(req.url).searchParams.get("att");
  if (!ID_RE.test(id) || !isAttId(att)) return jsonError("notFound", 404);
  const p = await requirePortal(req);
  if (p instanceof NextResponse) return p;
  return downloadAttachment(p.ctx.ownerUid, id, att, p.ctx.supplierId);
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const att = new URL(req.url).searchParams.get("att");
  if (!ID_RE.test(id) || !isAttId(att)) return jsonError("notFound", 404);
  const p = await requirePortal(req);
  if (p instanceof NextResponse) return p;
  return deleteAttachment(p.ctx.ownerUid, id, att, p.actor, p.ctx.supplierId);
}
