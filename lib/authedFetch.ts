// lib/authedFetch.ts
// fetch com o Bearer do ID token do Firebase. Uso client-side, nas chamadas a
// rotas /api/** que exigem autenticação (elas resolvem o ownerUid a partir do
// token via lib/apiScope.ts — não confiam em nenhum userId vindo do cliente).

export async function authedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { getFirebase } = await import("@/lib/firebase");
  const { auth } = await getFirebase();
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sessão expirada. Recarregue a página.");
  return fetch(input, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
  });
}
