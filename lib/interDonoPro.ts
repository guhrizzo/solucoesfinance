// lib/interDonoPro.ts
// Pro/cortesia do DONO da conta para os crons do Banco Inter (extrato e boletos).
// SOMENTE servidor. Saiu de app/api/cron/inter-sync para ser compartilhado.

import type { Firestore } from "firebase-admin/firestore";
import { getAdminAuth } from "./firebaseAdmin";
import { isCompedEmail } from "./compAccounts";
import { isProAccess, resolveSubscriptionState, type BillingDoc } from "./billing";

export async function donoTemPro(db: Firestore, ownerUid: string): Promise<boolean> {
  const b = await db.doc(`users/${ownerUid}/profile/billing`).get();
  const doc = (b.exists ? b.data() : null) as BillingDoc | null;
  if (isProAccess(resolveSubscriptionState(doc))) return true;
  const email = await getAdminAuth().then((a) => a.getUser(ownerUid)).then((u) => u.email ?? null).catch(() => null);
  return isCompedEmail(email);
}
