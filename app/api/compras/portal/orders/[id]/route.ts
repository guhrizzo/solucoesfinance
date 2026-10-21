// app/api/compras/portal/orders/[id]/route.ts — pedido do PRÓPRIO fornecedor.
// GET   — detalhe (visão filtrada).
// PATCH { data } — salva o rascunho (totais recalculados no servidor).
// POST  { action: "submit", submitKey } — envia pra análise (idempotente).
//       { action: "cancel", reason }    — retira o pedido (rascunho/enviado).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { handleError, jsonError, readJson, requirePortal, todaySP } from "@/lib/compras/auth";
import { paths, saveDraft, submitOrder, supplierOrderView, transitionOrder } from "@/lib/compras/service";
import { isRequestKey } from "@/lib/compras/token";
import { notifyOrderSubmitted } from "@/lib/compras/notify";
import type { PurchaseOrderDoc } from "@/lib/compras/types";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError("notFound", 404);
  const p = await requirePortal(req);
  if (p instanceof NextResponse) return p;
  try {
    const db = await getAdminDb();
    const snap = await db.doc(paths.order(p.ctx.ownerUid, id)).get();
    const order = snap.exists ? ({ ...(snap.data() as PurchaseOrderDoc), id: snap.id }) : null;
    if (!order || order.supplierId !== p.ctx.supplierId) return jsonError("notFound", 404);
    return NextResponse.json({ ok: true, order: supplierOrderView(order) });
  } catch (err) {
    return handleError(err, "portal.order.GET");
  }
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError("notFound", 404);
  const p = await requirePortal(req);
  if (p instanceof NextResponse) return p;
  const body = await readJson(req);
  if (!body) return jsonError("validation", 400);
  try {
    const db = await getAdminDb();
    await saveDraft(db, p.ctx, id, p.actor, body.data ?? {}, todaySP());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "portal.order.PATCH");
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError("notFound", 404);
  const p = await requirePortal(req);
  if (p instanceof NextResponse) return p;
  const body = await readJson(req);
  try {
    const db = await getAdminDb();
    if (body?.action === "submit") {
      if (!isRequestKey(body.submitKey)) return jsonError("validation", 400);
      const r = await submitOrder(db, p.ctx, id, p.actor, body.submitKey, todaySP());
      if (!r.already) await notifyOrderSubmitted(db, p.ctx.ownerUid, r.order, p.ctx.supplier);
      return NextResponse.json({ ok: true, already: r.already });
    }
    if (body?.action === "cancel") {
      const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : "";
      await transitionOrder(db, p.ctx.ownerUid, id, "supplierCancel", p.actor, { reason, supplierId: p.ctx.supplierId });
      return NextResponse.json({ ok: true });
    }
    return jsonError("validation", 400);
  } catch (err) {
    return handleError(err, "portal.order.POST");
  }
}
