// lib/compras/token.ts
// Tokens do convite do portal do fornecedor (SOMENTE server-side).
// O token em claro só existe no link enviado; o Firestore guarda o SHA-256
// (supplierInvites/{hash}) — quem lê o banco não consegue usar o convite.

import { createHash, randomBytes } from "node:crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** 32 bytes aleatórios (256 bits) em base64url — vai no link do convite. */
export function generateInviteToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

/** Formato aceito no link (barra lixo antes de tocar no banco). */
export const isTokenShape = (t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9_-]{40,64}$/.test(t);

/**
 * ID determinístico pra criação idempotente (mesmo autor + mesma chave de
 * requisição = mesmo documento): clique duplo / reenvio da rede não duplica.
 */
export function deterministicId(prefix: string, ...parts: string[]): string {
  return `${prefix}${createHash("sha256").update(parts.join("|"), "utf8").digest("hex").slice(0, 24)}`;
}

/** Chave de idempotência vinda do client (uuid ou similar). */
export const isRequestKey = (k: unknown): k is string => typeof k === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(k);
