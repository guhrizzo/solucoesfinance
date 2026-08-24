// lib/firebaseAdmin.ts
// Firebase Admin SDK — SOMENTE para uso em rotas de servidor (app/api/**).
// Nunca importe este arquivo de um componente "use client".
//
// Lazy singleton no mesmo espírito de lib/firebase.ts: nada é lido/inicializado
// no topo do módulo, então a ausência das env vars não quebra o build — o erro
// só aparece (claro, no log do servidor) quando a rota que precisa dele é chamada.

let _cache: { app: import("firebase-admin/app").App } | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name} (configure em .env.local / nas envs do deploy)`);
  }
  return value;
}

export async function getFirebaseAdmin() {
  if (_cache) return _cache;

  const { initializeApp, getApps, getApp, cert } = await import("firebase-admin/app");

  const projectId = requireEnv("FIREBASE_ADMIN_PROJECT_ID");
  const clientEmail = requireEnv("FIREBASE_ADMIN_CLIENT_EMAIL");
  // No painel do provedor de hosting a quebra de linha da chave privada costuma
  // vir escapada como "\n" — precisa virar quebra de linha real.
  const privateKey = requireEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");

  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

  _cache = { app };
  return _cache;
}

export async function getAdminAuth() {
  const { app } = await getFirebaseAdmin();
  const { getAuth } = await import("firebase-admin/auth");
  return getAuth(app);
}
