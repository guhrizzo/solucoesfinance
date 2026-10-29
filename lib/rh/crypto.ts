// lib/rh/crypto.ts
// Criptografia em repouso dos dados sensíveis do RH (CPF, dados bancários).
// SOMENTE servidor. AES-256-GCM com a chave de RH_ENC_KEY (32 bytes em base64
// ou 64 caracteres hex). Formato gravado: "v1:<iv>:<tag>:<cifrado>" (base64).
// Sem a chave configurada o RH não grava nem lê dado sensível — falha alto.

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const VERSION = "v1";

export function loadKey(raw: string | undefined = process.env.RH_ENC_KEY): Buffer {
  const v = (raw ?? "").trim();
  if (!v) throw new Error("RH_ENC_KEY não configurada.");
  const key = /^[0-9a-fA-F]{64}$/.test(v) ? Buffer.from(v, "hex") : Buffer.from(v, "base64");
  if (key.length !== 32) throw new Error("RH_ENC_KEY inválida: precisa ter 32 bytes (base64 ou 64 hex).");
  return key;
}

export function encryptText(plain: string, key: Buffer = loadKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export function decryptText(payload: string, key: Buffer = loadKey()): string {
  const [v, iv, tag, enc] = String(payload).split(":");
  if (v !== VERSION || !iv || !tag || !enc) throw new Error("Dado criptografado em formato desconhecido.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(enc, "base64")), decipher.final()]).toString("utf8");
}

export function encryptJson(obj: unknown, key?: Buffer): string {
  return encryptText(JSON.stringify(obj), key);
}

export function decryptJson<T>(payload: string, key?: Buffer): T {
  return JSON.parse(decryptText(payload, key)) as T;
}

// ── CPF ────────────────────────────────────────────────────────────────────

export function onlyDigits(s: string): string {
  return String(s ?? "").replace(/\D/g, "");
}

export function isValidCpf(raw: string): boolean {
  const c = onlyDigits(raw);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

/** "•••.•••.•••-12": só os 2 últimos dígitos aparecem fora da visualização com log. */
export function maskCpf(raw: string): string {
  const c = onlyDigits(raw);
  return c.length === 11 ? `•••.•••.•••-${c.slice(9)}` : "•••.•••.•••-••";
}

/** Hash determinístico (HMAC) do CPF — só pra detectar duplicidade sem decifrar. */
export function hashCpf(raw: string, key: Buffer = loadKey()): string {
  return createHmac("sha256", key).update(onlyDigits(raw)).digest("hex");
}
