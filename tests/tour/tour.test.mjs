import test from "node:test";
import assert from "node:assert/strict";
import { canAccessStep, visibleSteps, stepForPath, TOUR_STEPS, getStep } from "@/lib/tour/catalog.ts";
import { normalizeTourState, neighbor } from "@/lib/tour/state.ts";

const ids = TOUR_STEPS.map((s) => s.id);
const owner = { isOwner: true, permissions: "all" };
const member = { isOwner: false, permissions: ["contasPagar"] };
const NOW = 1_800_000_000_000;

test("dono vê todas as etapas; membro só as liberadas + gerais", () => {
  assert.equal(visibleSteps(owner).length, TOUR_STEPS.length);
  const m = visibleSteps(member).map((s) => s.id);
  assert.deepEqual(m, ["contasPagar", "configuracoes"]);
  assert.equal(canAccessStep(getStep("equipe"), member), false);
  assert.equal(canAccessStep(getStep("equipe"), owner), true);
});

test("stepForPath acha a etapa da rota e respeita permissão", () => {
  assert.equal(stepForPath("/contasPagar/compras", owner)?.id, "contasPagar");
  assert.equal(stepForPath("/fluxo-caixa", member), undefined);
});

test("normalizeTourState descarta lixo", () => {
  assert.equal(normalizeTourState(null, ids).status, "never");
  const s = normalizeTourState({ status: "x", lastStepId: "nada", dismissCount: -3 }, ids);
  assert.equal(s.status, "never");
  assert.equal(s.lastStepId, null);
  assert.equal(s.dismissCount, 0);
  assert.equal(normalizeTourState({ status: "in_progress", lastStepId: "estoque" }, ids).lastStepId, "estoque");
});

test("neighbor", () => {
  assert.equal(neighbor(["a", "b"], "a", 1), "b");
  assert.equal(neighbor(["a", "b"], "a", -1), null);
  assert.equal(neighbor(["a", "b"], "z", 1), null);
});
