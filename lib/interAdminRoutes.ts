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

import { assertAdmin, type AdminTarget, type AdminTargetDeps, type AuditoriaEntry } from "./interAdminTarget";
import type { AtivarResultado } from "./interBoletoWebhook";
import { SERVER_CONFIG_ERROR } from "./interErrors";
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
  emailVerified?: boolean;
  displayName?: string;
  customClaims?: Record<string, unknown>;
};

export type AdminDepsIO = {
  /** getAuth().getUserByEmail: LANÇA auth/user-not-found quando não existe. */
  getUserByEmail(email: string): Promise<AdminUserRecordLike>;
  /** true se o documento existir (ex.: users/{uid}/profile/access). */
  docExists(path: string): Promise<boolean>;
  /** Pro/cortesia do DONO (mesma regra das rotas /api/inter/*). */
  isPro(uid: string, email: string | null, emailVerified?: boolean): Promise<boolean>;
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
      return { uid: u.uid, email: u.email, emailVerified: u.emailVerified, displayName: u.displayName, customClaims: u.customClaims };
    },
    hasAccessDoc: (uid) => io.docExists(`users/${uid}/profile/access`),
    isPro: (uid, email, emailVerified) => io.isPro(uid, email, emailVerified),
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
  if (typeof d.cobrancaAtiva === "boolean") out.cobrancaAtiva = d.cobrancaAtiva;
  const esc = d.cobrancaEscopos as Record<string, unknown> | null | undefined;
  if (esc && typeof esc === "object") out.cobrancaEscopos = { write: esc.write === true, read: esc.read === true };
  return out;
}

// ---------- POST /api/admin/inter/boletos (ativar boletos de um cliente) ----------

export type AtivarBoletosDeps = {
  /** resolveTarget com o I/O real (re-resolve o e-mail; única origem do ownerUid). */
  resolveTarget(rawEmail: unknown): Promise<AdminTarget>;
  keyConfigured(): boolean;
  /** lib/interBoletoWebhook.ts ativarBoletos (grava a própria auditoria). */
  ativar(ownerUid: string, adminUid: string, ctx: { adminEmail: string | null; alvoEmail: string }): Promise<AtivarResultado>;
  /** Auditoria das recusas antes do núcleo (sem Pro, sem chave). */
  auditar(alvo: { ownerUid: string; email: string }, result: AdminActionResult): Promise<void>;
};

/**
 * Núcleo puro da rota: adm supremo → corpo → alvo (dono, nunca membro) → Pro →
 * INTER_ENC_KEY → ativar. A resposta é montada por lista branca: só ok, escopos
 * e webhook (nunca token, hash, segredo ou corpo do Inter).
 */
export async function rotaAtivarBoletos(
  scope: { uid: string; email: string | null; isSupremeAdmin: boolean },
  body: unknown,
  deps: AtivarBoletosDeps,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const adm = assertAdmin(scope);
  if (!adm.ok) return { status: adm.status, body: { error: adm.error } };

  const parts = splitAdminBody(body);
  if (!parts) return { status: 400, body: { error: INVALID_BODY_ERROR } };

  const alvo = await deps.resolveTarget(parts.clienteEmail);
  if (!alvo.ok) return { status: alvo.status, body: { error: alvo.error } };

  if (!alvo.pro) {
    const r: AdminActionResult = { ok: false, status: 403, error: PRO_REQUIRED_ERROR };
    await deps.auditar(alvo, r);
    return { status: 403, body: { error: PRO_REQUIRED_ERROR } };
  }
  if (!deps.keyConfigured()) {
    const r: AdminActionResult = { ok: false, status: 500, error: SERVER_CONFIG_ERROR };
    await deps.auditar(alvo, r);
    return { status: 500, body: { error: SERVER_CONFIG_ERROR } };
  }

  const r = await deps.ativar(alvo.ownerUid, scope.uid, { adminEmail: scope.email, alvoEmail: alvo.email });
  if (!r.ok) return { status: r.status, body: { error: r.error } };
  return {
    status: 200,
    body: { ok: true, escopos: { write: r.escopos.write === true, read: r.escopos.read === true }, webhook: r.webhook === true },
  };
}
