// scripts/grant-temp-access.mjs
// Uso único: concede N dias de acesso a uma conta pelo e-mail, estendendo
// trialEndsAt (se a conta ainda não pagou) ou currentPeriodEnd (se já é
// assinante) em users/{uid}/profile/billing. Não mexe em contas "comped".
//
// node scripts/grant-temp-access.mjs <email> <dias>

import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let [, key, val] = m;
  val = val.trim().replace(/^"(.*)"$/, "$1");
  if (!(key in process.env)) process.env[key] = val;
}

import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const [, , email, daysArg] = process.argv;
const days = Number(daysArg || 7);

if (!email) {
  console.error("Uso: node scripts/grant-temp-access.mjs <email> [dias=7]");
  process.exit(1);
}

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("Faltam FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY em .env.local");
  process.exit(1);
}

initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

const auth = getAuth();
const db = getFirestore();

const user = await auth.getUserByEmail(email).catch((err) => {
  if (err?.code === "auth/user-not-found") return null;
  throw err;
});

if (!user) {
  console.error(`Nenhuma conta encontrada para ${email}. A pessoa precisa se cadastrar primeiro.`);
  process.exit(1);
}

const ref = db.doc(`users/${user.uid}/profile/billing`);
const snap = await ref.get();
const now = Date.now();
const grantUntil = now + days * 24 * 60 * 60 * 1000;

if (!snap.exists) {
  await ref.set({
    trialEndsAt: grantUntil,
    currentPeriodEnd: null,
    plan: null,
    lastTransactionNsu: null,
    lastOrderNsu: null,
    lastPaidAt: null,
    createdAt: now,
    updatedAt: now,
  });
  console.log(`Conta ${email} (uid ${user.uid}) não tinha billing doc. Criado com trial até ${new Date(grantUntil).toISOString()}.`);
  process.exit(0);
}

const doc = snap.data();

if (doc.comped) {
  console.log(`Conta ${email} já é cortesia (acesso vitalício). Nada a fazer.`);
  process.exit(0);
}

const currentAccessUntil = Math.max(Number(doc.trialEndsAt) || 0, Number(doc.currentPeriodEnd) || 0);
const newUntil = Math.max(currentAccessUntil, grantUntil);

// Se já é assinante (tem currentPeriodEnd), estende ali; senão estende o trial.
const field = doc.currentPeriodEnd ? "currentPeriodEnd" : "trialEndsAt";

await ref.update({ [field]: newUntil, updatedAt: now });

console.log(`Conta ${email} (uid ${user.uid}) liberada até ${new Date(newUntil).toISOString()} (campo: ${field}).`);
