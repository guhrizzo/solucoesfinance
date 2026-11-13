import test from "node:test";
import assert from "node:assert/strict";
import { createGenerationToken } from "../../lib/generationToken.ts";

test("operação capturada fica obsoleta depois de bump()", () => {
  const g = createGenerationToken();
  const captured = g.current();
  assert.equal(g.isCurrent(captured), true);
  g.bump(); // troca de cliente / edição do e-mail
  assert.equal(g.isCurrent(captured), false);
});

test("nova operação após bump() é válida e a antiga continua inválida", () => {
  const g = createGenerationToken();
  const a = g.bump();
  const b = g.bump();
  assert.equal(g.isCurrent(a), false);
  assert.equal(g.isCurrent(b), true);
});
