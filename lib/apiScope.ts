// lib/apiScope.ts
// Autorização server-side pras rotas app/api/** que operam sobre o ESCOPO de
// uma conta (o dono, ou um membro convidado com permissão de categoria).
// SOMENTE uso em rotas de servidor.
//
// Espelha lib/accountScope.ts (client) mas roda com o Admin SDK: verifica o
// ID token do Firebase de verdade e NUNCA confia num uid/ownerUid que o cliente
// mande no corpo ou na query string. É isto que impede alguém de chamar
// `/api/shopee/repasse` ou `/api/estoque/sincronizar` com o uid de outra conta.

import { getAdminAuth, getAdminDb } from "./firebaseAdmin";
import { hasPermission, type PermissionKey } from "./accountScope";

export interface ApiScope {
  /** uid do Firebase Auth de quem fez a requisição (do ID token). */
  uid: string;
  /** uid cujos dados a rota deve ler/escrever — o próprio uid se for dono. */
  ownerUid: string;
  isOwner: boolean;
  permissions: "all" | PermissionKey[];
}

export type ApiScopeResult = ApiScope | { error: string; status: number };

export function isScopeError(r: ApiScopeResult): r is { error: string; status: number } {
  return "error" in r;
}

function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer (.+)$/.exec(h.trim());
  return m ? m[1] : null;
}

/**
 * Verifica o Bearer ID token e resolve o escopo de dados
 * (`users/{uid}/profile/access`). Passe `need` pra exigir uma categoria de
 * permissão (uma chave ou uma lista = "qualquer uma delas"); donos sempre passam.
 *
 * Uso:
 *   const scope = await requireScope(request, "estoque");
 *   if (isScopeError(scope)) return NextResponse.json({ error: scope.error }, { status: scope.status });
 *   // ... usar scope.ownerUid (NUNCA um userId vindo do cliente)
 */
export async function requireScope(
  req: Request,
  need?: PermissionKey | PermissionKey[]
): Promise<ApiScopeResult> {
  const token = bearerToken(req);
  if (!token) return { error: "Não autenticado.", status: 401 };

  const auth = await getAdminAuth();
  let uid: string;
  try {
    uid = (await auth.verifyIdToken(token)).uid;
  } catch {
    return { error: "Sessão inválida ou expirada. Entre novamente.", status: 401 };
  }

  const db = await getAdminDb();
  const snap = await db.doc(`users/${uid}/profile/access`).get();

  let scope: ApiScope;
  if (!snap.exists) {
    // Sem doc de acesso → é dono da própria conta (acesso total).
    scope = { uid, ownerUid: uid, isOwner: true, permissions: "all" };
  } else {
    const data = (snap.data() ?? {}) as { ownerId?: string; permissions?: PermissionKey[] };
    const ownerUid = typeof data.ownerId === "string" && data.ownerId ? data.ownerId : uid;
    scope = {
      uid,
      ownerUid,
      isOwner: ownerUid === uid,
      permissions: Array.isArray(data.permissions) ? data.permissions : [],
    };
  }

  if (need) {
    const keys = Array.isArray(need) ? need : [need];
    if (!keys.some((k) => hasPermission(scope, k))) {
      return { error: "Sua conta não tem acesso a esta área.", status: 403 };
    }
  }
  return scope;
}
