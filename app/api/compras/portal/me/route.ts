// app/api/compras/portal/me/route.ts
// GET   — quem sou eu no portal: e-mail verificado?, empresas que atendo
//         (vínculos ativos) e meu cadastro (sem observações internas).
// PATCH { data } — atualizo os dados comerciais PERMITIDOS (nome fantasia, IE,
//         responsável, telefones, endereço, categoria). Razão social, CNPJ e
//         e-mail só a empresa altera.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { handleError, jsonError, readJson, requirePortal, verifyPortalToken } from "@/lib/compras/auth";
import { resolvePortal, supplierSelfView, updateSupplierSelf, type PortalContext } from "@/lib/compras/service";
import { validateSupplierSelf } from "@/lib/compras/validate";
import { companyInfo } from "@/lib/compras/notify";

export async function GET(req: Request) {
  const who = await verifyPortalToken(req);
  if (who instanceof NextResponse) return who;
  if (!who.emailVerified) return NextResponse.json({ ok: true, emailVerified: false, email: who.email, links: [] });
  try {
    const db = await getAdminDb();
    const links = (await resolvePortal(db, who.uid)) as PortalContext[];
    const wanted = req.headers.get("x-portal-link") ?? "";
    const current = links.find((l) => l.linkKey === wanted) ?? links[0] ?? null;
    const names = await Promise.all(links.map((l) => companyInfo(db, l.ownerUid).then((c) => c.name)));
    return NextResponse.json({
      ok: true,
      emailVerified: true,
      email: who.email,
      links: links.map((l, i) => ({ key: l.linkKey, companyName: names[i], supplierName: l.supplier.nomeFantasia || l.supplier.razaoSocial })),
      current: current ? current.linkKey : null,
      supplier: current ? supplierSelfView(current.supplier) : null,
    });
  } catch (err) {
    return handleError(err, "portal.me.GET");
  }
}

export async function PATCH(req: Request) {
  const p = await requirePortal(req);
  if (p instanceof NextResponse) return p;
  const body = await readJson(req);
  const v = validateSupplierSelf(body?.data);
  if (!v.ok) return jsonError("validation", 400, v.errors);
  try {
    const db = await getAdminDb();
    await updateSupplierSelf(db, p.ctx.ownerUid, p.ctx.supplierId, v.value, p.actor);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err, "portal.me.PATCH");
  }
}
