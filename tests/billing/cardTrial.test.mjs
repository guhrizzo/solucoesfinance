// Teste grátis com cartão (CTA do Midas): estado de acesso, elegibilidade,
// opt-in no cadastro e ativação idempotente/antiabuso. Sem rede: sem
// ASAAS_API_KEY as chamadas ao Asaas (cancelar/atualizar) falham e são
// engolidas pelo código, como em produção quando a API está fora.
import test from "node:test";
import assert from "node:assert/strict";
import { createFakeFirestore } from "../support/fakeFirestore.mjs";
import {
  cardTrialEndFrom,
  isCardTrialEligible,
  resolveSubscriptionState,
} from "@/lib/billing.ts";
import { activateCardTrial, requireCardTrial } from "@/lib/billingCardTrial.ts";
import { canonicalContractPayload } from "@/lib/contract.ts";
import { renderContractText } from "@/lib/contractText.ts";

process.env.ASAAS_API_KEY = "";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 9, 15, 0, 0); // 09/11/2026 12:00 em Brasília
const OWNER = "uidDono";
const CNPJ = "11222333000181";

test("cardTrialEndFrom: fim do dia (Brasília) da 1ª cobrança, com teto", () => {
  const end = cardTrialEndFrom("2026-11-16", NOW);
  assert.equal(new Date(end).toISOString(), "2026-11-17T02:59:59.999Z");
  // Data muito à frente (ciclo já avançou) → limitado a 8 dias da validação.
  assert.equal(cardTrialEndFrom("2026-12-16", NOW), NOW + 8 * DAY);
  // Data inválida/passada → 7 dias padrão.
  assert.equal(cardTrialEndFrom("lixo", NOW), NOW + 7 * DAY);
  assert.equal(cardTrialEndFrom("2026-11-01", NOW), NOW + 7 * DAY);
});

test("conta 'card_required' fica bloqueada e elegível", () => {
  const doc = { trialEndsAt: NOW, currentPeriodEnd: null, trialKind: "card_required" };
  const s = resolveSubscriptionState(doc, NOW + 1000);
  assert.equal(s.isActive, false);
  assert.equal(s.cardTrialEligible, true);
  assert.equal(isCardTrialEligible({ ...doc, lastPaidAt: NOW }), false);
  assert.equal(isCardTrialEligible({ ...doc, cardTrial: { activatedAt: NOW } }), false);
  assert.equal(isCardTrialEligible({ ...doc, comped: true }), false);
  assert.equal(isCardTrialEligible({ trialEndsAt: NOW }), false); // teste padrão
});

test("teste com cartão ativo ganha carência no dia da 1ª cobrança; cancelado não", () => {
  const trialEndsAt = NOW + 7 * DAY;
  const doc = { trialEndsAt, currentPeriodEnd: null, trialKind: "card", subscriptionStatus: "authorized" };
  const during = resolveSubscriptionState(doc, NOW + DAY);
  assert.equal(during.status, "trialing");
  assert.equal(during.autoRenews, true);
  // 1 dia depois do fim do teste, cobrança ainda não compensou → segue liberado.
  assert.equal(resolveSubscriptionState(doc, trialEndsAt + DAY).isActive, true);
  assert.equal(resolveSubscriptionState(doc, trialEndsAt + 4 * DAY).isActive, false);
  const cancelled = { ...doc, subscriptionStatus: "cancelled" };
  assert.equal(resolveSubscriptionState(cancelled, trialEndsAt + 1).isActive, false);
  // Teste padrão (sem cartão) continua sem carência.
  assert.equal(resolveSubscriptionState({ trialEndsAt }, trialEndsAt + 1).isActive, false);
});

test("requireCardTrial: só conta nova e sem assinatura", async () => {
  const db = createFakeFirestore();
  assert.deepEqual(await requireCardTrial(db, OWNER, NOW - 40 * 60 * 1000, NOW), { ok: false, reason: "conta não é nova" });
  const r = await requireCardTrial(db, OWNER, NOW - 60 * 1000, NOW);
  assert.equal(r.ok, true);
  const doc = db.store.get(`users/${OWNER}/profile/billing`);
  assert.equal(doc.trialKind, "card_required");
  assert.equal(doc.trialEndsAt, NOW);
  // Idempotente.
  assert.deepEqual(await requireCardTrial(db, OWNER, NOW - 60 * 1000, NOW + 1), { ok: true, already: true });

  const db2 = createFakeFirestore();
  db2.store.set("users/x/profile/billing", { trialEndsAt: NOW + DAY, currentPeriodEnd: NOW + 30 * DAY, lastPaidAt: NOW });
  assert.equal((await requireCardTrial(db2, "x", NOW - 1000, NOW)).ok, false);
});

function seed(db, { owner = OWNER, checkoutId = "chk_1", cnpj = CNPJ } = {}) {
  db.store.set(`users/${owner}/profile/billing`, {
    trialEndsAt: NOW,
    currentPeriodEnd: null,
    plan: null,
    lastPaidAt: null,
    trialKind: "card_required",
    gateway: "asaas",
    subscriptionId: null,
    subscriptionStatus: "pending",
    cardTrial: { checkoutId, customerId: "cus_1", orderNsu: `${owner}__basico-mensal__ct1__x`, planId: "basico-mensal", contractId: "ct1", cnpj, firstDueDate: "2026-11-16", createdAt: NOW, activatedAt: null },
  });
  db.store.set(`asaasCheckouts/${checkoutId}`, {
    ownerUid: owner, customerId: "cus_1", orderNsu: `${owner}__basico-mensal__ct1__x`, planId: "basico-mensal",
    contractId: "ct1", cnpj, firstDueDate: "2026-11-16", kind: "card_trial", status: "pending", createdAt: NOW, updatedAt: NOW,
  });
}

const sub = (over = {}) => ({
  id: "sub_1", status: "ACTIVE", externalReference: "", billingType: "CREDIT_CARD", cycle: "MONTHLY",
  value: 49.9, nextDueDate: "2026-11-16", deleted: false, customer: "cus_1", checkoutSession: "chk_1", raw: {}, ...over,
});

test("activateCardTrial: libera uma vez, grava claim do CNPJ e é idempotente", async () => {
  const db = createFakeFirestore();
  seed(db);
  const r = await activateCardTrial(db, sub(), NOW);
  assert.equal(r.handled && r.activated, true);
  const doc = db.store.get(`users/${OWNER}/profile/billing`);
  assert.equal(doc.trialKind, "card");
  assert.equal(doc.subscriptionStatus, "authorized");
  assert.equal(doc.subscriptionId, "sub_1");
  assert.equal(doc.trialEndsAt, cardTrialEndFrom("2026-11-16", NOW));
  assert.equal(db.store.get(`trialClaims/${CNPJ}`).ownerUid, OWNER);
  assert.equal(resolveSubscriptionState(doc, NOW + DAY).isActive, true);

  const again = await activateCardTrial(db, sub(), NOW + 5000);
  assert.equal(again.handled && again.activated && again.alreadyActive, true);
  assert.equal(db.store.get(`users/${OWNER}/profile/billing`).trialEndsAt, doc.trialEndsAt);
});

test("activateCardTrial: CNPJ que já usou o teste em outra conta é recusado", async () => {
  const db = createFakeFirestore();
  seed(db, { owner: "outraConta" });
  db.store.set(`trialClaims/${CNPJ}`, { ownerUid: OWNER, claimedAt: NOW - DAY });
  const r = await activateCardTrial(db, sub(), NOW);
  assert.equal(r.handled && r.activated, false);
  assert.match(r.reason, /CNPJ/);
  const doc = db.store.get("users/outraConta/profile/billing");
  assert.equal(doc.trialKind, "card_required");
  assert.notEqual(doc.subscriptionStatus, "authorized");
});

test("activateCardTrial: ignora assinatura que não veio de checkout nosso e recusa boleto", async () => {
  const db = createFakeFirestore();
  seed(db);
  assert.equal((await activateCardTrial(db, sub({ checkoutSession: null }), NOW)).handled, false);
  assert.equal((await activateCardTrial(db, sub({ checkoutSession: "chk_desconhecido" }), NOW)).handled, false);
  const r = await activateCardTrial(db, sub({ billingType: "BOLETO" }), NOW);
  assert.equal(r.handled && r.activated, false);
  // Checkout substituído por outro mais novo → recusa.
  const db2 = createFakeFirestore();
  seed(db2);
  db2.store.get(`users/${OWNER}/profile/billing`).cardTrial.checkoutId = "chk_2";
  const r2 = await activateCardTrial(db2, sub(), NOW);
  assert.equal(r2.handled && r2.activated, false);
});

test("contrato: hash sem teste não muda; com teste inclui trialDays e a cláusula", () => {
  const base = {
    contractVersion: 3, planId: "basico-mensal", priceCents: 4990, acceptedAt: NOW,
    contratante: { razaoSocial: "X", cnpj: "11.222.333/0001-81", regimeTributario: "mei", endereco: "Rua" },
    signatario: { nome: "Fulano", cpf: "000.000.000-00", email: "a@b.co" },
  };
  assert.ok(!canonicalContractPayload(base).includes("trialDays"));
  assert.ok(!canonicalContractPayload({ ...base, trialDays: null }).includes("trialDays"));
  assert.ok(canonicalContractPayload({ ...base, trialDays: 7 }).includes('"trialDays":7'));

  const parties = { contratante: base.contratante, signatario: base.signatario, planId: "basico-mensal", planLabel: "Básico mensal", priceCents: 4990 };
  const semTeste = JSON.stringify(renderContractText(parties));
  const comTeste = JSON.stringify(renderContractText({ ...parties, trialDays: 7 }));
  assert.ok(!semTeste.includes("teste gratuito"));
  assert.ok(comTeste.includes("2.4.") && comTeste.includes("teste gratuito") && comTeste.includes("cartão"));
});
