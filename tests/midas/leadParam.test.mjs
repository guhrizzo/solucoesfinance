import { test } from "node:test";
import assert from "node:assert/strict";
import { readLeadParam } from "../../lib/midas/leadParam.ts";

const A = "3f2b8c1e-5a4d-4e7b-9c1a-0d2e4f6a8b1c";
const B = "9a1c2d3e-4b5f-4a6b-8c7d-1e2f3a4b5c6d";

test("query válida", () => assert.equal(readLeadParam(`?lead=${A}`, null), A));
test("query inválida cai pro storage válido", () => assert.equal(readLeadParam("?lead=abc", B), B));
test("só storage", () => assert.equal(readLeadParam("", B), B));
test("ambos inválidos → null", () => {
  assert.equal(readLeadParam("?lead=abc", "zzz"), null);
  assert.equal(readLeadParam("", null), null);
});
test("query vence o storage", () => assert.equal(readLeadParam(`lead=${A}`, B), A));
test("lixo rejeitado", () => {
  assert.equal(readLeadParam("?lead=../x", null), null);
  assert.equal(readLeadParam("?lead=", "../x"), null);
  assert.equal(readLeadParam(`?lead=${A}x`, null), null);
});
