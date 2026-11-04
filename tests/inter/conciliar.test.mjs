// Regras puras da fila "A conciliar" (lib/interConciliar.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { canResolve, buildCashEntry, closedMonthsFrom, linkCandidates, monthOf } from "../../lib/interConciliar";

const item = (o) => ({
  txKey: "tx-1", date: "2026-10-10", amount: 150.5, type: "saida", description: "  PIX ENVIADO FULANO  ",
  status: "pendente", createdAt: 1, ...o,
});
const ent = (o) => ({ id: "c1", type: "saida", amount: 150.5, date: "2026-10-10", description: "x", ...o });

test("canResolve bloqueia criar e vincular em mês fechado", () => {
  const fechados = new Set(["2026-10"]);
  assert.equal(canResolve("criar", "2026-10-10", fechados), false);
  assert.equal(canResolve("vincular", "2026-10-31", fechados), false);
  assert.equal(canResolve("criar", "2026-11-01", fechados), true);
  assert.equal(canResolve("vincular", "2026-09-30", fechados), true);
});

test("canResolve permite ignorar e desfazer em mês fechado", () => {
  const fechados = new Set(["2026-10"]);
  assert.equal(canResolve("ignorar", "2026-10-10", fechados), true);
  assert.equal(canResolve("desfazer", "2026-10-10", fechados), true);
});

test("canResolve: data inválida bloqueia criar/vincular, não ignorar", () => {
  const nenhum = new Set();
  assert.equal(canResolve("criar", "", nenhum), false);
  assert.equal(canResolve("vincular", "2026-13-01", nenhum), false);
  assert.equal(canResolve("ignorar", "", nenhum), true);
});

test("monthOf: fronteira de mês e formatos", () => {
  assert.equal(monthOf("2026-12-31"), "2026-12");
  assert.equal(monthOf("2027-01-01"), "2027-01");
  assert.equal(monthOf("2026-10"), "2026-10");
  assert.equal(monthOf("10/10/2026"), null);
  assert.equal(monthOf("2026-00-10"), null);
});

test("buildCashEntry copia tipo, valor, data e define interTxId = txKey", () => {
  const e = buildCashEntry(item({}), "Fornecedores");
  assert.deepEqual(e, {
    type: "saida", amount: 150.5, date: "2026-10-10", description: "PIX ENVIADO FULANO",
    category: "Fornecedores", interTxId: "tx-1",
  });
  assert.equal(buildCashEntry(item({ type: "entrada", txKey: "x:abc" }), "Vendas").interTxId, "x:abc");
});

test("closedMonthsFrom: mês fechado só quando todos os lançamentos estão conciliados", () => {
  const s = closedMonthsFrom([
    { date: "2026-09-01", reconciled: true },
    { date: "2026-09-30", reconciled: true },
    { date: "2026-10-01", reconciled: true },
    { date: "2026-10-02" },
    { date: "" },
  ]);
  assert.deepEqual([...s], ["2026-09"]);
});

test("linkCandidates: mesmo tipo e valor, sem interTxId, dentro da janela, por proximidade", () => {
  const r = linkCandidates(item({}), [
    ent({ id: "longe", date: "2026-10-19" }),
    ent({ id: "perto", date: "2026-10-11" }),
    ent({ id: "fora", date: "2026-10-25" }),
    ent({ id: "ja", interTxId: "outro" }),
    ent({ id: "tipo", type: "entrada" }),
    ent({ id: "valor", amount: 150.51 }),
  ]);
  assert.deepEqual(r.map(e => e.id), ["perto", "longe"]);
});
