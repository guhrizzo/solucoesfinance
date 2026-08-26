// lib/teamAuth.ts
// Autorização server-side compartilhada pelas rotas app/api/team/** —
// SOMENTE uso em rotas de servidor. Nunca confia em nada que o cliente
// declare sobre si mesmo (nem um uid enviado no corpo, nem um "sou admin"):
// verifica o ID token do Firebase de verdade e confere, via Admin SDK
// (que ignora regras de segurança do Firestore — é servidor), se o uid do
// token tem ou não um doc em users/{uid}/profile/access. Só quem NÃO tem
// esse doc é dono de conta — é essa checagem, feita aqui, que impede um
// membro convidado de criar/editar/remover outros membros mesmo chamando
// a API diretamente (fora da UI).

import { NextRequest } from "next/server";
import { getAdminAuth, getAdminDb } from "./firebaseAdmin";

export interface OwnerContext {
  ownerUid: string;
  ownerEmail: string | null;
  ownerName: string | null;
}

export type RequireOwnerResult = OwnerContext | { error: string; status: number };

export async function requireOwner(req: NextRequest): Promise<RequireOwnerResult> {
  const authHeader = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) return { error: "Não autenticado.", status: 401 };

  const adminAuth = await getAdminAuth();
  let decoded: import("firebase-admin/auth").DecodedIdToken;
  try {
    decoded = await adminAuth.verifyIdToken(match[1]);
  } catch {
    return { error: "Sessão inválida ou expirada. Entre novamente.", status: 401 };
  }

  const db = await getAdminDb();
  const accessSnap = await db.doc(`users/${decoded.uid}/profile/access`).get();
  if (accessSnap.exists) {
    // Existe doc de acesso → esse uid é um membro convidado (donos nunca
    // têm esse doc). Membros nunca gerenciam equipe, ponto final.
    return { error: "Sua conta não tem permissão para gerenciar a equipe.", status: 403 };
  }

  return {
    ownerUid: decoded.uid,
    ownerEmail: decoded.email ?? null,
    ownerName: (decoded.name as string | undefined) ?? null,
  };
}
