// lib/scopeSubscription.ts
// Estado da assinatura visto por uma rota de servidor (SOMENTE server-side).
//
// Antes cada rota lia `users/{ownerUid}/profile/billing` direto — e conta
// cortesia só era reconhecida se o doc já tivesse `comped: true`. Só que
// quem marca isso é /api/billing/status, e o client (useSubscription) pula
// essa rota pra e-mail cortesia; resultado: o adm supremo aparecia liberado
// na tela mas era barrado pelo servidor (ex.: cobrança por e-mail, leitor de
// NF). Aqui o e-mail do LOGIN (ID token) e o do DONO da conta também contam.

import { getAdminAuth } from "./firebaseAdmin";
import { isCompedEmail } from "./compAccounts";
import { resolveSubscriptionState, type BillingDoc, type SubscriptionState } from "./billing";
import type { ApiScope } from "./apiScope";

export async function resolveScopeSubscription(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  scope: ApiScope
): Promise<SubscriptionState> {
  // Adm supremo / cortesia logado: sem nenhuma limitação, em qualquer conta.
  if (scope.isSupremeAdmin || isCompedEmail(scope.email)) {
    return resolveSubscriptionState({ comped: true });
  }

  const ref = db.doc(`users/${scope.ownerUid}/profile/billing`);
  const snap = await ref.get();
  const doc = (snap.exists ? snap.data() : null) as BillingDoc | null;
  if (doc?.comped) return resolveSubscriptionState(doc);

  // Membro de uma conta cujo DONO é cortesia (o doc pode não estar marcado ainda).
  if (!scope.isOwner) {
    const ownerEmail = await getAdminAuth()
      .then((a) => a.getUser(scope.ownerUid))
      .then((u) => u.email ?? null)
      .catch(() => null);
    if (isCompedEmail(ownerEmail)) {
      await ref.set({ comped: true, updatedAt: Date.now() }, { merge: true }).catch(() => {});
      return resolveSubscriptionState({ comped: true });
    }
  }

  return resolveSubscriptionState(doc);
}
