// Restaurante — funções puras: unidades, ficha técnica (custo, margem, perda,
// rendimento), necessidade de insumos, faltas, transições, estorno, custo
// médio ponderado, alertas e produção de lote. Só dados FICTÍCIOS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { paraBase, deBase, custoParaBase, custoDeBase, unidadesCompativeis } from "../../lib/restaurante/unidades.ts";
import { quantidadeBruta, custoPrato, necessidadeFicha, verificarFaltas, validarFicha } from "../../lib/restaurante/ficha.ts";
import {
  custoMedioPonderado, nivelAlerta, deveAvisar, planejarBaixa, planejarEstorno, planejarEntrada, planejarAjuste, planejarLote,
} from "../../lib/restaurante/estoque.ts";
import {
  validarTransicao, proximoStatus, montarItens, necessidadePedido, estaAtrasado, agregarProducao,
} from "../../lib/restaurante/pedido.ts";
import { calcularAlertas } from "../../lib/restaurante/alertas.ts";
import { validarIngrediente, validarPrato, quantidadeBase } from "../../lib/restaurante/validate.ts";

const ing = (o) => ({ unidadeBase: "g", unidadeExibicao: "kg", minimo: 0, custoMedio: 0, preparo: false, ativo: true, saldo: 0, ...o });
const mapa = (lista) => new Map(lista.map((i) => [i.id, i]));

const FARINHA = ing({ id: "far", nome: "Farinha", saldo: 5000, custoMedio: 0.005 }); // R$ 5/kg
const QUEIJO = ing({ id: "qjo", nome: "Queijo", saldo: 1000, custoMedio: 0.04, minimo: 500 }); // R$ 40/kg
const TOMATE = ing({ id: "tom", nome: "Tomate", saldo: 300, custoMedio: 0.008 });
const OVO = ing({ id: "ovo", nome: "Ovo", unidadeBase: "un", unidadeExibicao: "un", saldo: 12, custoMedio: 0.8 });
const ATUAL = mapa([FARINHA, QUEIJO, TOMATE, OVO]);

// ─── Unidades ────────────────────────────────────────────────────────────────

test("unidades: kg↔g e L↔ml, incompatíveis devolvem null", () => {
  assert.equal(paraBase(1.5, "kg", "g"), 1500);
  assert.equal(paraBase(0.25, "L", "ml"), 250);
  assert.equal(paraBase(3, "un", "un"), 3);
  assert.equal(paraBase(1, "kg", "ml"), null);
  assert.equal(paraBase(1, "L", "g"), null);
  assert.equal(deBase(2500, "kg"), 2.5);
  assert.equal(deBase(750, "L"), 0.75);
  assert.equal(custoParaBase(40, "kg"), 0.04);
  assert.equal(custoDeBase(0.04, "kg"), 40);
  assert.deepEqual(unidadesCompativeis("ml"), ["ml", "L"]);
  // ponto flutuante: 0.1 kg + 0.2 kg não vira 300.00000000000006 g
  assert.equal(paraBase(0.1 + 0.2, "kg", "g"), 300);
});

test("quantidadeBase: valida e converte quantidades de movimento", () => {
  assert.equal(quantidadeBase("2", "kg", "g"), 2000);
  assert.equal(quantidadeBase(500, undefined, "g"), 500);
  assert.equal(typeof quantidadeBase(1, "L", "g"), "string");
  assert.equal(typeof quantidadeBase(0, "g", "g"), "string");
  assert.equal(quantidadeBase(0, "g", "g", { permitirZero: true }), 0);
  assert.equal(typeof quantidadeBase(-1, "g", "g"), "string");
});

// ─── Ficha técnica: custo, margem, perda, rendimento ─────────────────────────

test("perda %: bruto = líquido / (1 − perda)", () => {
  assert.equal(quantidadeBruta({ quantidade: 80, perdaPct: 20 }), 100);
  assert.equal(quantidadeBruta({ quantidade: 100 }), 100);
  assert.equal(quantidadeBruta({ quantidade: 50, perdaPct: 0 }), 50);
});

test("custo e margem do prato pela ficha (rendimento divide o custo)", () => {
  // Pizza que rende 2 porções: 300 g farinha (R$1,50) + 200 g queijo (R$8) + 80 g tomate líquido c/ 20% perda = 100 g bruto (R$0,80)
  const pizza = { preco: 30, rendimento: 2, ficha: [
    { ingredienteId: "far", quantidade: 300 },
    { ingredienteId: "qjo", quantidade: 200 },
    { ingredienteId: "tom", quantidade: 80, perdaPct: 20 },
  ] };
  const c = custoPrato(pizza, ATUAL);
  assert.equal(c.custoTotal, 10.3);
  assert.equal(c.custoPorcao, 5.15);
  assert.equal(c.margem.lucro, 24.85);
  assert.equal(c.margem.margemPct, 82.8);
  assert.equal(c.margem.cmvPct, 17.2);
  assert.deepEqual(c.semIngrediente, []);
  // preço zero: margem indefinida
  assert.equal(custoPrato({ ...pizza, preco: 0 }, ATUAL).margem.margemPct, null);
});

test("custo ignora (e aponta) ingrediente que não existe mais", () => {
  const c = custoPrato({ preco: 10, rendimento: 1, ficha: [{ ingredienteId: "far", quantidade: 100 }, { ingredienteId: "sumiu", quantidade: 5 }] }, ATUAL);
  assert.equal(c.custoTotal, 0.5);
  assert.deepEqual(c.semIngrediente, ["sumiu"]);
});

test("validarFicha: vazia ok, duplicado/quantidade/perda inválidos, preparo não entra em preparo", () => {
  const cat = mapa([FARINHA, QUEIJO, ing({ id: "molho", nome: "Molho", preparo: true })]);
  assert.deepEqual(validarFicha([], cat), { ok: true, ficha: [] });
  const dup = validarFicha([{ ingredienteId: "far", quantidade: 1 }, { ingredienteId: "far", quantidade: 2 }], cat);
  assert.equal(dup.ok, false);
  assert.equal(validarFicha([{ ingredienteId: "far", quantidade: 0 }], cat).ok, false);
  assert.equal(validarFicha([{ ingredienteId: "far", quantidade: 1, perdaPct: 95 }], cat).ok, false);
  assert.equal(validarFicha([{ ingredienteId: "xx", quantidade: 1 }], cat).ok, false);
  // prato pode usar preparo; receita de preparo não
  assert.equal(validarFicha([{ ingredienteId: "molho", quantidade: 50 }], cat).ok, true);
  assert.equal(validarFicha([{ ingredienteId: "molho", quantidade: 50 }], cat, { paraPreparo: "outro" }).ok, false);
});

test("validarPrato: não ativa com ficha vazia", () => {
  const cat = mapa([FARINHA]);
  const r = validarPrato({ nome: "Pão", preco: 5, ativo: true, ficha: [] }, cat);
  assert.equal(r.ok, false);
  assert.match(r.erro, /ficha técnica vazia/);
  assert.equal(validarPrato({ nome: "Pão", preco: 5, ativo: false, ficha: [] }, cat).ok, true);
  assert.equal(validarPrato({ nome: "Pão", preco: 5, ativo: true, ficha: [{ ingredienteId: "far", quantidade: 100 }] }, cat).ok, true);
});

test("validarIngrediente: converte mínimo/custo/saldo/rendimento da unidade de exibição para a base", () => {
  const r = validarIngrediente({ nome: "Molho", unidadeBase: "ml", unidadeExibicao: "L", minimo: 2, custo: 12, saldoInicial: 1.5, preparo: true,
    receita: [{ ingredienteId: "tom", quantidade: 1000 }], rendimento: 0.8 }, mapa([TOMATE]));
  assert.equal(r.ok, true);
  assert.equal(r.dados.minimo, 2000);
  assert.equal(r.dados.custoMedio, 0.012);
  assert.equal(r.dados.saldoInicial, 1500);
  assert.equal(r.dados.rendimento, 800);
  // unidade de exibição incompatível
  assert.equal(validarIngrediente({ nome: "X", unidadeBase: "g", unidadeExibicao: "L" }, new Map()).ok, false);
  // na edição a base não muda, mesmo que o corpo mande outra
  const e = validarIngrediente({ nome: "Farinha", unidadeBase: "ml", unidadeExibicao: "kg" }, new Map(), { id: "far", unidadeBase: "g" });
  assert.equal(e.ok, true);
  assert.equal(e.dados.unidadeBase, "g");
});

// ─── Necessidade de insumos de um pedido ─────────────────────────────────────

test("necessidade do pedido: soma itens, aplica perda e proporção do rendimento", () => {
  const pizza = { ficha: [{ ingredienteId: "far", quantidade: 300 }, { ingredienteId: "tom", quantidade: 80, perdaPct: 20 }], rendimento: 2 };
  const omelete = { ficha: [{ ingredienteId: "ovo", quantidade: 3 }, { ingredienteId: "tom", quantidade: 50 }], rendimento: 1 };
  const nec = necessidadePedido({ itens: [{ ...pizza, qtd: 3 }, { ...omelete, qtd: 2 }] });
  assert.equal(nec.get("far"), 450); // 300 × 3 / 2
  assert.equal(nec.get("tom"), 250); // 100 × 3 / 2 + 50 × 2
  assert.equal(nec.get("ovo"), 6);
  assert.deepEqual(necessidadeFicha(pizza.ficha, pizza.rendimento, 1), new Map([["far", 150], ["tom", 50]]));
});

test("faltas: lista exata (ingrediente, necessário, disponível, falta), em ordem alfabética", () => {
  const nec = new Map([["tom", 500], ["far", 100], ["ovo", 20], ["qjo", 1000]]);
  const faltas = verificarFaltas(nec, ATUAL);
  assert.deepEqual(faltas, [
    { ingredienteId: "ovo", nome: "Ovo", unidadeBase: "un", necessario: 20, disponivel: 12, falta: 8 },
    { ingredienteId: "tom", nome: "Tomate", unidadeBase: "g", necessario: 500, disponivel: 300, falta: 200 },
  ]);
  // saldo negativo conta como 0; inativo também
  const neg = verificarFaltas(new Map([["x", 1]]), mapa([ing({ id: "x", nome: "X", saldo: -5 })]));
  assert.equal(neg[0].disponivel, 0);
  const inat = verificarFaltas(new Map([["x", 1]]), mapa([ing({ id: "x", nome: "X", saldo: 50, ativo: false })]));
  assert.equal(inat.length, 1);
});

// ─── Baixa, estorno, entrada, ajuste ─────────────────────────────────────────

test("baixa: recusa com faltas; forçada deixa negativo; ok sem falta", () => {
  const nec = new Map([["tom", 500], ["far", 100]]);
  const recusa = planejarBaixa(nec, ATUAL);
  assert.equal(recusa.ok, false);
  assert.equal(recusa.faltas.length, 1);
  assert.equal(recusa.faltas[0].falta, 200);

  const forc = planejarBaixa(nec, ATUAL, { forcar: true });
  assert.equal(forc.ok, true);
  assert.equal(forc.forcada, true);
  const tom = forc.linhas.find((l) => l.ingredienteId === "tom");
  assert.equal(tom.saldoDepois, -200);
  assert.equal(tom.delta, -500);

  const ok = planejarBaixa(new Map([["far", 100]]), ATUAL);
  assert.equal(ok.ok, true);
  assert.equal(ok.forcada, false);
  assert.deepEqual(ok.baixa, [{ ingredienteId: "far", nome: "Farinha", quantidade: 100, custoUnit: 0.005 }]);
  // ingrediente inexistente nunca é baixado, nem forçado
  assert.equal(planejarBaixa(new Map([["sumiu", 1]]), ATUAL, { forcar: true }).ok, false);
});

test("estorno devolve exatamente o que a baixa tirou; perda não mexe no saldo", () => {
  const baixa = [{ ingredienteId: "far", nome: "Farinha", quantidade: 450, custoUnit: 0.005 }, { ingredienteId: "sumiu", nome: "?", quantidade: 1, custoUnit: 0 }];
  const depois = mapa([{ ...FARINHA, saldo: 4550 }]);
  const est = planejarEstorno(baixa, depois);
  assert.equal(est.linhas.length, 1);
  assert.equal(est.linhas[0].delta, 450);
  assert.equal(est.linhas[0].saldoDepois, 5000);
  assert.deepEqual(est.ignorados, ["sumiu"]);
  const perda = planejarEstorno(baixa, depois, { perda: true });
  assert.equal(perda.linhas[0].delta, 0);
  assert.equal(perda.linhas[0].quantidade, 450);
  assert.equal(perda.linhas[0].saldoDepois, 4550);
});

test("custo médio ponderado", () => {
  // 1 kg a R$ 40/kg + 1 kg a R$ 50/kg → R$ 45/kg
  assert.equal(custoMedioPonderado(1000, 0.04, 1000, 0.05), 0.045);
  // saldo zerado ou negativo: vale o custo da entrada
  assert.equal(custoMedioPonderado(0, 0.04, 500, 0.06), 0.06);
  assert.equal(custoMedioPonderado(-200, 0.04, 500, 0.06), 0.06);
  const e = planejarEntrada(QUEIJO, 1000, 50); // 1 kg por R$ 50
  assert.equal(e.saldoDepois, 2000);
  assert.equal(e.custoUnit, 0.05);
  assert.equal(e.custoMedioDepois, 0.045);
});

test("ajuste por contagem e perda", () => {
  const a = planejarAjuste(TOMATE, { novoSaldo: 250 });
  assert.equal(a.delta, -50);
  assert.equal(a.saldoDepois, 250);
  const p = planejarAjuste(TOMATE, { perda: 30 });
  assert.equal(p.delta, -30);
  assert.equal(p.saldoDepois, 270);
});

test("nível de alerta e anti-spam: só avisa quando piora", () => {
  assert.equal(nivelAlerta(0, 100), "zerado");
  assert.equal(nivelAlerta(-3, 0), "zerado");
  assert.equal(nivelAlerta(100, 100), "baixo");
  assert.equal(nivelAlerta(101, 100), "ok");
  assert.equal(nivelAlerta(5, 0), "ok");
  assert.equal(deveAvisar("ok", "baixo"), true);
  assert.equal(deveAvisar("baixo", "baixo"), false);
  assert.equal(deveAvisar("baixo", "zerado"), true);
  assert.equal(deveAvisar("zerado", "baixo"), false);
  assert.equal(deveAvisar(undefined, "zerado"), true);
});

// ─── Pedido: transições, itens, atraso ───────────────────────────────────────

test("transições: segue o fluxo, não pula nem volta; reenvio é noop", () => {
  assert.equal(validarTransicao("recebido", "em_preparo"), "ok");
  assert.equal(validarTransicao("em_preparo", "pronto"), "ok");
  assert.equal(validarTransicao("pronto", "entregue"), "ok");
  assert.equal(validarTransicao("recebido", "pronto"), "invalida");
  assert.equal(validarTransicao("pronto", "em_preparo"), "invalida");
  assert.equal(validarTransicao("entregue", "cancelado"), "invalida");
  assert.equal(validarTransicao("cancelado", "recebido"), "invalida");
  for (const s of ["recebido", "em_preparo", "pronto"]) assert.equal(validarTransicao(s, "cancelado"), "ok");
  assert.equal(validarTransicao("em_preparo", "em_preparo"), "noop");
  assert.equal(proximoStatus("recebido"), "em_preparo");
  assert.equal(proximoStatus("pronto"), "entregue");
  assert.equal(proximoStatus("entregue"), null);
});

test("montarItens: preço/custo vêm do cardápio, não do client", () => {
  const pratos = new Map([
    ["p1", { id: "p1", nome: "Pizza", preco: 30, categoria: "", ativo: true, rendimento: 2, ficha: [{ ingredienteId: "far", quantidade: 300 }] }],
    ["p2", { id: "p2", nome: "Velho", preco: 10, categoria: "", ativo: false, rendimento: 1, ficha: [{ ingredienteId: "far", quantidade: 1 }] }],
  ]);
  const r = montarItens([{ pratoId: "p1", qtd: 2, preco: 0.01, custoUnit: 0, obs: " sem cebola " }], pratos, ATUAL);
  assert.equal(r.ok, true);
  assert.equal(r.itens[0].preco, 30);
  assert.equal(r.itens[0].custoUnit, 0.75);
  assert.equal(r.itens[0].obs, "sem cebola");
  assert.equal(r.total, 60);
  assert.equal(r.custoTotal, 1.5);
  assert.equal(montarItens([{ pratoId: "p2", qtd: 1 }], pratos, ATUAL).ok, false);
  assert.equal(montarItens([{ pratoId: "p1", qtd: 0 }], pratos, ATUAL).ok, false);
  assert.equal(montarItens([{ pratoId: "p1", qtd: 1.5 }], pratos, ATUAL).ok, false);
  assert.equal(montarItens([], pratos, ATUAL).ok, false);
});

test("atraso por status", () => {
  const t0 = 1_000_000;
  const p = { status: "recebido", criadoEm: t0, transicoes: { recebido: { em: t0 } } };
  assert.equal(estaAtrasado(p, t0 + 9 * 60_000), false);
  assert.equal(estaAtrasado(p, t0 + 10 * 60_000), true);
  assert.equal(estaAtrasado({ ...p, status: "entregue" }, t0 + 999 * 60_000), false);
});

// ─── Alertas ─────────────────────────────────────────────────────────────────

test("alertas: sem saldo, abaixo do mínimo, não cobre pedidos abertos e prato indisponível", () => {
  const ingredientes = [
    ing({ id: "a", nome: "Alho", saldo: 0 }),
    ing({ id: "b", nome: "Batata", saldo: 400, minimo: 500 }),
    ing({ id: "c", nome: "Carne", saldo: 1000 }),
    ing({ id: "d", nome: "Desativado", saldo: 0, ativo: false }),
  ];
  const pratos = [
    { id: "p1", nome: "Bife", preco: 40, categoria: "", ativo: true, rendimento: 1, ficha: [{ ingredienteId: "c", quantidade: 300 }] },
    { id: "p2", nome: "Alho frito", preco: 10, categoria: "", ativo: true, rendimento: 1, ficha: [{ ingredienteId: "a", quantidade: 20 }] },
    { id: "p3", nome: "Inativo", preco: 10, categoria: "", ativo: false, rendimento: 1, ficha: [{ ingredienteId: "a", quantidade: 20 }] },
  ];
  const bife = { ficha: pratos[0].ficha, rendimento: 1 };
  const pedidos = [
    { status: "recebido", baixaFeita: false, itens: [{ ...bife, qtd: 4 }] }, // 1200 g > 1000 g
    { status: "em_preparo", baixaFeita: true, itens: [{ ...bife, qtd: 10 }] }, // já baixado: não conta
  ];
  const r = calcularAlertas(ingredientes, pratos, pedidos);
  assert.deepEqual(r.ingredientes.map((a) => [a.tipo, a.nome]), [
    ["sem_saldo", "Alho"],
    ["nao_cobre_pedidos", "Carne"],
    ["abaixo_minimo", "Batata"],
  ]);
  assert.equal(r.ingredientes[1].necessario, 1200);
  assert.deepEqual(r.pratosIndisponiveis, [{ pratoId: "p2", nome: "Alho frito", faltam: [{ ingredienteId: "a", nome: "Alho" }] }]);
  assert.equal(r.total, 4);
});

// ─── Produção ────────────────────────────────────────────────────────────────

test("lote de preparo: consome a receita na proporção do rendimento e entra com custo do lote", () => {
  // Molho: receita de 1000 g tomate (c/ 20% perda → 1250 g bruto) rende 800 ml.
  const molho = ing({ id: "molho", nome: "Molho", unidadeBase: "ml", unidadeExibicao: "L", preparo: true, saldo: 200, custoMedio: 0.01,
    receita: [{ ingredienteId: "tom", quantidade: 1000, perdaPct: 20 }], rendimento: 800 });
  const ings = mapa([molho, { ...TOMATE, saldo: 2000 }]);
  const l = planejarLote(molho, 400, ings); // meia receita → 625 g de tomate
  assert.equal(l.ok, true);
  assert.equal(l.consumo.linhas[0].delta, -625);
  assert.equal(l.consumo.linhas[0].saldoDepois, 1375);
  assert.equal(l.custoLote, 5); // 625 × 0,008
  assert.equal(l.custoUnit, 0.0125);
  assert.equal(l.entrada.saldoDepois, 600);
  // médio: (200 × 0,01 + 400 × 0,0125) / 600
  assert.equal(l.entrada.custoMedioDepois, 0.011667);

  const falta = planejarLote(molho, 4000, ings);
  assert.equal(falta.ok, false);
  assert.equal(falta.faltas[0].necessario, 6250);
  assert.equal(planejarLote(molho, 4000, ings, { forcar: true }).ok, true);
  assert.equal(planejarLote({ ...molho, receita: [] }, 10, ings).ok, false);
  assert.equal(planejarLote({ ...TOMATE }, 10, ings).ok, false);
});

test("produção: agrega pratos dos pedidos abertos e insumos só dos ainda não baixados", () => {
  const pizza = { pratoId: "p1", nome: "Pizza", ficha: [{ ingredienteId: "far", quantidade: 300 }], rendimento: 1 };
  const r = agregarProducao([
    { status: "recebido", baixaFeita: false, itens: [{ ...pizza, qtd: 2 }] },
    { status: "em_preparo", baixaFeita: true, itens: [{ ...pizza, qtd: 1 }] },
    { status: "pronto", baixaFeita: true, itens: [{ ...pizza, qtd: 5 }] },
  ], mapa([{ ...FARINHA, saldo: 500 }]));
  assert.deepEqual(r.pratos, [{ pratoId: "p1", nome: "Pizza", recebido: 2, emPreparo: 1, total: 3 }]);
  assert.equal(r.insumos[0].necessario, 600);
  assert.equal(r.insumos[0].falta, 100);
  assert.equal(r.faltas.length, 1);
});
