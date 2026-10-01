// lib/pixLink.ts
// Link público "Copiar chave Pix" do e-mail de cobrança (SOMENTE server-side).
//
// E-mail não roda JavaScript, então o botão do e-mail não copia nada sozinho:
// ele abre /pix/{token}, uma página pública que mostra a chave e o copia e
// cola com botões de copiar. O token é aleatório (128 bits) e aponta pra um
// snapshot em `pixLinks/{token}` — coleção raiz só acessível pelo Admin SDK
// (firestore.rules nega por fallback). A URL não carrega dado nenhum do cliente.
//
// Um token por cobrança (gravado em `pixLinkToken` no documento): reenvios
// atualizam o mesmo snapshot (valor com multa/juros pode mudar), e o link
// antigo continua valendo.

import { randomBytes } from "node:crypto";
import { SITE_URL } from "@/lib/seo";

export const PIX_LINK_TTL_MS = 120 * 24 * 60 * 60 * 1000; // 120 dias

export interface PixLinkDoc {
  ownerUid: string;
  receivableId: string;
  beneficiary: string;
  keyLabel: string;
  /** Chave pra exibir (com máscara). */
  keyDisplay: string;
  /** Chave pra copiar (normalizada: só dígitos, +55…, minúsculas). */
  keyCopy: string;
  copiaECola: string;
  amount: string;
  dueDate: string;
  updatedAt: number;
  expiresAt: number;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{20,40}$/;
export const isPixLinkToken = (t: string) => TOKEN_RE.test(t);

/** Cria (ou atualiza) o snapshot do link e devolve o token. */
export async function upsertPixLink(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  existingToken: string | undefined,
  data: Omit<PixLinkDoc, "updatedAt" | "expiresAt">,
): Promise<string> {
  const token = existingToken && isPixLinkToken(existingToken) ? existingToken : randomBytes(16).toString("base64url");
  const now = Date.now();
  await db.doc(`pixLinks/${token}`).set({ ...data, updatedAt: now, expiresAt: now + PIX_LINK_TTL_MS });
  return token;
}

/** URL absoluta da página pública do link. */
export const pixLinkUrl = (token: string) => `${SITE_URL}/pix/${token}`;

/** Ícone do Pix (PNG branco — Gmail não mostra SVG) pro botão do e-mail. */
export const pixIconUrl = () => `${SITE_URL}/email/pix-white.png`;
