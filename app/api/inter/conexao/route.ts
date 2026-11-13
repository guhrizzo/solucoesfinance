// app/api/inter/conexao/route.ts
//
// Bloqueada para o cliente: a conexão bancária agora é feita só pela equipe
// NexusFi (adm supremo), em /api/admin/inter/conexao. Responde 403 em
// POST/PUT/DELETE para qualquer chamador; o núcleo (lib/interConexaoServer.ts)
// segue usado só pelas rotas de adm. Mantida (em vez de apagada) para que
// clientes antigos recebam uma mensagem clara.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

function bloqueado() {
  return NextResponse.json(
    { error: "A conexão bancária é feita pela equipe NexusFi. Fale com o suporte." },
    { status: 403 }
  );
}

export async function POST() {
  return bloqueado();
}

export async function PUT() {
  return bloqueado();
}

export async function DELETE() {
  return bloqueado();
}
