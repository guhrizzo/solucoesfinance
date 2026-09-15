// app/api/analytics/route.ts
// GET — dados da aba "Analytics" de /configuracoes. Só o adm supremo
// (lib/compAccounts) enxerga: são métricas da PLATAFORMA inteira, não de
// uma conta. Ver docs/superpowers/specs/2026-09-15-analytics-visitantes-plataforma-design.md.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { isSupremeAdminEmail } from "@/lib/compAccounts";
import { getAnalyticsOverview } from "@/lib/analytics/overview";

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer (.+)$/.exec(h.trim());
  return m ? m[1] : null;
}

export async function GET(request: Request) {
  const token = bearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const auth = await getAdminAuth();
  let uid: string;
  try {
    uid = (await auth.verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: "Sessão inválida ou expirada. Entre novamente." }, { status: 401 });
  }

  let email: string | null = null;
  try {
    email = (await auth.getUser(uid)).email ?? null;
  } catch {
    email = null;
  }

  if (!isSupremeAdminEmail(email)) {
    return NextResponse.json({ error: "Sua conta não tem acesso a esta área." }, { status: 403 });
  }

  const overview = await getAnalyticsOverview();
  return NextResponse.json(overview);
}
