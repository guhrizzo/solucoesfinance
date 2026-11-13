// lib/interAdminRoutes.ts
//
// Peças PURAS das rotas /api/admin/inter/* (adm supremo conecta o Banco Inter
// em nome do cliente). Nada aqui importa Next nem o Admin SDK: tudo é injetado,
// pra poder ser testado em node. A parte de servidor mora em
// app/api/admin/inter/_guard.ts.
//
// Regras que estas funções garantem:
//   • a conta-alvo (ownerUid) NUNCA vem do corpo: `splitAdminBody` descarta
//     uid/ownerUid e as rotas só usam o ownerUid devolvido por resolveTarget;
//   • "usuário não existe" no Admin SDK é uma EXCEÇÃO (auth/user-not-found) —
//     só ela vira null (→ 404); qualquer outro erro sobe (→ 500 genérico);
//   • auditoria e resposta só carregam a mensagem fixa devolvida pelo núcleo,
//     nunca segredo, PEM, campo *Enc nem texto de exceção.

import type { AdminTargetDeps, AuditoriaEntry } from "./interAdminTarget";
import type { InterStatus } from "./interTypes";

export type AdminAcao = AuditoriaEntry["acao"];

/** Resultado no formato do núcleo (lib/interConexaoServer.ts InterAccountResult). */
export type AdminActionResult =
  | { ok: true; certExpiresAt?: number; contaMasked?: string }
  | { ok: false; status: number; error: string };

export const PRO_REQUIRED_ERROR =
  "Este cliente não tem o plano Pro (nem conta cortesia). A integração com o Banco Inter é exclusiva do Pro.";
export const INVALID_BODY_ERROR = "Dados inválidos.";

// ---------- deps reais de resolveTarget (com I/O injetado) ----------

/** Forma mínima do UserRecord do Admin SDK que usamos. */
export type AdminUserRecordLike = {
  uid: string;
  email?: string;
  displayName?: string;
  customClaims?: Record<string, unknown>;
};

export type AdminDepsIO = {
  /** getAuth().getUserByEmail: LANÇA auth/user-not-found quando não existe. */
  getUserByEmail(email: string): Promise<AdminUserRecordLike>;
  /** true se o documento existir (ex.: users/{uid}/profile/access). */
  docExists(path: string): Promise<boolean>;
  /** Pro/cortesia do DONO (mesma regra das rotas /api/inter/*). */
  isPro(uid: string, email: string | null): Promise<boolean>;
};

/** Só o código exato de "usuário não existe" do Firebase Auth. */
export function isUserNotFoundError(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === "auth/user-not-found";
}

/** Adapta o I/O real para AdminTargetDeps (lib/interAdminTarget.ts). */
export function buildAdminDeps(io: AdminDepsIO): AdminTargetDeps {
  return {
    async getUserByEmail(email) {
      let u: AdminUserRecordLike;
      try {
        u = await io.getUserByEmail(email);
      } catch (e) {
        if (isUserNotFoundError(e)) return null;
        throw e; // outros erros: a rota responde 500 com mensagem fixa
      }
      if (!u || typeof u.uid !== "string" || !u.uid) return null;
      return { uid: u.uid, email: u.email, displayName: u.displayName, customClaims: u.customClaims };
    },
    hasAccessDoc: (uid) => io.docExists(`users/${uid}/profile/access`),
    isPro: (uid, email) => io.isPro(uid, email),
  };
}

// ---------- corpo ----------

/**
 * Separa `clienteEmail` dos campos da conexão. Descarta qualquer `uid`/`ownerUid`
 * do corpo (a conta-alvo só sai de resolveTarget). Corpo que não é objeto → null.
 */
export function splitAdminBody(
  body: unknown,
): { clienteEmail: unknown; campos: Record<string, unknown> } | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { clienteEmail, uid, ownerUid, ...campos } = body as Record<string, unknown>;
  return { clienteEmail, campos };
}

// ---------- auditoria ----------

/**
 * Monta a entrada de auditoria. `erro` é só a mensagem (fixa) do resultado;
 * nada do corpo enviado entra aqui.
 */
export function buildAuditEntry(
  admin: { uid: string; email: string | null },
  alvo: { ownerUid: string; email: string },
  acao: AdminAcao,
  result: AdminActionResult,
): AuditoriaEntry {
  const entry: AuditoriaEntry = {
    adminUid: admin.uid,
    adminEmail: admin.email ?? "",
    alvoOwnerUid: alvo.ownerUid,
    alvoEmail: alvo.email,
    provider: "inter",
    acao,
    ok: result.ok,
  };
  if (!result.ok && typeof result.error === "string" && result.error) entry.erro = result.error;
  return entry;
}

// ---------- respostas ----------

/** Resultado → corpo/status HTTP. Só campos permitidos (nunca segredo nem uid). */
export function adminResponse(
  acao: AdminAcao,
  result: AdminActionResult,
): { status: number; body: Record<string, unknown> } {
  if (!result.ok) return { status: result.status, body: { error: result.error } };
  if (acao === "conectar" || acao === "atualizar") {
    return {
      status: 200,
      body: { ok: true, certExpiresAt: result.certExpiresAt, contaMasked: result.contaMasked ?? null },
    };
  }
  return { status: 200, body: { ok: true } };
}

/** Lista branca do status público (users/{uid}/profile/interStatus). */
export function pickInterStatus(data: unknown): InterStatus | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const out: InterStatus = { connected: d.connected === true };
  if (typeof d.contaMasked === "string") out.contaMasked = d.contaMasked;
  if (typeof d.lastSyncAt === "number") out.lastSyncAt = d.lastSyncAt;
  if (typeof d.lastSyncError === "string" || d.lastSyncError === null) out.lastSyncError = d.lastSyncError as string | null;
  if (typeof d.certExpiresAt === "number") out.certExpiresAt = d.certExpiresAt;
  if (d.configuradoPelaEquipe === true) out.configuradoPelaEquipe = true;
  return out;
}
