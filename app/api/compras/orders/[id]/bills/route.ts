// app/api/compras/orders/[id]/bills/route.ts
// POST { installments, firstDueDate, category, costCenterId?, paymentMethod? }
// Gera os lançamentos no Contas a Pagar a partir de um pedido APROVADO — etapa
// separada da aprovação, só pra aprovadores. Idempotente: IDs determinísticos
// (bills/po_{pedido}_{n}) + vínculo gravado no pedido na mesma transação;
// repetir devolve o vínculo existente (already: true) sem duplicar nada.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireComprasInternal, handleError, jsonError, readJson } from "@/lib/compras/auth";
import { generateBills, validateBillParams } from "@/lib/compras/service";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID_RE.test(id)) return jsonError("notFound", 404);
  const a = await requireComprasInternal(req, "approve");
  if (a instanceof NextResponse) return a;
  const params2 = validateBillParams(await readJson(req));
  if (!params2) return jsonError("invalidBillParams", 400);
  try {
    const db = await getAdminDb();
    const r = await generateBills(db, a.scope.ownerUid, id, a.actor, params2);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return handleError(err, "bills.POST");
  }
}
