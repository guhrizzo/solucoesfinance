import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MIDAS_MODULES } from "@/lib/midas/modules.ts";
import { chipsFor } from "@/lib/midas/flow.ts";

const LOCALES = ["pt-BR", "en", "es"];
const STEPS = ["welcome", "name", "segment", "pain", "tool", "deepen", "diagnosis", "modules", "confirm", "doubts", "cta"];
const PAINS = ["financeiro", "contas", "estoque", "vendas", "impostos", "relatorios", "canais", "tudo"];
const load = (l) => JSON.parse(readFileSync(new URL(`../../messages/${l}/midas.json`, import.meta.url), "utf8"));
const M = Object.fromEntries(LOCALES.map((l) => [l, load(l)]));

function flat(o, p = "") {
  return Object.entries(o).flatMap(([k, v]) =>
    Array.isArray(v) ? v.map((s, i) => [`${p}${k}.${i}`, s])
      : v && typeof v === "object" ? flat(v, `${p}${k}.`) : [[`${p}${k}`, v]]);
}

for (const l of LOCALES) {
  test(`${l}: cobre steps, chips, dores e modulos`, () => {
    const m = M[l];
    for (const s of STEPS) {
      assert.ok(Array.isArray(m.steps[s]?.bot) && m.steps[s].bot.length > 0, `bot ${s}`);
      const ids = new Set();
      for (const pain of [undefined, ...PAINS]) {
        for (const id of chipsFor({ step: s, ctx: { pain, interestedModules: [], doubts: [] }, history: [], consented: true })) ids.add(id);
      }
      for (const id of ids) assert.ok(m.steps[s].chips?.[id], `chip ${s}.${id}`);
    }
    for (const p of PAINS) assert.ok(m.diagnosis[p], `diagnosis ${p}`);
    for (const mod of MIDAS_MODULES) {
      for (const f of ["name", "description", "benefit"]) assert.ok(m.modules[mod.id]?.[f], `${mod.id}.${f}`);
    }
    for (const k of ["header.title", "header.subtitle", "privacy.notice", "privacy.link", "privacy.retention", "cta.button", "cta.subtext", "errors.network", "errors.retry", "errors.empty"]) {
      assert.ok(flat(m).some(([key, v]) => key === k && v), k);
    }
    assert.ok(m.overview && m.common);
    assert.match(m.cta.subtext, /7/);
  });

  test(`${l}: sem preco, desconto ou "Nexus,"`, () => {
    for (const [k, v] of flat(M[l])) {
      assert.ok(!/R\$|\$|desconto|discount|descuento|Nexus,/i.test(String(v)), `${k}: ${v}`);
    }
  });
}

test("en e es tem as mesmas chaves que pt-BR", () => {
  const keys = (l) => flat(M[l]).map(([k]) => k).sort();
  assert.deepEqual(keys("en"), keys("pt-BR"));
  assert.deepEqual(keys("es"), keys("pt-BR"));
});

import { TRIAL_DAYS } from "@/lib/billingPlans.ts";

test("nenhum texto cita Shein (oculta por flag)", () => {
  for (const l of LOCALES) for (const [k, v] of flat(M[l])) assert.ok(!/shein/i.test(String(v)), `${l} ${k}`);
});

test("retencao de 12 meses nos tres idiomas", () => {
  assert.match(M["pt-BR"].privacy.retention, /12 meses/);
  assert.match(M.en.privacy.retention, /12 months/);
  assert.match(M.es.privacy.retention, /12 meses/);
});

test("todo bot com {name} tem botNoName sem placeholder, igual em todos os idiomas", () => {
  const withName = (l) => Object.entries(M[l].steps).filter(([, s]) => s.bot.some((b) => b.includes("{name}"))).map(([id]) => id).sort();
  const base = withName("pt-BR");
  assert.ok(base.length > 0);
  for (const l of LOCALES) {
    assert.deepEqual(withName(l), base, l);
    for (const id of base) {
      const s = M[l].steps[id];
      assert.ok(Array.isArray(s.botNoName) && s.botNoName.length > 0, `${l} ${id}.botNoName`);
      assert.ok(s.botNoName.every((b) => !b.includes("{")), `${l} ${id}.botNoName placeholder`);
    }
  }
});

test("en/es sem palavras so do portugues", () => {
  const re = / (você|não|para o|seu|sua) |ção\b|ções\b/i;
  for (const l of ["en", "es"]) for (const [k, v] of flat(M[l])) assert.ok(!re.test(String(v)), `${l} ${k}: ${v}`);
});

test("cta.subtext contem TRIAL_DAYS", () => {
  for (const l of LOCALES) assert.ok(M[l].cta.subtext.includes(String(TRIAL_DAYS)), l);
});
