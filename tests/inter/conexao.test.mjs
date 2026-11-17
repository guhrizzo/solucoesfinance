// Banco Inter: validação do corpo das rotas de conexão (lib/interConexao.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateConexaoBody, maskConta, normalizeConta, isCertPem, isKeyPem, MAX_PEM_CHARS, MAX_ID_CHARS } from "../../lib/interConexao.ts";

const CERT = "-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----";
const KEY = "-----BEGIN PRIVATE KEY-----\nBBB\n-----END PRIVATE KEY-----";
const full = { clientId: "id-fake", clientSecret: "secret-fake", certPem: CERT, keyPem: KEY };

test("maskConta mostra só os 4 últimos dígitos", () => {
  assert.equal(maskConta("12345678"), "••••5678");
  assert.equal(maskConta("1234567-8"), "••••5678");
  assert.equal(maskConta("12"), "••••12");
  assert.equal(maskConta(""), undefined);
  assert.equal(maskConta(undefined), undefined);
  assert.equal(maskConta(null), undefined);
});

test("normalizeConta aceita pontuação e rejeita letras", () => {
  assert.equal(normalizeConta("1.234.567-8"), "12345678");
  assert.equal(normalizeConta(" "), "");
  assert.equal(normalizeConta("12a4"), null);
});

test("cabeçalhos PEM", () => {
  assert.ok(isCertPem(CERT));
  assert.ok(!isCertPem(KEY));
  assert.ok(isKeyPem(KEY));
  assert.ok(isKeyPem("-----BEGIN RSA PRIVATE KEY-----\nX\n-----END RSA PRIVATE KEY-----"));
  assert.ok(isKeyPem("-----BEGIN EC PRIVATE KEY-----\nX\n-----END EC PRIVATE KEY-----"));
  assert.ok(!isKeyPem("-----BEGIN ENCRYPTED PRIVATE KEY-----\nX\n-----END ENCRYPTED PRIVATE KEY-----"));
  assert.ok(!isKeyPem(CERT));
});

test("create: exige os quatro campos e aceita conta opcional", () => {
  const ok = validateConexaoBody({ ...full, conta: "1234-5" }, "create");
  assert.equal(ok.ok, true);
  assert.equal(ok.value.conta, "12345");
  const semConta = validateConexaoBody({ ...full, conta: "" }, "create");
  assert.equal(semConta.ok, true);
  assert.equal("conta" in semConta.value, false);
  for (const campo of Object.keys(full)) {
    const r = validateConexaoBody({ ...full, [campo]: undefined }, "create");
    assert.equal(r.ok, false, campo);
    const vazio = validateConexaoBody({ ...full, [campo]: "   " }, "create");
    assert.equal(vazio.ok, false, campo);
  }
});

test("rejeita corpo não-objeto e tipos errados", () => {
  assert.equal(validateConexaoBody(null, "create").ok, false);
  assert.equal(validateConexaoBody([], "create").ok, false);
  assert.equal(validateConexaoBody({ ...full, clientId: 123 }, "create").ok, false);
});

test("limites de tamanho", () => {
  assert.equal(validateConexaoBody({ ...full, clientId: "x".repeat(MAX_ID_CHARS + 1) }, "create").ok, false);
  const grande = CERT.replace("AAA", "A".repeat(MAX_PEM_CHARS));
  assert.equal(validateConexaoBody({ ...full, certPem: grande }, "create").ok, false);
});

test("PEM com cabeçalho errado é recusado", () => {
  assert.equal(validateConexaoBody({ ...full, certPem: KEY }, "create").ok, false);
  assert.equal(validateConexaoBody({ ...full, keyPem: CERT }, "create").ok, false);
});

test("mensagens de erro nunca ecoam o conteúdo recebido", () => {
  const segredo = "SEGREDO-NAO-PODE-VAZAR";
  const casos = [
    { ...full, certPem: segredo },
    { ...full, keyPem: segredo },
    { ...full, clientSecret: segredo.repeat(20) },
    { ...full, conta: segredo },
  ];
  for (const c of casos) {
    const r = validateConexaoBody(c, "create");
    assert.equal(r.ok, false);
    assert.ok(!r.error.includes(segredo));
  }
});

test("update: cert e chave juntos, ao menos um campo, conta vazia limpa", () => {
  assert.equal(validateConexaoBody({ certPem: CERT }, "update").ok, false);
  assert.equal(validateConexaoBody({ keyPem: KEY }, "update").ok, false);
  assert.equal(validateConexaoBody({ certPem: CERT, keyPem: KEY }, "update").ok, true);
  assert.equal(validateConexaoBody({}, "update").ok, false);
  const s = validateConexaoBody({ clientSecret: "novo" }, "update");
  assert.deepEqual(s, { ok: true, value: { clientSecret: "novo" } });
  const limpa = validateConexaoBody({ conta: "" }, "update");
  assert.deepEqual(limpa, { ok: true, value: { conta: "" } });
});
