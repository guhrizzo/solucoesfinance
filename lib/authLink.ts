// lib/authLink.ts
// Evita duplicar usuário quando o mesmo e-mail é usado por dois métodos
// de login (senha e Google). Com a opção "One account per email address"
// ativa no Console do Firebase (padrão dos projetos), o Firebase recusa
// o login do Google quando já existe conta por senha com o mesmo e-mail,
// disparando o erro abaixo — em vez de deixar isso travar o usuário,
// aqui capturamos a credencial pendente do Google para vinculá-la à
// MESMA conta (mesmo uid) assim que a senha for confirmada.

import type { AuthCredential, User } from "firebase/auth";

export type PendingGoogleLink = {
  email: string;
  credential: AuthCredential;
};

/**
 * Se o erro for "account-exists-with-different-credential", extrai o
 * e-mail e a credencial do Google que ficou pendente de vínculo.
 * Retorna null para qualquer outro erro.
 */
export async function extractPendingGoogleLink(err: any): Promise<PendingGoogleLink | null> {
  if (err?.code !== "auth/account-exists-with-different-credential") return null;

  const email: string | undefined = err?.customData?.email;
  const { GoogleAuthProvider } = await import("firebase/auth");
  const credential = GoogleAuthProvider.credentialFromError(err);
  if (!email || !credential) return null;

  return { email, credential };
}

/** Vincula a credencial pendente do Google ao usuário já autenticado por senha. */
export async function completeGoogleLink(user: User, credential: AuthCredential) {
  const { linkWithCredential } = await import("firebase/auth");
  return linkWithCredential(user, credential);
}

// ── Vínculo a partir de uma sessão já autenticada ────────────────────────────
// Usado na tela de segurança da conta: o usuário já está logado (por senha
// OU por Google) e quer habilitar o outro método. Sempre opera sobre
// `auth.currentUser`, então nunca cria um segundo usuário — só adiciona
// mais uma forma de entrar na mesma conta (mesmo uid).

/** Adiciona o Google como método de login à conta já autenticada. */
export async function linkGoogleToCurrentUser(user: User) {
  const [{ getFirebase }, { linkWithPopup }] = await Promise.all([
    import("@/lib/firebase"),
    import("firebase/auth"),
  ]);
  const { googleProvider } = await getFirebase();
  return linkWithPopup(user, googleProvider);
}

/** Adiciona login por e-mail/senha à conta já autenticada (ex.: quem entrou só via Google). */
export async function linkPasswordToCurrentUser(user: User, email: string, password: string) {
  const { EmailAuthProvider, linkWithCredential } = await import("firebase/auth");
  const credential = EmailAuthProvider.credential(email, password);
  return linkWithCredential(user, credential);
}

/** Remove um método de login da conta (bloqueie na UI se for o único restante). */
export async function unlinkProvider(user: User, providerId: string) {
  const { unlink } = await import("firebase/auth");
  return unlink(user, providerId);
}
