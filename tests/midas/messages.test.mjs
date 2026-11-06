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
