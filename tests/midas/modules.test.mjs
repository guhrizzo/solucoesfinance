import test from "node:test";
import assert from "node:assert/strict";
import { MIDAS_MODULES, modulesForPain } from "@/lib/midas/modules.ts";
import { TOUR_STEPS } from "@/lib/tour/catalog.ts";

const PAINS = ["financeiro", "contas", "estoque", "vendas", "impostos", "relatorios", "canais", "tudo"];
const moduleIds = MIDAS_MODULES.map((m) => m.id);
const stepIds = TOUR_STEPS.map((s) => s.id);

test("todo tourStepId nao nulo existe em TOUR_STEPS", () => {
  for (const m of MIDAS_MODULES) {
    if (m.tourStepId !== null) assert.ok(stepIds.includes(m.tourStepId), m.id);
  }
});

test("modulesForPain retorna 2-3 ids existentes para cada dor", () => {
  for (const p of PAINS) {
    const r = modulesForPain(p);
    assert.ok(r.length >= 2 && r.length <= 3, p);
    for (const id of r) assert.ok(moduleIds.includes(id), `${p}:${id}`);
  }
});

test("pro exatamente nos 5 modulos Pro", () => {
  const pro = MIDAS_MODULES.filter((m) => m.pro).map((m) => m.id).sort();
  assert.deepEqual(pro, ["alertasWhatsapp", "cobrancaEmail", "leitorNf", "pdv", "rh"]);
});

test("relevancia por dor", () => {
  assert.ok(modulesForPain("estoque").includes("estoque"));
  assert.ok(modulesForPain("financeiro").includes("fluxoCaixa"));
});
