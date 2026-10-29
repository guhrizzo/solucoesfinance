export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { guardRh, isCtx, rhCol } from "@/lib/rh/server";

// Registro de acessos e alterações (LGPD). Somente leitura; os valores
// sensíveis nunca entram aqui — só quem, quando, o quê e quais campos.

export async function GET(request: Request) {
  try {
    const ctx = await guardRh(request, "log-get");
    if (!isCtx(ctx)) return ctx;
    const snap = await rhCol(ctx, "rhLog").orderBy("em", "desc").limit(200).get();
    return NextResponse.json({ log: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (error) {
    console.error("Erro RH/log GET:", error);
    return NextResponse.json({ error: "Erro ao carregar o registro de acessos." }, { status: 500 });
  }
}
