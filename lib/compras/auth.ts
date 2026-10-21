// lib/compras/auth.ts
// Autorização das rotas app/api/compras/** (SOMENTE server-side).
//
//   requireComprasInternal → equipe da empresa (dono/membros). Usa o escopo de
//     lib/apiScope (ID token verificado + users/{uid}/profile/access) e deriva
//     os papéis: editor = permissão "contasPagar"; aprovador = dono ou
//     permissão "comprasAprovacao".
//   requirePortal → fornecedor. Verifica o ID token, exige e-mail verificado e
//     resolve o vínculo login ↔ fornecedor (supplierPortalUsers + supplier.portal)
//     no servidor. NUNCA aceita ownerUid/supplierId vindo do cliente — o
//     cliente só escolhe ENTRE os vínculos que o próprio uid já tem.

import { NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError, type ApiScope } from "@/lib/apiScope";
import { hasPermission } from "@/lib/accountScope";
import { checkRateLimit } from "@/lib/rateLimit";
import { ComprasError, errorMessage, resolvePortal, type Actor, type PortalContext } from "./service";

export type InternalNeed = "view" | "edit" | "approve";

export interface InternalAuth {
  scope: ApiScope;
  actor: Actor;
}

export function jsonError(code: string, status: number, fields?: Record<string, string>, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: errorMessage(code), code, ...(fields ? { fields } : {}), ...(extra ?? {}) }, { status });
}

/** Converte exceções do serviço em resposta JSON (e loga o que for inesperado). */
export function handleError(err: unknown, where: string) {
  if (err instanceof ComprasError) return jsonError(err.code, err.status, err.fields);
  console.error(`[compras] ${where}:`, err);
  return NextResponse.json({ error: "Erro interno. Tente novamente em instantes.", code: "internal" }, { status: 500 });
}

export async function requireComprasInternal(req: Request, need: InternalNeed): Promise<InternalAuth | NextResponse> {
  const scope = await requireScope(req);
  if (isScopeError(scope)) return NextResponse.json({ error: scope.error, code: "auth" }, { status: scope.status });
  const canEdit = hasPermission(scope, "contasPagar");
  const canApprove = scope.isOwner || (scope.permissions !== "all" && scope.permissions.includes("comprasAprovacao"));
  const ok = need === "view" ? canEdit || canApprove : need === "edit" ? canEdit : canApprove;
  if (!ok) return jsonError("forbidden", 403);

  const rl = checkRateLimit(`compras:int:${scope.uid}`, { windowMs: 60_000, max: 90 }, scope.isSupremeAdmin);
  if (rl.limited) {
    return NextResponse.json({ error: "Muitas requisições. Aguarde um instante.", code: "rateLimited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  const auth = await getAdminAuth();
  const user = await auth.getUser(scope.uid).catch(() => null);
  const name = user?.displayName || scope.email || "Equipe";
  return { scope, actor: { uid: scope.uid, name, side: "internal", roles: { canEdit, canApprove } } };
}

export interface PortalAuth {
  uid: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

function bearer(req: Request): string | null {
  const m = /^Bearer (.+)$/.exec((req.headers.get("authorization") ?? "").trim());
  return m ? m[1] : null;
}

/** Só verifica o token (sem exigir vínculo) — usado no aceite do convite e no reenvio de verificação. */
export async function verifyPortalToken(req: Request): Promise<PortalAuth | NextResponse> {
  const token = bearer(req);
  if (!token) return NextResponse.json({ error: "Não autenticado.", code: "auth" }, { status: 401 });
  try {
    const d = await (await getAdminAuth()).verifyIdToken(token);
    if (!d.email) return NextResponse.json({ error: "Conta sem e-mail.", code: "auth" }, { status: 401 });
    return { uid: d.uid, email: d.email.toLowerCase(), emailVerified: d.email_verified === true, name: (d.name as string | undefined) || d.email };
  } catch {
    return NextResponse.json({ error: "Sessão inválida ou expirada. Entre novamente.", code: "auth" }, { status: 401 });
  }
}

export interface PortalRequest {
  auth: PortalAuth;
  ctx: PortalContext;
  actor: Actor;
}

/**
 * Fornecedor autenticado + vínculo ativo. `linkKey` vem do header
 * `x-portal-link` (o portal escolhe entre empresas quando o login atende mais
 * de uma); o servidor confere que esse vínculo é DESTE uid.
 */
export async function requirePortal(req: Request, opts: { requireVerified?: boolean } = {}): Promise<PortalRequest | NextResponse> {
  const auth = await verifyPortalToken(req);
  if (auth instanceof NextResponse) return auth;
  if (opts.requireVerified !== false && !auth.emailVerified) {
    return NextResponse.json({ error: "Confirme seu e-mail para usar o portal.", code: "emailNotVerified" }, { status: 403 });
  }
  const rl = checkRateLimit(`compras:portal:${auth.uid}`, { windowMs: 60_000, max: 60 });
  if (rl.limited) {
    return NextResponse.json({ error: "Muitas requisições. Aguarde um instante.", code: "rateLimited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  const rawKey = req.headers.get("x-portal-link") ?? "";
  const linkKey = /^[A-Za-z0-9_-]{1,200}$/.test(rawKey) ? rawKey : "";
  try {
    const db = await getAdminDb();
    const ctx = (await resolvePortal(db, auth.uid, linkKey)) as PortalContext;
    return {
      auth, ctx,
      actor: { uid: auth.uid, name: ctx.supplier.responsavel || auth.name, side: "supplier", roles: { supplier: true } },
    };
  } catch (err) {
    return handleError(err, "requirePortal");
  }
}

/** Hoje em São Paulo (YYYY-MM-DD). */
export const todaySP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
