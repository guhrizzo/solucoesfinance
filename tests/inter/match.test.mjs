// Motor de sugestão da conciliação Inter (lib/interMatch.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestAll } from "../../lib/interMatch.ts";
import { CASHFLOW_CATEGORIES } from "../../lib/cashflowCategories.ts";

const tx = (o) => ({ txKey: "k1", date: "2026-10-10", amount: 100, type: "entrada", description: "PIX recebido", ...o });
const ent = (o) => ({ id: "c1", type: "entrada", amount: 100, date: "2026-10-10", description: "Venda", ...o });

test("vincula quando tipo, valor e data ±3 dias batem", () => {
  const r = suggestAll([tx({})], [ent({ date: "2026-10-13" })]);
  assert.deepEqual(r.get("k1"), { kind: "vincular", cashflowId: "c1" });
  const longe = suggestAll([tx({})], [ent({ date: "2026-10-14" })]);
  assert.equal(longe.get("k1").kind, "criar");
});

test("tolera ponto flutuante no valor (compara em centavos)", () => {
  const r = suggestAll([tx({ amount: 0.1 + 0.2 })], [ent({ amount: 0.3 })]);
  assert.equal(r.get("k1").kind, "vincular");
});

test("não vincula lançamento que já tem interTxId", () => {
  const r = suggestAll([tx({})], [ent({ interTxId: "outro" })]);
  assert.equal(r.get("k1").kind, "criar");
});

test("com dois candidatos escolhe o de data mais próxima", () => {
  const r = suggestAll([tx({})], [ent({ id: "longe", date: "2026-10-12" }), ent({ id: "perto", date: "2026-10-11" })]);
  assert.deepEqual(r.get("k1"), { kind: "vincular", cashflowId: "perto" });
});

test("descrição só desempata datas iguais", () => {
  const r = suggestAll(
    [tx({ description: "PIX recebido Maria Silva" })],
    [ent({ id: "a", description: "Joao" }), ent({ id: "b", description: "Maria Silva" })],
  );
  assert.equal(r.get("k1").cashflowId, "b");
});

test("dois itens iguais não vinculam o mesmo lançamento", () => {
  const r = suggestAll([tx({ txKey: "k1" }), tx({ txKey: "k2" })], [ent({})]);
  const kinds = [r.get("k1").kind, r.get("k2").kind].sort();
  assert.deepEqual(kinds, ["criar", "vincular"]);
});

test("sem candidato sugere criar com categoria válida de CASHFLOW_CATEGORIES", () => {
  const r = suggestAll(
    [tx({ txKey: "a" }), tx({ txKey: "b", type: "saida", description: "Tarifa mensal" }), tx({ txKey: "c", type: "saida", description: "xyz" })],
    [],
  );
  assert.deepEqual(r.get("a"), { kind: "criar", category: "Outros recebimentos" });
  assert.deepEqual(r.get("b"), { kind: "criar", category: "Taxas bancárias" });
  assert.deepEqual(r.get("c"), { kind: "criar", category: "Outros gastos" });
  for (const [k, s] of r) {
    const t = k === "a" ? "entrada" : "saida";
    assert.ok(CASHFLOW_CATEGORIES[t].includes(s.category));
  }
});

test("tipo diferente nunca casa", () => {
  const r = suggestAll([tx({ type: "saida" })], [ent({ type: "entrada" })]);
  assert.equal(r.get("k1").kind, "criar");
});
