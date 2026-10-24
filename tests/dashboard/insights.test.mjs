// Dashboard: déficit/superávit, realizado × previsto × saldo, vencidas, orçamento,
// projeção, centros de custo, alertas e períodos vazios (lib/dashboardInsights.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  todayISO, addDays, periodRange, previousEquivalentRange, realizedRange, pctChange,
  summarizeTxs, cashBalance, buildResultOverview, buildTimeline, buildPayables, buildReceivables,
  buildDueSummary, buildDefaultRate, buildBudget, buildProjection, buildCenterHighlights,
  checkReconciliation, buildAlerts,
} from "../../lib/dashboardInsights.ts";

const TODAY = "2026-10-15";
let n = 0;
const tx = (o) => ({ id: `t${++n}`, type: "entrada", description: "x", category: "Vendas", amount: 100, date: "2026-10-10", ...o });
const out = (o) => tx({ type: "saida", category: "Outros gastos", ...o });
const mes = { mode: "mes", year: 2026, month: 9 };
const ano = { mode: "ano", year: 2026, month: 9 };

test("todayISO usa o calendário local, não UTC", () => {
  assert.equal(todayISO(new Date(2026, 9, 15, 23, 30)), "2026-10-15");
});

test("período anterior equivalente: mês em andamento é truncado no mesmo dia", () => {
  assert.deepEqual(previousEquivalentRange(mes, TODAY), { start: "2026-09-01", end: "2026-09-15" });
  // mês encerrado → mês anterior inteiro
  assert.deepEqual(previousEquivalentRange({ mode: "mes", year: 2026, month: 8 }, TODAY), { start: "2026-08-01", end: "2026-08-31" });
  // janeiro → dezembro do ano anterior
  assert.deepEqual(previousEquivalentRange({ mode: "mes", year: 2026, month: 0 }, TODAY), { start: "2025-12-01", end: "2025-12-31" });
  // ano em andamento → 1º jan até o mesmo dia do ano anterior
  assert.deepEqual(previousEquivalentRange(ano, TODAY), { start: "2025-01-01", end: "2025-10-15" });
  assert.deepEqual(previousEquivalentRange({ mode: "ano", year: 2025, month: 0 }, TODAY), { start: "2024-01-01", end: "2024-12-31" });
});

test("mês futuro não tem realizado", () => {
  assert.equal(realizedRange({ mode: "mes", year: 2026, month: 11 }, TODAY), null);
  assert.deepEqual(realizedRange(mes, TODAY), { start: "2026-10-01", end: TODAY });
});

test("resultado ≠ saldo: aplicação, resgate, empréstimo e transferência não são resultado", () => {
  const txs = [
    tx({ amount: 1000 }),                                                  // receita
    out({ amount: 400 }),                                                  // despesa
    tx({ amount: 5000, category: "Empréstimos" }),                         // financiamento
    out({ amount: 2000, category: "Aplicação financeira" }),               // aplicação
    tx({ amount: 300, category: "Resgate de aplicação" }),                 // resgate
    out({ amount: 700, category: "Transferência mesma titularidade" }),    // transferência
  ];
  const s = summarizeTxs(txs, periodRange(mes));
  assert.equal(s.resultado, 600);
  assert.equal(s.receita, 1000);
  assert.equal(s.despesa, 400);
  assert.equal(s.entradas, 6300);
  assert.equal(s.saidas, 3100);
  assert.equal(s.saldo, 3200); // saldo do caixa difere do resultado
  assert.deepEqual(s.foraDoResultado, { entradas: 5300, saidas: 2700 });
});

test("saldo atual só conta realizado (data <= hoje) e usa saldo no fim do período em mês encerrado", () => {
  const txs = [tx({ amount: 1000, date: "2026-08-20" }), out({ amount: 200, date: "2026-09-05" }), tx({ amount: 999, date: "2026-10-20" })];
  assert.equal(cashBalance(txs, TODAY), 800);
  const ov = buildResultOverview(txs, { mode: "mes", year: 2026, month: 8 }, TODAY);
  assert.equal(ov.saldoAtual, 800);
  assert.equal(ov.saldoFimPeriodo, 800);
  const ago = buildResultOverview(txs, { mode: "mes", year: 2026, month: 7 }, TODAY);
  assert.equal(ago.saldoFimPeriodo, 1000);
});

test("acumulado do ano (mensal) vs. resultado do período e do ano (anual)", () => {
  const txs = [
    tx({ amount: 1000, date: "2026-01-10" }), out({ amount: 1500, date: "2026-02-10" }), // jan +1000, fev -1500
    tx({ amount: 2000, date: "2026-10-05" }), out({ amount: 500, date: "2026-10-08" }),   // out +1500
    tx({ amount: 800, date: "2025-10-05" }),                                              // ano anterior
  ];
  const m = buildResultOverview(txs, mes, TODAY);
  assert.equal(m.periodo.resultado, 1500);
  assert.equal(m.acumulado.resultado, 1000); // 1000 - 1500 + 1500
  assert.equal(m.ano.resultado, 1000);
  assert.equal(m.anoAnterior.resultado, 800);
  assert.equal(m.anterior.resultado, 0);
  assert.equal(m.variacao.resultado, null); // sem base de comparação
  const a = buildResultOverview(txs, ano, TODAY);
  assert.equal(a.periodo.resultado, 1000);
  assert.equal(pctChange(1000, 800), 25);
});

test("empresa sem movimentação e período vazio: zeros, sem NaN nem variação inventada", () => {
  const ov = buildResultOverview([], mes, TODAY);
  assert.equal(ov.saldoAtual, 0);
  assert.equal(ov.periodo.resultado, 0);
  assert.equal(ov.variacao.entradas, null);
  assert.deepEqual(buildTimeline([], mes, TODAY, "day").every((p) => p.acumulado === 0), true);
  assert.deepEqual(buildTimeline([], { mode: "mes", year: 2027, month: 0 }, TODAY, "day"), []);
  const due = buildDueSummary([], [], TODAY);
  assert.equal(due.pagar.vencidas.count, 0);
  const proj = buildProjection([], [], [], TODAY);
  assert.equal(proj.horizontes.length, 3);
  assert.equal(proj.primeiroDiaNegativo, null);
  const b = buildBudget(mes, TODAY, { costCenters: [], expenses: [], bills: [], taxes: [] });
  assert.equal(b.hasBudget, false);
  assert.equal(b.pct, null);
  assert.deepEqual(buildAlerts({
    overview: ov, due, projection: proj, budget: b, recon: checkReconciliation([], mes, TODAY),
  }), []);
});

test("linha do tempo: trunca em hoje, acumula resultado e agrupa por semana/mês", () => {
  const txs = [
    tx({ amount: 100, date: "2026-10-01" }), out({ amount: 30, date: "2026-10-03" }),
    tx({ amount: 50, date: "2026-10-09" }), tx({ amount: 500, date: "2026-10-20" }), // futuro: fora
    tx({ amount: 1000, category: "Aplicação", date: "2026-10-03" }),                  // fora do resultado
  ];
  const dia = buildTimeline(txs, mes, TODAY, "day");
  assert.equal(dia.length, 15);
  assert.equal(dia[2].saidas, 30);
  assert.equal(dia[2].entradas, 1000);
  assert.equal(dia[2].resultado, -30);
  assert.equal(dia[14].acumulado, 120);
  const sem = buildTimeline(txs, mes, TODAY, "week");
  assert.equal(sem.length, 3);
  assert.equal(sem[0].entradas, 1100);
  const m = buildTimeline(txs, ano, TODAY, "month");
  assert.equal(m.length, 10);
  assert.equal(m[9].acumulado, 120);
});

test("contas a pagar: vencida NÃO é paga; baixa parcial reduz o saldo em aberto; paga/cancelada saem", () => {
  const payables = buildPayables(
    [
      { id: "a", title: "Aluguel", dueDate: "2026-10-01", amount: 1000, status: "vencido" },
      { id: "b", title: "Luz", dueDate: "2026-10-15", amount: 300, amountPaid: 100, status: "pendente" },
      { id: "c", title: "Água", dueDate: "2026-10-18", amount: 80, status: "pendente" },
      { id: "d", title: "Paga", dueDate: "2026-10-02", amount: 500, status: "pago" },
      { id: "e", title: "Cancelada", dueDate: "2026-10-02", amount: 500, status: "cancelado" },
    ],
    [{ id: "t", name: "ISS", dueDate: "2026-10-20", amount: 200, status: "atraso" }],
    [{ id: "x", description: "Material", center: "Obra", date: "2026-10-14", amount: 50, status: "pendente" },
     { id: "y", description: "Pago", center: "Obra", date: "2026-10-14", amount: 70, status: "pago" }],
  );
  const due = buildDueSummary(payables, [], TODAY);
  assert.deepEqual(due.pagar.vencidas, { count: 2, total: 1050 });   // aluguel 1000 + despesa 50 (vencida ontem)
  assert.deepEqual(due.pagar.hoje, { count: 1, total: 200 });        // luz: 300 - 100 já baixados
  assert.deepEqual(due.pagar.proximos, { count: 2, total: 280 });    // água 80 + ISS 200 (D+5)
  assert.equal(due.pagar.totalAberto.total, 1530);
  assert.equal(due.pagarItens[0].label, "Aluguel"); // mais atrasada primeiro
  const rate = buildDefaultRate(payables, mes, TODAY);
  assert.equal(rate.total, 1530);
  assert.equal(Math.round(rate.rate), 69);
});

test("contas a receber: parcial recebida só conta o saldo; vencida fica separada", () => {
  const rec = buildReceivables([
    { id: "1", title: "Cliente A", dueDate: "2026-10-05", amount: 1000, amountReceived: 400, status: "atrasado" },
    { id: "2", clientName: "Cliente B", dueDate: "2026-10-17", amount: 500, status: "pendente" },
    { id: "3", title: "Recebida", dueDate: "2026-10-17", amount: 900, status: "recebido" },
  ]);
  const due = buildDueSummary([], rec, TODAY);
  assert.deepEqual(due.receber.vencidas, { count: 1, total: 600 });
  assert.deepEqual(due.receber.proximos, { count: 1, total: 500 });
  assert.equal(due.receberItens.length, 2);
});

test("projeção 7/15/30: não duplica baixas, vencida a pagar entra, vencida a receber não", () => {
  const txs = [
    tx({ amount: 1000, date: "2026-10-01" }),
    out({ amount: 100, date: "2026-10-12", sourceBillId: "b" }), // baixa parcial da conta b, já no caixa
    tx({ amount: 40, date: "2026-10-20" }),                      // lançamento datado no futuro
  ];
  const payables = buildPayables([
    { id: "a", title: "Vencida", dueDate: "2026-10-10", amount: 200, status: "vencido" },
    { id: "b", title: "Parcial", dueDate: "2026-10-18", amount: 500, amountPaid: 100, status: "pendente" },
    { id: "c", title: "Longe", dueDate: "2026-11-10", amount: 300, status: "pendente" },
  ], [], []);
  const receivables = buildReceivables([
    { id: "r1", title: "Atrasada", dueDate: "2026-10-01", amount: 700, status: "atrasado" },
    { id: "r2", title: "Futura", dueDate: "2026-10-25", amount: 250, status: "pendente" },
  ]);
  const p = buildProjection(txs, payables, receivables, TODAY);
  assert.equal(p.saldoAtual, 900);
  const [h7, h15, h30] = p.horizontes;
  assert.equal(h7.lancamentosFuturos, 40);
  assert.equal(h7.saldo, 900 - 200 - 400 + 40);             // vencida + parcial (400 em aberto) + lançamento futuro
  assert.equal(h15.receber, 250);
  assert.equal(h15.saldo, 900 - 600 + 40 + 250);
  assert.equal(h30.pagar, 900);                             // + "Longe" (10/11 = D+26)
  assert.deepEqual(p.receberVencido, { count: 1, total: 700 });
  assert.deepEqual(p.pagarVencido, { count: 1, total: 200 });
  assert.equal(p.diario.length, 31);
  assert.equal(p.diario[0], 700);                           // vencida sai no dia 0
});

test("projeção negativa: acusa o primeiro dia negativo", () => {
  const payables = buildPayables([{ id: "a", title: "Grande", dueDate: "2026-10-17", amount: 5000, status: "pendente" }], [], []);
  const p = buildProjection([tx({ amount: 1000 })], payables, [], TODAY);
  assert.equal(p.primeiroDiaNegativo, 2);
  assert.equal(p.horizontes[0].saldo, -4000);
});

test("orçamento: orçado × realizado, % consumido, saldo, excedido e maior desvio", () => {
  const costCenters = [
    { id: "c1", name: "Marketing", budgetsByMonth: { "2026-10": 1000 } },
    { id: "c2", name: "Obra", budgetsByMonth: { "2026-10": 2000 } },
    { id: "c3", name: "Sem orçamento", budgetsByMonth: {} },
  ];
  const expenses = [
    { id: "e1", center: "Marketing", date: "2026-10-05", amount: 1300, status: "pago" },
    { id: "e2", center: "Obra", date: "2026-10-06", amount: 500, status: "pago" },
    { id: "e3", center: "Obra", date: "2026-10-07", amount: 900, status: "pendente" }, // não é realizado
    { id: "e4", center: "Marketing", date: "2026-09-05", amount: 999, status: "pago" }, // outro mês
  ];
  const bills = [
    { id: "b1", dueDate: "2026-10-10", amount: 400, status: "pago" },
    { id: "b2", dueDate: "2026-10-12", amount: 600, amountPaid: 100, status: "pendente" },
  ];
  const taxes = [{ id: "t1", dueDate: "2026-10-20", amount: 200, status: "pendente" }];
  const b = buildBudget(mes, TODAY, { costCenters, expenses, bills, taxes });
  assert.equal(b.orcado, 3000 + 1000 + 200);
  assert.equal(b.realizado, 1800 + 500 + 0);
  assert.equal(Math.round(b.pct), 55);
  assert.equal(b.saldo, 1900);
  assert.equal(b.excedido, false);
  assert.equal(b.centrosEstourados, 1);
  assert.equal(b.desvios[0].name, "Marketing");
  assert.equal(b.desvios[0].desvio, 300);
  assert.equal(b.grupos.length, 3);
  // modo anual soma os meses orçados
  const a = buildBudget(ano, TODAY, { costCenters: [{ id: "c1", name: "M", budgetsByMonth: { "2026-01": 100, "2026-10": 50 } }], expenses: [], bills: [], taxes: [] });
  assert.equal(a.orcado, 150);
});

test("orçamento excedido: saldo negativo e flag", () => {
  const b = buildBudget(mes, TODAY, {
    costCenters: [{ id: "c", name: "A", budgetsByMonth: { "2026-10": 100 } }],
    expenses: [{ id: "e", center: "A", date: "2026-10-02", amount: 150, status: "pago" }], bills: [], taxes: [],
  });
  assert.equal(b.excedido, true);
  assert.equal(b.saldo, -50);
});

test("centros de custo: maiores despesas, % de uso, estourados e variação vs. equivalente", () => {
  const costCenters = [{ id: "1", name: "A", budgetsByMonth: { "2026-10": 100 } }, { id: "2", name: "B", budgetsByMonth: { "2026-10": 1000 } }];
  const expenses = [
    { id: "1", center: "A", date: "2026-10-03", amount: 150, status: "pago" },
    { id: "2", center: "B", date: "2026-10-03", amount: 300, status: "pago" },
    { id: "3", center: "B", date: "2026-09-03", amount: 200, status: "pago" },
    { id: "4", center: "B", date: "2026-09-20", amount: 999, status: "pago" }, // depois do dia 15: fora do equivalente
    { id: "5", center: "Removido", date: "2026-10-04", amount: 50, status: "pago" },
    { id: "6", center: "B", date: "2026-10-04", amount: 700, status: "pendente" },
  ];
  const h = buildCenterHighlights(mes, TODAY, { costCenters, expenses });
  assert.equal(h.total, 500);
  assert.equal(h.top[0].name, "B");
  assert.equal(h.top[0].variacao, 50);
  assert.equal(h.top[1].pct, 150);
  assert.equal(h.estourados, 1);
  assert.equal(h.semOrcamento, 1);
});

test("conciliação: pendentes só se o recurso é usado; duplicados ignoram espelhos", () => {
  const base = [
    tx({ amount: 10, reconciled: true }),
    tx({ amount: 20 }), tx({ amount: 30 }),
    tx({ description: "Pix João", amount: 77 }), tx({ description: "pix joão", amount: 77 }),
    out({ description: "Conta", amount: 5, sourceBillId: "z" }), out({ description: "Conta", amount: 5, sourceBillId: "w" }),
  ];
  const r = checkReconciliation(base, mes, TODAY);
  assert.equal(r.inUse, true);
  assert.equal(r.pendentes, 6);
  assert.deepEqual(r.duplicados, { grupos: 1, extras: 1, valorExtras: 77 });
  assert.equal(checkReconciliation(base.map((t) => ({ ...t, reconciled: false })), mes, TODAY).inUse, false);
  assert.equal(checkReconciliation([], mes, TODAY).pendentesPct, null);
});

test("alertas: prioridade, sem repetição, sem inventar meta e respeitando acesso", () => {
  const txs = [
    tx({ amount: 500, date: "2026-09-05" }), out({ amount: 100, date: "2026-09-06" }),   // set: receita 500, despesa 100 (até dia 15)
    tx({ amount: 200, date: "2026-10-05" }), out({ amount: 900, date: "2026-10-06" }),    // out: receita 200, despesa 900
    tx({ amount: 1, reconciled: true, date: "2026-10-01" }),
  ];
  const payables = buildPayables([
    { id: "a", title: "Atrasada", dueDate: "2026-10-01", amount: 300, status: "vencido" },
    { id: "b", title: "Hoje", dueDate: TODAY, amount: 50, status: "pendente" },
    { id: "c", title: "Semana", dueDate: "2026-10-18", amount: 10, status: "pendente" },
  ], [], []);
  const receivables = buildReceivables([{ id: "r", title: "Cli", dueDate: "2026-10-02", amount: 80, status: "atrasado" }]);
  const overview = buildResultOverview(txs, mes, TODAY);
  const due = buildDueSummary(payables, receivables, TODAY);
  const projection = buildProjection(txs, payables, receivables, TODAY);
  const budget = buildBudget(mes, TODAY, { costCenters: [], expenses: [], bills: [], taxes: [] });
  const recon = checkReconciliation(txs, mes, TODAY);
  const alerts = buildAlerts({ overview, due, projection, budget, recon });
  const codes = alerts.map((a) => a.code);
  assert.equal(new Set(codes).size, codes.length, "sem códigos repetidos");
  assert.equal(alerts[0].severity, "critical");
  for (const c of ["overduePayables", "dueTodayPayables", "dueSoonPayables", "overdueReceivables", "negativeResult", "revenueDrop", "expenseRise", "reconPending"])
    assert.ok(codes.includes(c), `faltou ${c}`);
  assert.ok(!codes.includes("marginBelowTarget"), "sem meta de margem → sem alerta de margem");
  assert.ok(!codes.includes("budgetExceeded"), "sem orçamento → sem alerta de orçamento");
  // ordenado por severidade
  const order = { critical: 0, warning: 1, info: 2 };
  for (let i = 1; i < alerts.length; i++) assert.ok(order[alerts[i - 1].severity] <= order[alerts[i].severity]);
  // meta informada → alerta de margem
  const withTarget = buildAlerts({ overview, due, projection, budget, recon, thresholds: { marginTargetPct: 10 } });
  assert.ok(withTarget.some((a) => a.code === "marginBelowTarget"));
  // acesso: sem Contas a Pagar não vaza alerta do módulo
  const noPay = buildAlerts({ overview, due, projection, budget, recon, access: { payables: false } });
  assert.ok(!noPay.some((a) => /Payables/.test(a.code)));
});

test("alerta de saldo negativo e de projeção negativa (sem duplicar entre si)", () => {
  const neg = [out({ amount: 100 })];
  const mk = (txs, payables = []) => {
    const overview = buildResultOverview(txs, mes, TODAY);
    const projection = buildProjection(txs, payables, [], TODAY);
    return buildAlerts({
      overview, due: buildDueSummary(payables, [], TODAY), projection,
      budget: buildBudget(mes, TODAY, { costCenters: [], expenses: [], bills: [], taxes: [] }),
      recon: checkReconciliation(txs, mes, TODAY),
    }).map((a) => a.code);
  };
  const c1 = mk(neg);
  assert.ok(c1.includes("negativeBalance"));
  assert.ok(!c1.includes("projectedNegative"));
  const c2 = mk([tx({ amount: 100 })], buildPayables([{ id: "a", title: "x", dueDate: "2026-10-30", amount: 500, status: "pendente" }], [], []));
  assert.ok(c2.includes("projectedNegative"));
  assert.ok(!c2.includes("negativeBalance"));
});

test("alertas de orçamento: excedido (crítico) × próximo do limite (atenção)", () => {
  const base = (expAmount) => ({
    costCenters: [{ id: "c", name: "A", budgetsByMonth: { "2026-10": 100 } }],
    expenses: [{ id: "e", center: "A", date: "2026-10-02", amount: expAmount, status: "pago" }], bills: [], taxes: [],
  });
  const run = (amt) => {
    const budget = buildBudget(mes, TODAY, base(amt));
    return buildAlerts({
      overview: buildResultOverview([], mes, TODAY), due: buildDueSummary([], [], TODAY),
      projection: buildProjection([], [], [], TODAY), budget, recon: checkReconciliation([], mes, TODAY),
    });
  };
  assert.equal(run(120).find((a) => a.code === "budgetExceeded").severity, "critical");
  assert.equal(run(95).find((a) => a.code === "budgetNearLimit").severity, "warning");
  assert.equal(run(50).length, 0);
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
});
