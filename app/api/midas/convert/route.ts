// POST /api/midas/convert — vincula o lead da demo ao usuário recém-cadastrado.
// requireScope só exige ID token válido: sem profile/access o usuário é tratado
// como dono da própria conta, então funciona logo após o cadastro.
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { markConverted } from "@/lib/midas/leadServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const scope = await requireScope(request);
    if (isScopeError(scope)) return NextResponse.json({ ok: false }, { status: scope.status });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false }, { status: 200 });
    }
    const sessionId = (body as { sessionId?: unknown } | null)?.sessionId;
    if (typeof sessionId !== "string") return NextResponse.json({ ok: false }, { status: 200 });

    const db = await getAdminDb();
    const ok = await markConverted(db, sessionId, scope.uid);
    return NextResponse.json({ ok });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
