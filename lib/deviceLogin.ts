// lib/deviceLogin.ts
// Login do app desktop (Electron) via navegador do sistema. O Google recusa
// OAuth dentro de janela embutida ("signin/rejected"), então o app abre
// /entrar-dispositivo no navegador padrão; lá o usuário entra normalmente e a
// página troca o ID token por um código de uso único (esta lib), que o app
// resgata em /api/desktop/exchange para obter um custom token do Firebase.
//
// SOMENTE uso em rotas de servidor. A coleção `device_logins` só é tocada pelo
// Admin SDK — firestore.rules nega acesso direto do client (regra final).

import { createHash, randomBytes } from "node:crypto";
import { getAdminAuth, getAdminDb } from "./firebaseAdmin";

const COLLECTION = "device_logins";
const CODE_TTL_MS = 2 * 60 * 1000;

// Guardamos só o hash: quem lê o Firestore não consegue resgatar um código vivo.
const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

/** Gera um código de uso único (2 min) atrelado ao uid já autenticado. */
export async function createDeviceLoginCode(uid: string): Promise<string> {
  const code = randomBytes(32).toString("hex");
  const db = await getAdminDb();
  await db.collection(COLLECTION).doc(hashCode(code)).set({
    uid,
    createdAt: Date.now(),
    expiresAt: Date.now() + CODE_TTL_MS,
  });
  return code;
}

/**
 * Consome o código (apaga no ato — não dá pra resgatar duas vezes) e devolve um
 * custom token do Firebase pro mesmo uid, ou null se inválido/expirado.
 */
export async function redeemDeviceLoginCode(code: string): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(code)) return null;

  const db = await getAdminDb();
  const ref = db.collection(COLLECTION).doc(hashCode(code));

  const uid = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.delete(ref);
    const data = snap.data() as { uid?: string; expiresAt?: number };
    if (!data.uid || typeof data.expiresAt !== "number" || data.expiresAt < Date.now()) return null;
    return data.uid;
  });
  if (!uid) return null;

  return (await getAdminAuth()).createCustomToken(uid);
}
