import assert from "node:assert/strict";
import test from "node:test";
import { isCompedEmail, isSupremeAdminEmail, requiresSupremeAdminEmailVerification } from "../../lib/compAccounts.ts";
import { subscriptionGateView } from "../../lib/billing.ts";

test("os novos administradores recebem privilégio e cortesia só após verificar o endereço", () => {
  for (const email of ["gustavorizzo@nexusfi.com.br", "felipe.paiva@nexusfi.com.br"]) {
    assert.equal(requiresSupremeAdminEmailVerification(email), true);
    assert.equal(isSupremeAdminEmail(email), false);
    assert.equal(isSupremeAdminEmail(email, false), false);
    assert.equal(isCompedEmail(email, false), false);
    assert.equal(isSupremeAdminEmail(` ${email.toUpperCase()} `, true), true);
    assert.equal(isCompedEmail(email, true), true);
  }
});

test("mantém o acesso anterior e distingue cortesia de administração", () => {
  for (const email of ["gurizzo943@gmail.com", "felipeaugjpaiva@gmail.com"]) {
    assert.equal(requiresSupremeAdminEmailVerification(email), false);
    assert.equal(isSupremeAdminEmail(email), true);
    assert.equal(isCompedEmail(email), true);
  }
  assert.equal(isCompedEmail("atelieda.ni25@gmail.com"), true);
  assert.equal(isSupremeAdminEmail("atelieda.ni25@gmail.com", true), false);
  assert.equal(isSupremeAdminEmail("outra.pessoa@nexusfi.com.br", true), false);
});

test("o fluxo interno espera a assinatura e distingue confirmação de e-mail de cobrança", () => {
  const state = { loading: false, signedOut: false, isActive: false, verificationRequired: false };
  assert.equal(subscriptionGateView(true, { ...state, loading: true, isActive: true }), "loading");
  assert.equal(subscriptionGateView(true, { ...state, signedOut: true }), "content");
  assert.equal(subscriptionGateView(true, { ...state, verificationRequired: true }), "verify");
  assert.equal(subscriptionGateView(true, state), "paywall");
  assert.equal(subscriptionGateView(true, { ...state, isActive: true }), "content");
  assert.equal(subscriptionGateView(false, { ...state, verificationRequired: true }), "content");
});
