// Relatório de Vendas: CMV, lucro, margem × ROI, histórico de custo, filtros,
// períodos, comparação e dados incompletos (sobre linhas importadas).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSaleLines, computeMetrics, buildProducts, buildSeries, buildChannels, filterLines,
  resolveUnitCost, previousPeriod, presetRange, pctVariation, parseCostCsv, upsertCost,
  sortProducts, productsToCsv, autoGranularity,
} from "../../lib/salesReport.ts";

let n = 0;
const sale = (o) => ({ id: `s${++n}`, date: "2026-10-10", sku: "A", name: "Produto A", qty: 1, amount: 100, channel: "manual", ...o });
const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("exemplo do enunciado: receita 15.000, CMV 10.000 → lucro 5.000, ROI 50%, margem 33,33%", () => {
  const rows = [sale({ amount: 15000, qty: 100 })];
  const m = computeMetrics(buildSaleLines(rows, { A: [{ from: "", unitCost: 100 }] }));
  assert.equal(m.receitaLiquida, 15000);
  assert.equal(m.cmv, 10000);
  assert.equal(m.lucroBruto, 5000);
  approx(m.roiCmv, 50);
  approx(m.margemBruta, 33.3333333);
  assert.notEqual(m.roiCmv, m.margemBruta); // métricas distintas
  approx(m.markupMedio, 50);
});

test("prejuízo: custo maior que a venda → lucro, margem e ROI negativos", () => {
  const m = computeMetrics(buildSaleLines([sale({ amount: 80 })], { A: [{ from: "", unitCost: 100 }] }));
  assert.equal(m.lucroBruto, -20);
  approx(m.roiCmv, -20);
  approx(m.margemBruta, -25);
});

test("sem custo: CMV/lucro/ROI ficam null (nunca 0) e o produto vai pra 'sem custo'", () => {
  const m = computeMetrics(buildSaleLines([sale({ amount: 100 })], {}));
  assert.equal(m.cmv, null);
  assert.equal(m.lucroBruto, null);
  assert.equal(m.roiCmv, null);
  assert.equal(m.margemBruta, null);
  assert.equal(m.totalVendas, 100);
  assert.deepEqual(m.semCusto.skus, ["A"]);
  assert.equal(m.cobertura, 0);
});

test("custo zero declarado: CMV 0 → ROI indisponível (sem divisão por zero)", () => {
  const m = computeMetrics(buildSaleLines([sale()], { A: [{ from: "", unitCost: 0 }] }));
  assert.equal(m.cmv, 0);
  assert.equal(m.lucroBruto, 100);
  assert.equal(m.roiCmv, null);
  assert.equal(m.markupMedio, null);
});

test("dados parciais: lucro só sobre a parte com custo; o resto é reportado à parte", () => {
  const rows = [sale({ amount: 200, sku: "A" }), sale({ amount: 300, sku: "B", name: "Produto B" })];
  const costs = { A: [{ from: "", unitCost: 50 }] };
  const m = computeMetrics(buildSaleLines(rows, costs));
  assert.equal(m.receitaLiquida, 500);
  assert.equal(m.receitaCoberta, 200);
  assert.equal(m.cmv, 50);
  assert.equal(m.lucroBruto, 150);
  approx(m.cobertura, 40);
  assert.deepEqual(m.semCusto, { linhas: 1, receita: 300, skus: ["B"] });
  const prods = buildProducts(buildSaleLines(rows, costs));
  assert.equal(prods.find((p) => p.sku === "B").semCusto, true);
  assert.equal(prods.find((p) => p.sku === "B").lucro, null);
});

test("histórico: custo novo não reescreve vendas antigas; venda anterior ao 1º registro datado não tem custo", () => {
  const costs = { A: [{ from: "2026-09-01", unitCost: 40 }, { from: "2026-10-05", unitCost: 70 }] };
  assert.equal(resolveUnitCost("A", "2026-08-31", costs).unitCost, null);
  assert.equal(resolveUnitCost("A", "2026-09-30", costs).unitCost, 40);
  assert.equal(resolveUnitCost("A", "2026-10-05", costs).unitCost, 70);
  assert.equal(resolveUnitCost("a", "2026-10-31", costs).unitCost, 70);
});

test("filtros por período, produto e canal; gráficos e tabela fecham com os cards", () => {
  const rows = [
    sale({ date: "2026-10-01", amount: 100, sku: "A" }),
    sale({ date: "2026-10-15", amount: 300, sku: "B", channel: "shein", name: "Produto B" }),
    sale({ date: "2026-11-02", amount: 900, sku: "A" }),
  ];
  const costs = { A: [{ from: "", unitCost: 40 }], B: [{ from: "", unitCost: 100 }] };
  const all = buildSaleLines(rows, costs);
  const base = { from: "2026-10-01", to: "2026-10-31", sku: "", channel: "" };
  const f = filterLines(all, base);
  assert.equal(f.length, 2);
  assert.equal(filterLines(all, { ...base, sku: "a" }).length, 1);
  assert.equal(filterLines(all, { ...base, channel: "shein" }).length, 1);
  const m = computeMetrics(f);
  const prods = buildProducts(f);
  const series = buildSeries(f, "mes");
  const chans = buildChannels(f);
  approx(prods.reduce((a, p) => a + p.receitaLiquida, 0), m.receitaLiquida);
  approx(prods.reduce((a, p) => a + p.lucro, 0), m.lucroBruto);
  approx(prods.reduce((a, p) => a + p.share, 0), 100);
  approx(series.reduce((a, p) => a + p.receita, 0), m.receitaLiquida);
  approx(series.reduce((a, p) => a + p.lucro, 0), m.lucroBruto);
  approx(chans.reduce((a, c) => a + c.receitaLiquida, 0), m.receitaLiquida);
});

test("períodos: presets e período anterior equivalente", () => {
  assert.deepEqual(presetRange("mes", "2026-10-22"), { from: "2026-10-01", to: "2026-10-22" });
  assert.deepEqual(presetRange("mesAnterior", "2026-01-15"), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(presetRange("7d", "2026-10-22"), { from: "2026-10-16", to: "2026-10-22" });
  assert.deepEqual(previousPeriod("2026-10-01", "2026-10-22"), { from: "2026-09-01", to: "2026-09-22" });
  assert.deepEqual(previousPeriod("2026-03-01", "2026-03-31"), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(previousPeriod("2026-10-16", "2026-10-22"), { from: "2026-10-09", to: "2026-10-15" });
  assert.deepEqual(previousPeriod("2026-01-01", "2026-10-22"), { from: "2025-01-01", to: "2025-10-22" });
  assert.equal(autoGranularity("2026-10-01", "2026-10-22"), "dia");
  assert.equal(autoGranularity("2026-01-01", "2026-10-22"), "mes");
});

test("variação %: sem base anterior devolve null (não 0% nem infinito)", () => {
  approx(pctVariation(150, 100), 50);
  approx(pctVariation(50, 100), -50);
  assert.equal(pctVariation(10, 0), null);
  assert.equal(pctVariation(10, null), null);
  approx(pctVariation(-10, -20), 50); // prejuízo diminuiu
});

test("importação de custos: aceita ; e tab, vírgula decimal, vigência, e acusa linhas inválidas", () => {
  const r = parseCostCsv("sku;custo;desde\nab-1;R$ 12,50;2026-09-01\nCD2\t7.5\nXX;abc\n;5\nEF3;4;01/09/2026");
  assert.deepEqual(r.entries, [
    { sku: "AB-1", unitCost: 12.5, from: "2026-09-01" },
    { sku: "CD2", unitCost: 7.5, from: "" },
  ]);
  assert.deepEqual(r.errors, [4, 5, 6]);
});

test("upsertCost: mesma vigência substitui, novas ficam ordenadas", () => {
  let h = upsertCost({}, "a", { from: "2026-10-01", unitCost: 5 });
  h = upsertCost(h, "A", { from: "", unitCost: 3 });
  h = upsertCost(h, "A", { from: "2026-10-01", unitCost: 6 });
  assert.deepEqual(h.A, [{ from: "", unitCost: 3 }, { from: "2026-10-01", unitCost: 6 }]);
});

test("ordenação: ausentes no fim; CSV não transforma ausente em 0", () => {
  const rows = [
    sale({ sku: "A", amount: 100 }),
    sale({ sku: "B", amount: 100, name: "Produto B" }),
    sale({ sku: "C", amount: 100, name: "Produto C" }),
  ];
  const prods = buildProducts(buildSaleLines(rows, { A: [{ from: "", unitCost: 50 }], B: [{ from: "", unitCost: 90 }] }));
  assert.deepEqual(sortProducts(prods, "roi", "desc").map((r) => r.sku), ["A", "B", "C"]);
  assert.deepEqual(sortProducts(prods, "roi", "asc").map((r) => r.sku), ["B", "A", "C"]);
  const csv = productsToCsv(sortProducts(prods, "roi", "desc"), ["sku", "nome", "qtd", "receita", "custo", "cmv", "lucro", "margem", "roi", "part"]);
  assert.equal(csv.split("\r\n").at(-1), "C;Produto C;1;100;;;;;;33,33");
});
