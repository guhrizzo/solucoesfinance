// Banco Inter: alvo do adm supremo (conectar o banco de um cliente pelo e-mail)
// e trilha de auditoria. Puro e injetável, exceto writeAuditoria (recebe o db).
import type { Firestore } from "firebase-admin/firestore";

/** Trim, minúsculas, ≤254 e formato básico. Inválido → null. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (!e || e.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

export function assertAdmin(
  scope: { isSupremeAdmin: boolean },
): { ok: true } | { ok: false; status: 403; error: string } {
  if (scope.isSupremeAdmin === true) return { ok: true };
  return { ok: false, status: 403, error: "Acesso restrito ao administrador." };
}

export type AdminTargetDeps = {
  getUserByEmail(email: string): Promise<{
    uid: string;
    email?: string;
    displayName?: string;
    customClaims?: Record<string, unknown>;
  } | null>;
  hasAccessDoc(uid: string): Promise<boolean>;
  isPro(uid: string, email: string | null): Promise<boolean>;
};

export type AdminTarget =
  | { ok: true; ownerUid: string; email: string; nome: string; pro: boolean }
  | { ok: false; status: number; error: string };

/** Resolve o DONO da conta a partir do e-mail. Só devolve ownerUid/email/nome/pro. */
export async function resolveTarget(rawEmail: unknown, deps: AdminTargetDeps): Promise<AdminTarget> {
  const email = normalizeEmail(rawEmail);
  if (!email) return { ok: false, status: 400, error: "E-mail inválido." };

  const user = await deps.getUserByEmail(email);
  if (!user) return { ok: false, status: 404, error: "Cliente não encontrado." };

  if (user.customClaims?.portalOnly === true) {
    return {
      ok: false,
      status: 422,
      error: "Este e-mail é um login do portal de fornecedores, não o dono de uma conta.",
    };
  }
  if (await deps.hasAccessDoc(user.uid)) {
    return {
      ok: false,
      status: 422,
      error: "Este e-mail é de um membro convidado. Use o e-mail do dono da conta.",
    };
  }

  const pro = await deps.isPro(user.uid, email);
  return { ok: true, ownerUid: user.uid, email, nome: user.displayName || email, pro };
}

export type AuditoriaEntry = {
  adminUid: string;
  adminEmail: string;
  alvoOwnerUid: string;
  alvoEmail: string;
  provider: "inter";
  acao: "conectar" | "atualizar" | "testar" | "desconectar";
  ok: boolean;
  erro?: string;
};

// Remove blocos PEM completos e, se o bloco vier cortado, o marcador e tudo depois.
function sanitizeErro(erro: string): string {
  return erro
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "[pem removido]")
    .replace(/-----BEGIN[\s\S]*$/, "[pem removido]")
    .slice(0, 200);
}

/** Grava uma entrada em auditoriaIntegracoes. NUNCA lança e nunca guarda segredo. */
export async function writeAuditoria(db: Firestore, entry: AuditoriaEntry): Promise<void> {
  try {
    const { erro, ...rest } = entry;
    const doc: Record<string, unknown> = { ...rest, at: Date.now() };
    if (typeof erro === "string" && erro) doc.erro = sanitizeErro(erro);
    await db.collection("auditoriaIntegracoes").add(doc);
  } catch (e) {
    // Só um rótulo genérico + código: nada do conteúdo da entrada.
    const code = (e as { code?: unknown })?.code;
    console.error("[auditoriaIntegracoes] falha ao gravar", typeof code === "string" || typeof code === "number" ? code : "erro");
  }
}
