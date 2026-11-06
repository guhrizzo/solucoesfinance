// Banco Inter: criptografia dos segredos (lib/interCrypto.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptInterSecrets, decryptInterSecrets } from "../../lib/interCrypto.ts";

const KEY = "a".repeat(64);
const secrets = {
  clientId: "client-id-123",
  clientSecret: "client-secret-xyz",
  certPem: "-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----",
  keyPem: "-----BEGIN PRIVATE KEY-----\nDEF\n-----END PRIVATE KEY-----",
};

test("interCrypto roundtrip", () => {
  process.env.INTER_ENC_KEY = KEY;
  const enc = encryptInterSecrets(secrets);
  assert.deepEqual(decryptInterSecrets(enc), secrets);
  for (const [campo, valor] of Object.entries(enc)) {
    assert.ok(campo.endsWith("Enc"));
    for (const original of [secrets.clientId, secrets.clientSecret, secrets.certPem, secrets.keyPem]) {
      assert.ok(!valor.includes(original));
    }
  }
});

test("sem INTER_ENC_KEY lança", () => {
  delete process.env.INTER_ENC_KEY;
  assert.throws(() => encryptInterSecrets(secrets), /INTER_ENC_KEY/);
});
