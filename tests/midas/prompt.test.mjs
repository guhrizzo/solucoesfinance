// Prompt e parser do turno de IA do Midas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, parseTurn } from "../../lib/midas/prompt.ts";
import { MIDAS_MODULES } from "../../lib/midas/modules.ts";
import { TRIAL_DAYS } from "../../lib/billingPlans.ts";

test("parseTurn aceita JSON válido", () => {
  const out = parseTurn('{"slots":{"segment":"loja","pain":"estoque"},"reply":"Oi!"}');
  assert.deepEqual(out, { slots: { segment: "loja", pain: "estoque" }, reply: "Oi!" });
});

test("parseTurn tolera cerca ```json e prosa em volta", () => {
  const fenced = 'Claro:\n```json\n{"slots":{"tool":"planilha","visibilityGap":true},"reply":"Entendi."}\n```\nOk';
  assert.deepEqual(parseTurn(fenced), { slots: { tool: "planilha", visibilityGap: true }, reply: "Entendi." });
  assert.equal(parseTurn('antes {"slots":{},"reply":"x"} depois')?.reply, "x");
});

test("parseTurn devolve null para lixo", () => {
  assert.equal(parseTurn("sem json nenhum"), null);
  assert.equal(parseTurn("{quebrado"), null);
  assert.equal(parseTurn(""), null);
  assert.equal(parseTurn("[1,2]"), null);
});

test("parseTurn trunca reply em 800 e descarta slots fora dos enums", () => {
  const out = parseTurn(JSON.stringify({ slots: { segment: "banco", pain: "caixa", tool: "excel", visibilityGap: "sim" }, reply: "a".repeat(2000) }));
  assert.equal(out.reply.length, 800);
  assert.deepEqual(out.slots, {});
});

test("buildSystemPrompt cobre módulos, sem preço e com o trial", () => {
  const p = buildSystemPrompt("pt-BR");
  for (const m of MIDAS_MODULES) assert.ok(p.includes(m.id), m.id);
  assert.ok(!p.includes("R$"));
  assert.match(p, new RegExp(`${TRIAL_DAYS} dias`));
});
