// app/api/inter/boletos/_comum.ts
// Peças comuns às rotas de boleto (não é rota: não se chama route.ts).
// Permissão = a mesma de Contas a Receber. O PIN é exigido no app (usePin /
// PinModal) antes de chamar emitir/cancelar; aqui fica o carimbo de quem fez.

import { NextResponse } from "next/server";
import type { ApiScope } from "@/lib/apiScope";
import type { Actor } from "@/lib/audit";
import { BoletoError, type BoletoErroKind } from "@/lib/interBoletoServer";
import { errCode } from "../_guard";

export const PERMISSAO_BOLETOS = "contasReceber" as const;

const STATUS: Record<BoletoErroKind, number> = {
  validacao: 400,
  "nao-encontrado": 404,
  conflito: 409,
  "nao-conectado": 404,
  config: 500,
  inter: 502,
};

/** Quem fez: sempre o usuário logado (não o dono dos dados). */
export function actorDe(scope: ApiScope): Actor {
  return { uid: scope.uid, name: scope.email ?? "Usuário" };
}

/** BoletoError → mensagem dele (já é nossa); o resto → genérica, e o log leva só o código do erro. */
export function respostaErro(e: unknown, rota: string, generica: string): NextResponse {
  if (e instanceof BoletoError) return NextResponse.json({ error: e.message }, { status: STATUS[e.kind] });
  console.error(`[inter/boletos/${rota}] falha:`, errCode(e));
  return NextResponse.json({ error: generica }, { status: 500 });
}
