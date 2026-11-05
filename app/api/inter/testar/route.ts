// app/api/inter/testar/route.ts
//
// Bloqueada para o cliente: o teste da conexão bancária agora é feito só pela
// equipe NexusFi (adm supremo), em /api/admin/inter/testar. Responde 403 para
// qualquer chamador.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST() {
  return NextResponse.json(
    { error: "A conexão bancária é feita pela equipe NexusFi. Fale com o suporte." },
    { status: 403 }
  );
}
