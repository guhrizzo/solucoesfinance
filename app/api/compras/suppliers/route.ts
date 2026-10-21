// app/api/compras/suppliers/route.ts
// POST — cadastra fornecedor (equipe com "contasPagar"). CNPJ validado com
// dígito verificador e único por conta (transação com índice por CNPJ).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireComprasInternal, handleError, jsonError, readJson } from "@/lib/compras/auth";
import { validateSupplier } from "@/lib/compras/validate";
import { createSupplier } from "@/lib/compras/service";

export async function POST(req: Request) {
  const a = await requireComprasInternal(req, "edit");
  if (a instanceof NextResponse) return a;
  const body = await readJson(req);
  if (!body) return jsonError("validation", 400);
  const v = validateSupplier(body.data);
  if (!v.ok) return jsonError("validation", 400, v.errors);
  try {
    const db = await getAdminDb();
    const id = await createSupplier(db, a.scope.ownerUid, v.value, a.actor);
    // Espelha no cadastro simples do Contas a Pagar (users/{uid}/fornecedores,
    // ver CadastroPanel) pra o fornecedor aparecer no seletor do modal de conta.
    try {
      const col = db.collection(`users/${a.scope.ownerUid}/fornecedores`);
      const dup = await col.where("doc", "==", v.value.cnpj).limit(1).get();
      if (dup.empty) await col.add({ name: v.value.razaoSocial, doc: v.value.cnpj, createdAt: Date.now() });
    } catch (err) {
      console.error("[compras] espelho em fornecedores:", err);
    }
    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return handleError(err, "suppliers.POST");
  }
}
