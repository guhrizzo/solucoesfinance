// app/api/compras/portal/orders/route.ts
// GET  — pedidos do PRÓPRIO fornecedor (visão filtrada, sem dados internos).
// POST { requestKey, data } — cria rascunho. Idempotente por requestKey
//        (ID determinístico): clique duplo não cria dois pedidos.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { handleError, jsonError, readJson, requirePortal, todaySP } from "@/lib/compras/auth";
import { createDraft, paths, supplierOrderView } from "@/lib/compras/service";
import { isRequestKey } from "@/lib/compras/token";
import type { PurchaseOrderDoc } from "@/lib/compras/types";

export async function GET(req: Request) {
  const p = await requirePortal(req);
  if (p instanceof NextResponse) return p;
  try {
    const db = await getAdminDb();
    const snap = await db.collection(paths.orders(p.ctx.ownerUid))
      .where("supplierId", "==", p.ctx.supplierId)
      .get();
    const orders = snap.docs
      .map((d) => supplierOrderView({ ...(d.data() as PurchaseOrderDoc), id: d.id }))
      .sort((a, b) => b.createdAt - a.createdAt);
    return NextResponse.json({ ok: true, orders });
  } catch (err) {
    return handleError(err, "portal.orders.GET");
  }
}

export async function POST(req: Request) {
  const p = await requirePortal(req);
  if (p instanceof NextResponse) return p;
  const body = await readJson(req);
  if (!body || !isRequestKey(body.requestKey)) return jsonError("validation", 400);
  try {
    const db = await getAdminDb();
    const r = await createDraft(db, p.ctx, p.actor, body.requestKey, body.data ?? {}, todaySP());
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return handleError(err, "portal.orders.POST");
  }
}
