import { test } from "node:test";
import assert from "node:assert/strict";
import { notifyLeadConverted } from "../../lib/midas/convertClient.ts";

const SID = "3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1c";

function setup({ fetchImpl, search = `?lead=${SID}`, stored = null } = {}) {
  const store = new Map(stored ? [["midas-lead", stored]] : []);
  const calls = [];
  globalThis.window = { location: { search }, sessionStorage: {
    getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) } };
  globalThis.fetch = fetchImpl ?? (async (url, init) => { calls.push({ url, init }); return { ok: true }; });
  return { store, calls };
}
const user = { getIdToken: async () => "tok123" };
const flush = () => new Promise((r) => setTimeout(r, 10));

test("POSTa sessionId com Bearer e limpa a chave", async () => {
  const { store, calls } = setup({ stored: SID });
  notifyLeadConverted(user);
  await flush();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/midas/convert");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers.Authorization, "Bearer tok123");
  assert.deepEqual(JSON.parse(calls[0].init.body), { sessionId: SID });
  assert.equal(store.has("midas-lead"), false);
});

test("sem lead válido não chama fetch", async () => {
  const { calls } = setup({ search: "?lead=x" });
  notifyLeadConverted(user);
  await flush();
  assert.equal(calls.length, 0);
});

test("retorna na hora (não é awaited) e engole erros", async () => {
  setup({ fetchImpl: async () => { throw new Error("boom"); } });
  const r = notifyLeadConverted({ getIdToken: async () => { throw new Error("x"); } });
  assert.equal(r, undefined);
  await flush();
  setup({ fetchImpl: async () => { throw new Error("boom"); } });
  assert.equal(notifyLeadConverted(user), undefined);
  await flush();
});

test("resposta não-ok mantém a chave no storage", async () => {
  const { store } = setup({ stored: SID, fetchImpl: async () => ({ ok: false }) });
  notifyLeadConverted(user);
  await flush();
  assert.equal(store.get("midas-lead"), SID);
});

import { shouldConvertAfterGoogle } from "../../lib/midas/convertClient.ts";

test("shouldConvertAfterGoogle só para isNewUser === true", () => {
  assert.equal(shouldConvertAfterGoogle({ isNewUser: true }), true);
  assert.equal(shouldConvertAfterGoogle({ isNewUser: false }), false);
  assert.equal(shouldConvertAfterGoogle({}), false);
  assert.equal(shouldConvertAfterGoogle(null), false);
  assert.equal(shouldConvertAfterGoogle(undefined), false);
});
