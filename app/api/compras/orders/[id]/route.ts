// app/api/compras/orders/[id]/route.ts — ações da EQUIPE sobre um pedido.
//
// PATCH { data, internalNotes?, expectedRevision }  ajuste de itens/valores/condições
//        durante a análise (editor). Pedido aprovado com mudança relevante volta
//        pra "em análise" e exige nova aprovação.
// POST  { action, reason?, expectedRevision? }      mudança de status:
//        startReview (editor) · approve | reject | cancel | complete (aprovador)
//        Recusa/cancelamento exigem motivo. O fornecedor é avisado (e-mail +
//        WhatsApp/wa.me) e cada envio fica no log de notificações.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireComprasInternal, handleError, jsonError, readJson, todaySP } from "@/lib/compras/auth";
import { internalEditOrder, transitionOrder, type TransitionAction } from "@/lib/compras/service";
import { notifyStatusChange } from "@/lib/compras/notify";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const ACTIONS: Record<string, { action: TransitionAction; need: "edit" | "approve" }> = {
  startReview: { action: "startReview", need: "edit" },
  approve: { action: "approve", need: "approve" },
  reject: { action: "reject", need: "approve" },
  cancel: { action: "cancel", need: "approve" },
  complete: { action: "complete", need: "approve" },
};

const revisionOf = (v: unknown) => (Number.isInteger(v) ? (v as number) : null);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError("notFound", 404);
  const a = await requireComprasInternal(req, "edit");
  if (a instanceof NextResponse) return a;
  const body = await readJson(req);
  if (!body) return jsonError("validation", 400);
  try {
    const db = await getAdminDb();
    const r = await internalEditOrder(
      db, a.scope.ownerUid, id, a.actor, body.data,
      { internalNotes: typeof body.internalNotes === "string" ? body.internalNotes : undefined },
      revisionOf(body.expectedRevision), todaySP(),
    );
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return handleError(err, "orders.PATCH");
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError("notFound", 404);
  const body = await readJson(req);
  const spec = ACTIONS[String(body?.action ?? "")];
  if (!body || !spec) return jsonError("validation", 400);
  const a = await requireComprasInternal(req, spec.need);
  if (a instanceof NextResponse) return a;
  try {
    const db = await getAdminDb();
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : null;
    const r = await transitionOrder(db, a.scope.ownerUid, id, spec.action, a.actor, {
      reason, expectedRevision: revisionOf(body.expectedRevision),
    });
    const notified = await notifyStatusChange(db, a.scope.ownerUid, r.order, r.to, r.order.rejectionReason ?? r.order.cancelReason ?? null);
    return NextResponse.json({ ok: true, status: r.to, notified });
  } catch (err) {
    return handleError(err, "orders.POST");
  }
}
