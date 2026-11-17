// Banco Inter: alvo do adm, auditoria (lib/interAdminTarget.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, assertAdmin, resolveTarget, writeAuditoria } from "../../lib/interAdminTarget";

test("normalizeEmail aceita ' Foo@Bar.com ' e devolve 'foo@bar.com'", () => {
  assert.equal(normalizeEmail(" Foo@Bar.com "), "foo@bar.com");
});

test("normalizeEmail rejeita vazio, 'x', 300 chars e não-string", () => {
  assert.equal(normalizeEmail(""), null);
  assert.equal(normalizeEmail("x"), null);
  assert.equal(normalizeEmail("a".repeat(300) + "@b.com"), null);
  assert.equal(normalizeEmail(123), null);
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizeEmail(undefined), null);
  assert.equal(normalizeEmail({}), null);
});

test("assertAdmin nega isSupremeAdmin=false com 403 e aceita true", () => {
  const no = assertAdmin({ isSupremeAdmin: false });
  assert.equal(no.ok, false);
  assert.equal(no.status, 403);
  assert.ok(no.error.length > 0);
  assert.deepEqual(assertAdmin({ isSupremeAdmin: true }), { ok: true });
});

function deps(over = {}) {
  return {
    getUserByEmail: async (email) => ({ uid: "dono1", email, displayName: "Maria", customClaims: {} }),
    hasAccessDoc: async () => false,
    isPro: async () => true,
    ...over,
  };
}

test("resolveTarget rejeita e-mail inválido (400)", async () => {
  const r = await resolveTarget("x", deps());
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
  assert.equal(r.error, "E-mail inválido.");
});

test("resolveTarget rejeita e-mail inexistente (404)", async () => {
  const r = await resolveTarget("a@b.com", deps({ getUserByEmail: async () => null }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 404);
  assert.equal(r.error, "Cliente não encontrado.");
});

test("resolveTarget rejeita membro (hasAccessDoc=true) com 422", async () => {
  const r = await resolveTarget("a@b.com", deps({ hasAccessDoc: async () => true }));
  assert.equal(r.ok, false);
  assert.equal(r.status, 422);
  assert.ok(/convidad/i.test(r.error));
});

test("resolveTarget rejeita portalOnly=true com 422", async () => {
  const r = await resolveTarget(
    "a@b.com",
    deps({ getUserByEmail: async (email) => ({ uid: "forn1", email, customClaims: { portalOnly: true } }) }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.status, 422);
  assert.ok(/fornecedor/i.test(r.error));
});

test("resolveTarget aceita dono e devolve pro conforme isPro", async () => {
  const pro = await resolveTarget(" A@B.com ", deps({ isPro: async () => true }));
  assert.deepEqual(pro, { ok: true, ownerUid: "dono1", email: "a@b.com", nome: "Maria", pro: true });
  const basico = await resolveTarget("a@b.com", deps({ isPro: async () => false }));
  assert.equal(basico.ok, true);
  assert.equal(basico.pro, false);
});

test("resolveTarget usa o e-mail como nome sem displayName", async () => {
  const r = await resolveTarget("a@b.com", deps({ getUserByEmail: async (email) => ({ uid: "dono1", email }) }));
  assert.equal(r.nome, "a@b.com");
});

test("resolveTarget não devolve uid fora de ownerUid nem chaves extras", async () => {
  const r = await resolveTarget("a@b.com", deps());
  assert.deepEqual(Object.keys(r).sort(), ["email", "nome", "ok", "ownerUid", "pro"]);
});

function auditDb(onSet) {
  return {
    collection(name) {
      return {
        add: async (data) => { onSet(name, data); return { id: "x" }; },
      };
    },
  };
}

const ENTRY = {
  adminUid: "adm1", adminEmail: "adm@x.com", alvoOwnerUid: "dono1", alvoEmail: "a@b.com",
  provider: "inter", acao: "conectar", ok: false,
};

test("writeAuditoria grava uma vez com ok:false e erro truncado", async () => {
  const calls = [];
  await writeAuditoria(auditDb((n, d) => calls.push([n, d])), { ...ENTRY, erro: "e".repeat(500) });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "auditoriaIntegracoes");
  assert.equal(calls[0][1].ok, false);
  assert.equal(calls[0][1].erro.length, 200);
  assert.equal(typeof calls[0][1].at, "number");
  assert.equal(calls[0][1].alvoOwnerUid, "dono1");
});

test("writeAuditoria remove PEM do erro", async () => {
  const calls = [];
  const pem = "falhou -----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY----- fim";
  await writeAuditoria(auditDb((n, d) => calls.push(d)), { ...ENTRY, erro: pem });
  assert.ok(!calls[0].erro.includes("-----BEGIN"));
  assert.ok(!calls[0].erro.includes("MIIabc"));
  const sobra = [];
  await writeAuditoria(auditDb((n, d) => sobra.push(d)), { ...ENTRY, erro: "x -----BEGIN CERTIFICATE----- cortado MIIzzz" });
  assert.ok(!sobra[0].erro.includes("-----BEGIN"));
  assert.ok(!sobra[0].erro.includes("MIIzzz"));
});

test("writeAuditoria sem erro não grava o campo", async () => {
  const calls = [];
  await writeAuditoria(auditDb((n, d) => calls.push(d)), { ...ENTRY, ok: true });
  assert.equal("erro" in calls[0], false);
});

test("writeAuditoria não lança se o Firestore falhar", async () => {
  const db = { collection() { throw new Error("boom"); } };
  await assert.doesNotReject(writeAuditoria(db, ENTRY));
  const db2 = { collection: () => ({ add: async () => { throw new Error("boom"); } }) };
  await assert.doesNotReject(writeAuditoria(db2, ENTRY));
});
