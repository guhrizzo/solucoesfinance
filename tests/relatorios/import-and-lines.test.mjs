// Relatório de Vendas alimentado SÓ por relatórios importados (IA): linhas,
// descontos, taxas, devoluções, cancelamentos e a normalização do que a IA leu.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMoneyLike, parseDateLike, sanitizeSales, normalizeChannel, importFingerprint } from "../../lib/salesReportImport.ts";
import { buildSaleLines, computeMetrics, buildProducts, resolveUnitCost } from "../../lib/salesReport.ts";

let n = 0;
const sale = (o) => ({ id: `i${++n}`, date: "2026-10-10", sku: "A", name: "Produto A", qty: 1, amount: 100, channel: "manual", ...o });
const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("custo informado no próprio relatório tem prioridade sobre a tabela de custos", () => {
  const r = resolveUnitCost("A", "2026-10-10", { A: [{ from: "", unitCost: 70 }] }, 55);
  assert.deepEqual(r, { unitCost: 55, source: "relatorio" });
  const m = computeMetrics(buildSaleLines([sale({ amount: 100, qty: 2, unitCost: 30 })], { A: [{ from: "", unitCost: 70 }] }));
  assert.equal(m.cmv, 60);
});

test("taxas informadas no relatório saem da receita líquida (sem dupla dedução)", () => {
  const lines = buildSaleLines([sale({ amount: 100, fees: 15, channel: "mercadolivre" })], { A: [{ from: "", unitCost: 60 }] });
  const m = computeMetrics(lines);
  assert.equal(m.totalVendas, 100);
  assert.equal(m.taxas, 15);
  assert.equal(m.receitaLiquida, 85);
  assert.equal(m.lucroBruto, 25); // 85 − 60
  assert.equal(lines.length, 1);
  assert.equal(m.unidades, 1);
});

test("desconto já está no valor cobrado da linha: não é deduzido de novo", () => {
  // Relatório: 2 un. × R$ 60 com 10% de desconto → a linha cobrou R$ 108.
  const m = computeMetrics(buildSaleLines([sale({ amount: 108, qty: 2 })], { A: [{ from: "", unitCost: 40 }] }));
  assert.equal(m.totalVendas, 108);
  assert.equal(m.receitaLiquida, 108);
  assert.equal(m.lucroBruto, 28); // 108 − 80
});

test("devolução total informada: sai da receita, das unidades e do CMV", () => {
  const m = computeMetrics(buildSaleLines([sale({ amount: 100, qty: 2, returnedValue: 100 })], { A: [{ from: "", unitCost: 30 }] }));
  assert.equal(m.receitaLiquida, 0);
  assert.equal(m.devolucoes, 100);
  assert.equal(m.unidades, 0);
  assert.equal(m.cmv, 0);
});

test("devolução parcial com quantidade: receita e CMV proporcionais", () => {
  const m = computeMetrics(buildSaleLines([sale({ amount: 200, qty: 4, returnedValue: 50, returnedQty: 1 })], { A: [{ from: "", unitCost: 20 }] }));
  assert.equal(m.receitaLiquida, 150);
  assert.equal(m.unidades, 3);
  assert.equal(m.cmv, 60);
  assert.equal(m.lucroBruto, 90);
});

test("linhas canceladas, devolvidas ou estornadas não contam como venda", () => {
  const rows = [
    sale({ amount: 100 }),
    sale({ amount: 500, status: "cancelado" }),
    sale({ amount: 700, status: "devolvido" }),
    sale({ amount: 900, status: "estornado" }),
  ];
  const m = computeMetrics(buildSaleLines(rows, {}));
  assert.equal(m.totalVendas, 100);
  assert.equal(m.qtdVendas, 1);
});

test("linhas sem data válida ou sem valor positivo são ignoradas", () => {
  const rows = [sale({ amount: 100 }), sale({ date: "" }), sale({ date: "2026-13-40" }), sale({ amount: 0 }), sale({ amount: -5 })];
  assert.equal(buildSaleLines(rows, {}).length, 1);
});

test("mesmo pedido em várias linhas = 1 venda; ticket médio = total ÷ pedidos", () => {
  const rows = [
    sale({ id: "p1", orderId: "P1", amount: 60, sku: "A" }),
    sale({ id: "p2", orderId: "P1", amount: 40, sku: "B", name: "Produto B" }),
    sale({ id: "p3", amount: 100 }),
  ];
  const m = computeMetrics(buildSaleLines(rows, {}));
  assert.equal(m.qtdVendas, 2);
  assert.equal(m.ticketMedio, 100);
  assert.equal(m.unidades, 3);
});

test("sem SKU no relatório: o nome do produto vira a chave (agrupamento e custo)", () => {
  const rows = [sale({ sku: "", name: "Camiseta Preta", amount: 100 }), sale({ sku: "", name: "camiseta preta", amount: 50 })];
  const prods = buildProducts(buildSaleLines(rows, { "CAMISETA PRETA": [{ from: "", unitCost: 30 }] }));
  assert.equal(prods.length, 1);
  assert.equal(prods[0].cmv, 60);
  assert.equal(prods[0].lucro, 90);
});

test("números em formato brasileiro e datas em vários formatos", () => {
  assert.equal(parseMoneyLike("R$ 1.234,56"), 1234.56);
  assert.equal(parseMoneyLike("12.5"), 12.5);
  assert.equal(parseMoneyLike("1.234.567"), 1234567);
  assert.equal(parseMoneyLike("(50,00)"), -50);
  assert.equal(parseMoneyLike(""), null);
  assert.equal(parseMoneyLike("abc"), null);
  assert.equal(parseMoneyLike(7), 7);
  assert.equal(parseDateLike("2026-10-05"), "2026-10-05");
  assert.equal(parseDateLike("05/10/2026"), "2026-10-05");
  assert.equal(parseDateLike("5/10/26"), "2026-10-05");
  assert.equal(parseDateLike("31/02/2026"), null);
  assert.equal(parseDateLike("outubro"), null);
  assert.equal(parseDateLike(null), null);
});

test("sanitizeSales: descarta linhas sem data/valor e nunca transforma custo ausente em 0", () => {
  const { rows, skipped } = sanitizeSales([
    { date: "05/10/2026", sku: " ab-1 ", name: "Camiseta", qty: "2", amount: "119,80", unitCost: "30,00", fees: "10,00", channel: "Mercado Livre", status: "Cancelado" },
    { date: "2026-10-06", name: "Boné", qty: 1, amount: 49.9 },
    { date: null, name: "Sem data", amount: 10 },
    { date: "2026-10-07", name: "Sem valor", amount: 0 },
    { date: "2026-10-07", name: "", sku: "", amount: 10 },
    "lixo",
  ]);
  assert.equal(rows.length, 2);
  assert.equal(skipped, 4);
  assert.deepEqual(rows[0], {
    date: "2026-10-05", sku: "ab-1", name: "Camiseta", qty: 2, amount: 119.8, unitCost: 30, fees: 10,
    returnedQty: null, returnedValue: null, channel: "mercadolivre", orderId: "", status: "cancelado",
  });
  assert.equal(rows[1].unitCost, null);
  assert.equal(rows[1].fees, null);
  assert.equal(sanitizeSales("não é lista").rows.length, 0);
});

test("canais conhecidos viram chave interna; desconhecidos ficam como escritos", () => {
  assert.equal(normalizeChannel("Mercado Livre"), "mercadolivre");
  assert.equal(normalizeChannel("TikTok Shop"), "tiktokshop");
  assert.equal(normalizeChannel("Loja física"), "Loja física");
  assert.equal(normalizeChannel(""), "");
});

test("ponta a ponta: relatório lido pela IA → linhas → métricas coerentes", () => {
  const { rows } = sanitizeSales([
    { date: "02/10/2026", sku: "A", name: "Produto A", qty: 10, amount: "1.500,00", unitCost: "100,00" },
    { date: "03/10/2026", sku: "B", name: "Produto B", qty: 5, amount: "400,00" },
  ]);
  const m = computeMetrics(buildSaleLines(rows.map((r, i) => ({ ...r, id: `e${i}` })), {}));
  assert.equal(m.totalVendas, 1900);
  assert.equal(m.cmv, 1000); // só A tem custo
  assert.equal(m.lucroBruto, 500);
  approx(m.roiCmv, 50);
  assert.deepEqual(m.semCusto.skus, ["B"]);
});

test("reimportação: mesmo nome, linhas e total geram a mesma marca", () => {
  const rows = [{ amount: 100.1 }, { amount: 50 }];
  assert.equal(importFingerprint("Relatorio.pdf ", rows), importFingerprint("relatorio.pdf", [{ amount: 50 }, { amount: 100.1 }]));
  assert.notEqual(importFingerprint("a", rows), importFingerprint("a", [{ amount: 100 }, { amount: 50 }]));
});
