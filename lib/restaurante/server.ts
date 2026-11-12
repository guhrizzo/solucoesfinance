// lib/restaurante/server.ts
// Infra comum das rotas /api/restaurante/**: autorização (permissão
// "restaurante" + plano Pro), rate limit, ator, resposta de erro padronizada e
// o aviso de WhatsApp ao dono quando um ingrediente cruza o mínimo/zera.
// SOMENTE servidor. (Diferente do RH, não usa PIN.)

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError, type ApiScope } from "@/lib/apiScope";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { canUseRestaurante } from "@/lib/billing";
import { resolveScopeSubscription } from "@/lib/scopeSubscription";
import { RestError, type Cruzamento, type Ctx } from "./service";
import { deBase } from "./unidades";

export interface RestCtx extends Ctx {
  scope: ApiScope;
}

async function actorName(uid: string, email: string | null): Promise<string> {
  try {
    const u = await (await getAdminAuth()).getUser(uid);
    return u.displayName || u.email || email || uid;
  } catch {
    return email || uid;
  }
}

/** Autoriza a chamada. Devolve o contexto (sempre no ownerUid) ou a resposta de erro pronta. */
export async function guardRestaurante(request: Request, rateKey: string, max = 90): Promise<RestCtx | NextResponse> {
  const scope = await requireScope(request, "restaurante");
  if (isScopeError(scope)) return NextResponse.json({ error: scope.error }, { status: scope.status });

  const db = await getAdminDb();
  if (!canUseRestaurante(await resolveScopeSubscription(db, scope))) {
    return NextResponse.json({ error: "O módulo Restaurante é exclusivo do plano Pro." }, { status: 403 });
  }
  const { limited, retryAfterSec } = checkRateLimit(
    `rest-${rateKey}:${getClientIp(request)}:${scope.ownerUid}`,
    { windowMs: 60_000, max },
    scope.isSupremeAdmin,
  );
  if (limited) {
    return NextResponse.json(
      { error: "Muitas tentativas em pouco tempo. Aguarde um instante." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }
  return { scope, db, ownerUid: scope.ownerUid, actor: { uid: scope.uid, name: await actorName(scope.uid, scope.email) } };
}

export const isCtx = (r: RestCtx | NextResponse): r is RestCtx => !(r instanceof NextResponse);

export async function lerCorpo(request: Request): Promise<Record<string, unknown>> {
  const b = await request.json().catch(() => ({}));
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

/** RestError → resposta com a mensagem (pt-BR), o código e a lista de faltas, se houver. */
export function respostaErro(e: unknown, contexto: string): NextResponse {
  if (e instanceof RestError) {
    return NextResponse.json(
      { error: e.message, code: e.code, ...(e.faltas ? { faltas: e.faltas } : {}), ...(e.erros ? { erros: e.erros } : {}) },
      { status: e.status },
    );
  }
  console.error(`Erro Restaurante/${contexto}:`, e);
  return NextResponse.json({ error: "Erro inesperado. Tente novamente." }, { status: 500 });
}

const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(n);

/** Mostra g/ml grandes como kg/L no texto do aviso. */
function qtdTexto(q: number, base: Cruzamento["unidadeBase"]): string {
  if (base === "g" && Math.abs(q) >= 1000) return `${fmt(deBase(q, "kg"))} kg`;
  if (base === "ml" && Math.abs(q) >= 1000) return `${fmt(deBase(q, "L"))} L`;
  return `${fmt(q)} ${base}`;
}

/**
 * Aviso por WhatsApp (tipo "estoque" — o mesmo liga/desliga do Estoque em
 * Configurações > WhatsApp). O anti-spam já foi resolvido na transação
 * (`alertaNivel` no ingrediente): aqui só chegam cruzamentos novos.
 * Nunca lança: o aviso não pode derrubar a baixa já gravada.
 */
export async function avisarCruzamentos(ctx: Pick<Ctx, "db" | "ownerUid">, cruzamentos: Cruzamento[]): Promise<void> {
  if (cruzamentos.length === 0) return;
  try {
    const { notifyOwner } = await import("@/lib/ownerAlerts");
    const partes = cruzamentos.slice(0, 5).map((c) =>
      c.nivel === "zerado"
        ? `o ingrediente ${c.nome} acabou (saldo ${qtdTexto(c.saldo, c.unidadeBase)})`
        : `o ingrediente ${c.nome} está em ${qtdTexto(c.saldo, c.unidadeBase)}, no mínimo de ${qtdTexto(c.minimo, c.unidadeBase)} ou abaixo dele`,
    );
    const resto = cruzamentos.length > 5 ? ` (e mais ${cruzamentos.length - 5})` : "";
    await notifyOwner(ctx.db, ctx.ownerUid, "estoque", `no Restaurante, ${partes.join("; ")}${resto}`);
  } catch (e) {
    console.error("Restaurante: falha ao avisar o dono:", e);
  }
}
