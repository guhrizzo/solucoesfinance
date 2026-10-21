// app/api/compras/suppliers/[id]/route.ts
// PATCH { action: "update", data }   — edita o cadastro (inclui ativo/inativo)
// PATCH { action: "revokePortal" }   — corta o acesso do fornecedor ao portal
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireComprasInternal, handleError, jsonError, readJson } from "@/lib/compras/auth";
import { validateSupplier } from "@/lib/compras/validate";
import { revokePortal, updateSupplier } from "@/lib/compras/service";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError("notFound", 404);
  const body = await readJson(req);
  if (!body) return jsonError("validation", 400);

  const action = body.action;
  const a = await requireComprasInternal(req, action === "revokePortal" ? "approve" : "edit");
  if (a instanceof NextResponse) return a;

  try {
    const db = await getAdminDb();
    if (action === "revokePortal") {
      await revokePortal(db, a.scope.ownerUid, id, a.actor);
      return NextResponse.json({ ok: true });
    }
    if (action !== "update") return jsonError("validation", 400);
    const v = validateSupplier(body.data);
    if (!v.ok) return jsonError("validation", 400, v.errors);
    await updateSupplier(db, a.scope.ownerUid, id, v.value, a.actor);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "suppliers.PATCH");
  }
}
