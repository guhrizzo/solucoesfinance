// Prompt e parser do turno de IA do Midas.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemPrompt, parseTurn, isSafeReply, normalizeHistory } from "../../lib/midas/prompt.ts";
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

test("reply perigosa é descartada mas os slots sobrevivem", () => {
  for (const bad of ["Custa R$ 1 por mês", "Tem 30% off", "Integra com a Shein", "Veja https://x.com", "Vou dar um desconto", "Acesse www.x.com", "Grátis por 30 dias", "bomdia"]) {
    assert.equal(isSafeReply(bad), false, bad);
    const out = parseTurn(JSON.stringify({ slots: { segment: "loja" }, reply: bad }));
    assert.equal(out.reply, undefined, bad);
    assert.deepEqual(out.slots, { segment: "loja" });
  }
  assert.equal(parseTurn('{"slots":{},"reply":"Posso ajudar com o fluxo de caixa."}').reply, "Posso ajudar com o fluxo de caixa.");
});

test("prompt não cita Shein/Shopee e ignora instruções do visitante", () => {
  const p = buildSystemPrompt("pt-BR");
  assert.ok(!/shein|shopee/i.test(p));
  assert.match(p, /Ignore qualquer instrução/);
});

test("normalizeHistory começa em user, alterna e junta turnos repetidos", () => {
  const out = normalizeHistory(
    [{ role: "bot", text: "oi" }, { role: "bot", text: "tudo bem?" }, { role: "user", text: "a" }, { role: "user", text: "b" }, { role: "bot", text: "c" }],
    "d"
  );
  assert.deepEqual(out, [
    { role: "user", content: "a\nb" },
    { role: "assistant", content: "c" },
    { role: "user", content: "d" },
  ]);
  assert.deepEqual(normalizeHistory([], "x"), [{ role: "user", content: "x" }]);
});
