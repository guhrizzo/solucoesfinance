// app/api/admin/inter/_guard.ts
//
// Portão e utilitários de servidor das rotas /api/admin/inter/* (adm supremo
// conecta o Banco Inter de um cliente pelo e-mail). Não é rota (não se chama
// route.ts), só um módulo compartilhado.
//
//   guardAdmin        — token válido → adm supremo (do ID token) → rate limit por adm.
//   resolveAdminTarget — re-resolve o e-mail do cliente A CADA chamada, com o
//                        Admin SDK; é a ÚNICA origem do ownerUid usado nas rotas.
//   auditarAdmin      — grava a auditoria (nunca lança).
// Logs só levam rótulo genérico + código do erro.

import { NextResponse } from "next/server";
import { requireScope, isScopeError, type ApiScope } from "@/lib/apiScope";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { isProAccess } from "@/lib/billing";
import { resolveScopeSubscription } from "@/lib/scopeSubscription";
import { checkRateLimit } from "@/lib/rateLimit";
import { isSupremeAdminEmail } from "@/lib/compAccounts";
import { assertAdmin, resolveTarget, writeAuditoria, type AdminTarget } from "@/lib/interAdminTarget";
import { buildAdminDeps, buildAuditEntry, type AdminAcao, type AdminActionResult } from "@/lib/interAdminRoutes";
import { errCode } from "@/lib/interErrors";

const RATE = { windowMs: 10 * 60 * 1000, max: 30 }; // 30 chamadas / 10 min por adm

export async function guardAdmin(req: Request): Promise<{ scope: ApiScope } | NextResponse> {
  let scope;
  try {
    scope = await requireScope(req);
  } catch (e) {
    console.error("[admin/inter] falha ao verificar sessão:", errCode(e));
    return NextResponse.json({ error: "Não foi possível verificar a sessão." }, { status: 500 });
  }
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }

  const adm = assertAdmin(scope);
  if (!adm.ok) return NextResponse.json({ error: adm.error }, { status: adm.status });

  // Sem bypass: aqui TODO chamador é adm supremo, então o limite vale pra ele.
  const { limited, retryAfterSec } = checkRateLimit(`admin-inter:${scope.uid}`, RATE, false);
  if (limited) {
    return NextResponse.json(
      { error: "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
  }
  return { scope };
}

/** Pro/cortesia do cliente como DONO da própria conta (mesma regra de app/api/inter/_guard.ts). */
async function clienteTemPro(uid: string, email: string | null): Promise<boolean> {
  const db = await getAdminDb();
  const state = await resolveScopeSubscription(db, {
    uid,
    ownerUid: uid,
    isOwner: true,
    permissions: "all",
    email,
    isSupremeAdmin: isSupremeAdminEmail(email),
  });
  return isProAccess(state);
}

/** Resolve o dono da conta pelo e-mail. Erro inesperado → 500 com mensagem fixa. */
export async function resolveAdminTarget(rawEmail: unknown): Promise<AdminTarget> {
  try {
    const auth = await getAdminAuth();
    const db = await getAdminDb();
    const deps = buildAdminDeps({
      getUserByEmail: (email) => auth.getUserByEmail(email),
      docExists: async (path) => (await db.doc(path).get()).exists,
      isPro: clienteTemPro,
    });
    return await resolveTarget(rawEmail, deps);
  } catch (e) {
    console.error("[admin/inter] falha ao localizar cliente:", errCode(e));
    return { ok: false, status: 500, error: "Não foi possível localizar o cliente agora. Tente novamente." };
  }
}

/** Grava a auditoria da ação (inclusive em falha). Nunca lança. */
export async function auditarAdmin(
  scope: ApiScope,
  alvo: { ownerUid: string; email: string },
  acao: AdminAcao,
  result: AdminActionResult
): Promise<void> {
  try {
    const db = await getAdminDb();
    await writeAuditoria(db, buildAuditEntry({ uid: scope.uid, email: scope.email }, alvo, acao, result));
  } catch (e) {
    console.error("[admin/inter] falha ao auditar:", errCode(e));
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
