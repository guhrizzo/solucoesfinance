import test from "node:test";
import assert from "node:assert/strict";
import {
  initialState, applyAnswer, goBack, progress, chipsFor, serialize, deserialize,
} from "@/lib/midas/flow.ts";
import { modulesForPain } from "@/lib/midas/modules.ts";

const SEGMENTS = ["loja", "ecommerce", "servicos", "industria", "distribuidora", "outro"];
const PAINS = ["financeiro", "contas", "estoque", "vendas", "impostos", "relatorios", "canais", "tudo"];

const chip = (s, c) => applyAnswer(s, { chip: c });

test("percurso feliz financeiro -> planilha -> cta", () => {
  let s = initialState();
  assert.equal(s.step, "welcome");
  s = chip(s, "start");
  assert.equal(s.consented, true);
  assert.equal(s.step, "name");
  s = chip(s, "skip");
  assert.equal(s.step, "segment");
  s = chip(s, "loja");
  assert.equal(s.step, "pain");
  s = chip(s, "financeiro");
  assert.equal(s.step, "tool");
  s = chip(s, "planilha");
  assert.equal(s.step, "deepen");
  s = chip(s, "continue");
  assert.equal(s.step, "diagnosis");
  s = chip(s, "continue");
  assert.equal(s.step, "modules");
  assert.deepEqual(s.ctx.interestedModules, modulesForPain("financeiro"));
  s = chip(s, "continue");
  assert.equal(s.step, "confirm");
  s = chip(s, "yes");
  assert.equal(s.step, "cta");
  assert.equal(s.ctx.segment, "loja");
  assert.equal(s.ctx.pain, "financeiro");
  assert.equal(s.ctx.tool, "planilha");
});

test("texto com ferramenta e dor na etapa pain pula tool", () => {
  let s = chip(chip(chip(initialState(), "start"), "skip"), "loja");
  s = applyAnswer(s, { text: "uso Excel e meu problema é estoque" });
  assert.equal(s.ctx.pain, "estoque");
  assert.equal(s.ctx.tool, "planilha");
  assert.equal(s.step, "deepen");
});

test("nome digitado e texto vazio mantém etapa com retry", () => {
  let s = chip(initialState(), "start");
  s = applyAnswer(s, { text: "   " });
  assert.equal(s.step, "name");
  assert.equal(s.ctx.retry, true);
  s = applyAnswer(s, { text: "Gustavo" });
  assert.equal(s.ctx.name, "Gustavo");
  assert.equal(s.step, "segment");
  assert.equal(s.ctx.retry, undefined);
});

test("slots respondidos no início nunca são perguntados de novo", () => {
  let s = chip(initialState(), "start");
  s = applyAnswer(s, { chip: "skip" });
  s = applyAnswer(s, { text: "tenho uma loja e não sei quanto ganho nem gasto" });
  assert.equal(s.ctx.segment, "loja");
  assert.equal(s.ctx.pain, "financeiro");
  assert.equal(s.ctx.visibilityGap, true);
  assert.equal(s.step, "tool");
});

test("goBack após mudar dor recalcula módulos", () => {
  let s = initialState();
  for (const c of ["start", "skip", "loja", "financeiro", "planilha", "continue", "continue", "continue"]) s = chip(s, c);
  assert.equal(s.step, "confirm");
  const before = s.ctx.interestedModules;
  s = goBack(s); // modules
  s = goBack(s); // diagnosis
  s = goBack(s); // deepen
  s = goBack(s); // tool
  s = goBack(s); // pain
  assert.equal(s.step, "pain");
  assert.equal(s.ctx.pain, undefined);
  assert.equal(s.ctx.tool, undefined);
  assert.equal(s.ctx.segment, "loja");
  for (const c of ["estoque", "contagem", "continue", "continue"]) s = chip(s, c);
  assert.equal(s.step, "modules");
  assert.deepEqual(s.ctx.interestedModules, modulesForPain("estoque"));
  assert.notDeepEqual(s.ctx.interestedModules, before);
});

test("goBack no início não quebra", () => {
  const s = initialState();
  assert.deepEqual(goBack(s), s);
});

test("overview em welcome volta a welcome sem consentir", () => {
  let s = chip(initialState(), "overview");
  assert.equal(s.step, "welcome");
  assert.equal(s.consented, false);
  s = applyAnswer(initialState(), { text: "quero ver tudo" });
  assert.equal(s.step, "welcome");
  assert.equal(s.consented, false);
});

test("dúvidas ficam em confirm e acumulam com teto", () => {
  let s = initialState();
  for (const c of ["start", "skip", "loja", "financeiro", "planilha", "continue", "continue", "continue"]) s = chip(s, c);
  s = chip(s, "doubts");
  assert.equal(s.step, "confirm");
  for (let i = 0; i < 12; i++) s = applyAnswer(s, { text: "quanto custa mesmo " + i });
  assert.equal(s.step, "confirm");
  assert.equal(s.ctx.doubts.length, 10);
  s = applyAnswer(s, { text: "sim" });
  assert.equal(s.step, "cta");
});

test("deserialize inválido devolve null e round-trip funciona", () => {
  assert.equal(deserialize("{lixo"), null);
  assert.equal(deserialize('{"step":"xyz"}'), null);
  assert.equal(deserialize("null"), null);
  let s = chip(chip(initialState(), "start"), "skip");
  const back = deserialize(serialize(s));
  assert.deepEqual(back, s);
});

test("progress cresce monotonicamente no avanço e cai no goBack", () => {
  let s = initialState();
  let last = progress(s);
  assert.equal(last, 0);
  for (const c of ["start", "skip", "loja", "financeiro", "planilha", "continue", "continue", "continue", "yes"]) {
    s = chip(s, c);
    const p = progress(s);
    assert.ok(p > last, c);
    last = p;
  }
  assert.equal(last, 1);
  assert.ok(progress(goBack(s)) < last);
});

test("chips da ferramenta dependem da dor", () => {
  const at = (pain) => {
    let s = initialState();
    for (const c of ["start", "skip", "loja", pain]) s = chip(s, c);
    return chipsFor(s);
  };
  assert.deepEqual(at("financeiro"), ["planilha", "caderno", "sistema", "app_banco", "nenhum"]);
  assert.deepEqual(at("estoque"), ["planilha", "contagem", "memoria", "sistema", "nenhum"]);
  assert.deepEqual(at("vendas"), ["planilha", "marketplace", "sistema", "nenhum"]);
  assert.deepEqual(at("impostos"), ["planilha", "sistema", "nenhum"]);
});

test("8 dores x 6 segmentos nunca chegam a diagnosis sem segment e pain", () => {
  for (const seg of SEGMENTS) {
    for (const pain of PAINS) {
      // por chips
      let s = chip(chip(initialState(), "start"), "skip");
      s = chip(s, seg);
      s = chip(s, pain);
      s = chip(s, chipsFor(s)[0]);
      s = chip(s, "continue");
      assert.equal(s.step, "diagnosis");
      assert.equal(s.ctx.segment, seg);
      assert.equal(s.ctx.pain, pain);
      // texto que só traz a dor não pula o segmento
      let t = chip(chip(initialState(), "start"), "skip");
      t = applyAnswer(t, { text: "uso planilha, meu problema é " + pain });
      t = applyAnswer(t, { text: "continue" });
      t = applyAnswer(t, { text: "ok" });
      assert.ok(t.step !== "diagnosis" || (t.ctx.segment && t.ctx.pain), seg + pain);
    }
  }
});

const toConfirm = () => {
  let s = initialState();
  for (const c of ["start", "skip", "loja", "financeiro", "planilha", "continue", "continue", "continue"]) s = chip(s, c);
  return s;
};

test("goBack de confirm para modules mantém módulos", () => {
  const s = goBack(toConfirm());
  assert.equal(s.step, "modules");
  assert.deepEqual(s.ctx.interestedModules, modulesForPain("financeiro"));
});

test("texto livre não sobrescreve slots já preenchidos", () => {
  let s = chip(chip(chip(chip(chip(initialState(), "start"), "skip"), "loja"), "financeiro"), "planilha");
  s = applyAnswer(s, { text: "vendo no mercado livre" });
  assert.equal(s.ctx.tool, "planilha");
  assert.equal(s.step, "diagnosis");
  let t = chip(chip(chip(chip(initialState(), "start"), "skip"), "loja"), "financeiro");
  t = applyAnswer(t, { text: "uso Excel pra controlar estoque" });
  assert.equal(t.ctx.pain, "financeiro");
  assert.equal(t.ctx.tool, "planilha");
});

test("chip desconhecido em confirm é no-op; dúvidas vazias não entram; fica com as 10 mais novas", () => {
  let s = toConfirm();
  s = chip(s, "continue");
  assert.equal(s.step, "confirm");
  assert.deepEqual(s.ctx.doubts, []);
  s = applyAnswer(s, { text: "   " });
  assert.deepEqual(s.ctx.doubts, []);
  for (let i = 0; i < 12; i++) s = applyAnswer(s, { text: "duvida numero " + i });
  assert.equal(s.ctx.doubts.length, 10);
  assert.equal(s.ctx.doubts[0], "duvida numero 2");
  assert.equal(s.ctx.doubts[9], "duvida numero 11");
});

test("goBack para deepen limpa visibilityGap", () => {
  let s = chip(chip(chip(chip(chip(initialState(), "start"), "skip"), "loja"), "financeiro"), "planilha");
  s = applyAnswer(s, { text: "nem sei quanto ganho" });
  assert.equal(s.ctx.visibilityGap, true);
  s = goBack(s);
  assert.equal(s.step, "deepen");
  assert.equal(s.ctx.visibilityGap, undefined);
});
