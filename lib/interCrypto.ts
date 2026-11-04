// lib/interCrypto.ts
// Criptografia em repouso dos segredos da integração Banco Inter (client id/secret,
// certificado mTLS e chave privada). SOMENTE servidor. Reaproveita o AES-256-GCM
// de lib/rh/crypto.ts, mas com a chave própria INTER_ENC_KEY (lida a cada chamada).
// `conta` não é segredo: fica em claro no documento, fora deste envelope.

import { decryptText, encryptText, loadKey } from "./rh/crypto";

export type InterSecrets = {
  clientId: string;
  clientSecret: string;
  certPem: string;
  keyPem: string;
  conta?: string;
};

export type EncryptedInterSecrets = {
  clientIdEnc: string;
  secretEnc: string;
  certEnc: string;
  keyEnc: string;
};

function interKey(): Buffer {
  const raw = process.env.INTER_ENC_KEY;
  if (!raw || !raw.trim()) throw new Error("INTER_ENC_KEY não configurada.");
  try {
    return loadKey(raw);
  } catch {
    throw new Error("INTER_ENC_KEY inválida: precisa ter 32 bytes (base64 ou 64 hex).");
  }
}

export function encryptInterSecrets(s: InterSecrets): EncryptedInterSecrets {
  const key = interKey();
  return {
    clientIdEnc: encryptText(s.clientId, key),
    secretEnc: encryptText(s.clientSecret, key),
    certEnc: encryptText(s.certPem, key),
    keyEnc: encryptText(s.keyPem, key),
  };
}

export function decryptInterSecrets(e: EncryptedInterSecrets): InterSecrets {
  const key = interKey();
  return {
    clientId: decryptText(e.clientIdEnc, key),
    clientSecret: decryptText(e.secretEnc, key),
    certPem: decryptText(e.certEnc, key),
    keyPem: decryptText(e.keyEnc, key),
  };
}
