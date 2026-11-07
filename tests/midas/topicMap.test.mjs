// Os ids usados pelo FAB (TOPIC_TO_DEMO) precisam ser aceitos por ?topic= do /demo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { topicToPain } from "../../app/components/midas/useMidasSession.ts";

test("ids do FAB resolvem para uma dor", () => {
  for (const id of ["financeiro", "contas", "impostos", "estoque", "vendas", "centroCustos"]) {
    assert.ok(topicToPain(id), id);
  }
  assert.equal(topicToPain("centroCustos"), "relatorios");
});
