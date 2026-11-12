// Restaurante — fluxos transacionais contra um Firestore em memória: baixa
// única (idempotente) em recebido→em_preparo, recusa com lista de faltas,
// baixa forçada com motivo, estorno/perda no cancelamento, nº sequencial,
// lote de produção, anti-spam do aviso e bloqueios de exclusão.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createFakeFirestore } from "../support/fakeFirestore.mjs";
import {
  criarIngrediente, atualizarIngrediente, excluirIngrediente, registrarEntrada, registrarAjuste,
  criarPrato, atualizarPrato, excluirPrato, criarPedido, editarPedido, mudarStatus, registrarLote, RestError, COL,
} from "../../lib/restaurante/service.ts";

const OWNER = "dono1";
let db;
let ctx;
let relogio;
beforeEach(() => {
  db = createFakeFirestore();
  relogio = 1_700_000_000_000;
  ctx = { db, ownerUid: OWNER, actor: { uid: "u1", name: "Chef" }, agora: () => relogio };
});

const path = (col, id) => `users/${OWNER}/${COL[col]}/${id}`;
const doc = (col, id) => db.store.get(path(col, id));
const movimentos = () => [...db.store.entries()].filter(([p]) => p.startsWith(`users/${OWNER}/${COL.movimentos}/`)).map(([, d]) => d);
const rejeita = async (p, code) => {
  try { await p; } catch (e) { assert.ok(e instanceof RestError, String(e)); assert.equal(e.code, code); return e; }
  assert.fail(`esperava erro ${code}`);
};

async function montarCardapio() {
  const { id: far } = await criarIngrediente(ctx, { nome: "Farinha", unidadeBase: "g", unidadeExibicao: "kg", custo: 5, saldoInicial: 1, minimo: 0.5 });
  const { id: qjo } = await criarIngrediente(ctx, { nome: "Queijo", unidadeBase: "g", unidadeExibicao: "kg", custo: 40, saldoInicial: 0.5 });
  const { id: pizza } = await criarPrato(ctx, { nome: "Pizza", preco: 30, ativo: true, rendimento: 1, ficha: [
    { ingredienteId: far, quantidade: 300 },
    { ingredienteId: qjo, quantidade: 200 },
  ] });
  return { far, qjo, pizza };
}

test("cadastro: saldo inicial vira movimento de entrada com custo; base em g", async () => {
  const { far } = await montarCardapio();
  const f = doc("ingredientes", far);
  assert.equal(f.saldo, 1000);
  assert.equal(f.custoMedio, 0.005);
  assert.equal(f.minimo, 500);
  assert.equal(f.temMovimentos, true);
  assert.equal(f.alertaNivel, "ok");
  const m = movimentos().find((x) => x.ingredienteId === far);
  assert.equal(m.tipo, "entrada");
  assert.equal(m.delta, 1000);
  assert.equal(m.motivo, "Saldo inicial");
  await rejeita(criarIngrediente(ctx, { nome: "farinha", unidadeBase: "g" }), "duplicate");
});

test("pedido: número sequencial e preço do cardápio (não do client)", async () => {
  const { pizza } = await montarCardapio();
  const a = await criarPedido(ctx, { origem: "balcao", itens: [{ pratoId: pizza, qtd: 1, preco: 0.01 }] });
  const b = await criarPedido(ctx, { origem: "mesa", mesa: "7", itens: [{ pratoId: pizza, qtd: 2 }] });
  assert.equal(a.numero, 1);
  assert.equal(b.numero, 2);
  assert.equal(doc("pedidos", a.id).total, 30);
  assert.equal(doc("pedidos", b.id).total, 60);
  assert.equal(doc("pedidos", b.id).status, "recebido");
  assert.equal(doc("pratos", pizza).jaPedido, true);
  await rejeita(criarPedido(ctx, { origem: "mesa", itens: [{ pratoId: pizza, qtd: 1 }] }), "validation");
});

test("baixa acontece UMA vez em recebido→em_preparo (reenvio é noop)", async () => {
  const { far, qjo, pizza } = await montarCardapio();
  const { id } = await criarPedido(ctx, { itens: [{ pratoId: pizza, qtd: 2 }] });
  const r1 = await mudarStatus(ctx, id, "em_preparo");
  assert.equal(r1.noop, false);
  assert.equal(doc("ingredientes", far).saldo, 400);
  assert.equal(doc("ingredientes", qjo).saldo, 100);
  const p = doc("pedidos", id);
  assert.equal(p.baixaFeita, true);
  assert.equal(p.status, "em_preparo");
  assert.equal(p.transicoes.em_preparo.nome, "Chef");
  assert.deepEqual(p.baixa.map((b) => [b.ingredienteId, b.quantidade]).sort(), [[far, 600], [qjo, 400]].sort());
  const qtdMov = movimentos().length;

  const r2 = await mudarStatus(ctx, id, "em_preparo");
  assert.equal(r2.noop, true);
  assert.equal(doc("ingredientes", far).saldo, 400);
  assert.equal(movimentos().length, qtdMov);

  // concorrência: duas transições "simultâneas" de outro pedido baixam uma vez só
  await registrarEntrada(ctx, { ingredienteId: qjo, quantidade: 1, unidade: "kg", custoTotal: 40 });
  const { id: id2 } = await criarPedido(ctx, { itens: [{ pratoId: pizza, qtd: 1 }] });
  const [x, y] = await Promise.all([mudarStatus(ctx, id2, "em_preparo"), mudarStatus(ctx, id2, "em_preparo")]);
  assert.equal([x.noop, y.noop].filter(Boolean).length, 1);
  assert.equal(doc("ingredientes", far).saldo, 100);
});

test("não pula nem volta etapas", async () => {
  const { pizza } = await montarCardapio();
  const { id } = await criarPedido(ctx, { itens: [{ pratoId: pizza, qtd: 1 }] });
  await rejeita(mudarStatus(ctx, id, "pronto"), "invalidStatus");
  await mudarStatus(ctx, id, "em_preparo");
  await mudarStatus(ctx, id, "pronto");
  await rejeita(mudarStatus(ctx, id, "em_preparo"), "invalidStatus");
  await mudarStatus(ctx, id, "entregue");
  await rejeita(mudarStatus(ctx, id, "cancelado"), "invalidStatus");
  await rejeita(mudarStatus(ctx, id, "xyz"), "validation");
  // id com "/" (tentativa de mudar o caminho) ou vazio
  await rejeita(mudarStatus(ctx, "../../outro/restPedidos/x", "em_preparo"), "notFound");
  await rejeita(mudarStatus(ctx, "", "em_preparo"), "notFound");
});

test("falta de insumo: recusa com lista exata; forçar exige motivo e deixa saldo negativo", async () => {
  const { far, qjo, pizza } = await montarCardapio();
  const { id } = await criarPedido(ctx, { itens: [{ pratoId: pizza, qtd: 3 }] }); // queijo: 600 > 500
  const e = await rejeita(mudarStatus(ctx, id, "em_preparo"), "faltaInsumo");
  assert.deepEqual(e.faltas, [{ ingredienteId: qjo, nome: "Queijo", unidadeBase: "g", necessario: 600, disponivel: 500, falta: 100 }]);
  assert.equal(doc("pedidos", id).status, "recebido");
  assert.equal(doc("ingredientes", far).saldo, 1000); // nada foi gravado

  await rejeita(mudarStatus(ctx, id, "em_preparo", { forcar: true }), "reasonRequired");
  await mudarStatus(ctx, id, "em_preparo", { forcar: true, motivo: "Queijo chegou e não foi lançado" });
  assert.equal(doc("ingredientes", qjo).saldo, -100);
  const p = doc("pedidos", id);
  assert.equal(p.baixaForcada, true);
  const mq = movimentos().find((m) => m.ingredienteId === qjo && m.tipo === "baixa_forcada");
  assert.equal(mq.motivo, "Queijo chegou e não foi lançado");
  assert.equal(mq.pedidoNumero, 1);
});

test("cancelar após a baixa devolve o estoque (estorno); com perda mantém baixado; antes da baixa não mexe", async () => {
  const { far, pizza } = await montarCardapio();
  const a = await criarPedido(ctx, { itens: [{ pratoId: pizza, qtd: 1 }] });
  await mudarStatus(ctx, a.id, "em_preparo");
  assert.equal(doc("ingredientes", far).saldo, 700);
  await mudarStatus(ctx, a.id, "cancelado");
  assert.equal(doc("ingredientes", far).saldo, 1000);
  assert.equal(doc("pedidos", a.id).destinoBaixa, "estorno");
  assert.ok(movimentos().some((m) => m.tipo === "estorno" && m.pedidoId === a.id && m.delta === 300));
  // cancelar de novo: noop, sem segundo estorno
  assert.equal((await mudarStatus(ctx, a.id, "cancelado")).noop, true);
  assert.equal(doc("ingredientes", far).saldo, 1000);

  const b = await criarPedido(ctx, { itens: [{ pratoId: pizza, qtd: 1 }] });
  await mudarStatus(ctx, b.id, "em_preparo");
  await mudarStatus(ctx, b.id, "pronto");
  await mudarStatus(ctx, b.id, "cancelado", { perda: true, motivo: "Cliente desistiu, pizza descartada" });
  assert.equal(doc("ingredientes", far).saldo, 700);
  assert.equal(doc("pedidos", b.id).destinoBaixa, "perda");
  assert.ok(movimentos().some((m) => m.tipo === "perda_pedido" && m.pedidoId === b.id && m.delta === 0 && m.quantidade === 300));

  const c = await criarPedido(ctx, { itens: [{ pratoId: pizza, qtd: 1 }] });
  const antes = movimentos().length;
  await mudarStatus(ctx, c.id, "cancelado");
  assert.equal(movimentos().length, antes);
  assert.equal(doc("ingredientes", far).saldo, 700);
});

test("editar pedido só enquanto recebido", async () => {
  const { pizza } = await montarCardapio();
  const { id } = await criarPedido(ctx, { itens: [{ pratoId: pizza, qtd: 1 }] });
  await editarPedido(ctx, id, { origem: "delivery", cliente: "Ana", itens: [{ pratoId: pizza, qtd: 3 }] });
  assert.equal(doc("pedidos", id).total, 90);
  assert.equal(doc("pedidos", id).numero, 1);
  await mudarStatus(ctx, id, "cancelado");
  await rejeita(editarPedido(ctx, id, { itens: [{ pratoId: pizza, qtd: 1 }] }), "invalidStatus");
});

test("aviso de WhatsApp: cruzamento só quando piora (anti-spam) e reseta ao repor", async () => {
  const { far, pizza } = await montarCardapio(); // farinha 1000 g, mínimo 500 g
  const p1 = await criarPedido(ctx, { itens: [{ pratoId: pizza, qtd: 1 }] });
  assert.deepEqual((await mudarStatus(ctx, p1.id, "em_preparo")).cruzamentos, []); // 700
  const p2 = await criarPedido(ctx, { itens: [{ pratoId: pizza, qtd: 1 }] });
  const c2 = (await mudarStatus(ctx, p2.id, "em_preparo")).cruzamentos; // 400 → baixo
  assert.deepEqual(c2.map((c) => [c.ingredienteId, c.nivel]), [[far, "baixo"]]);
  // reposição pequena, continua baixo; nova baixa continua baixo → sem novo aviso
  await registrarEntrada(ctx, { ingredienteId: far, quantidade: 50, unidade: "g", custoTotal: 0.25 });
  const p3 = await criarPedido(ctx, { itens: [{ pratoId: pizza, qtd: 1 }] });
  await rejeita(mudarStatus(ctx, p3.id, "em_preparo"), "faltaInsumo"); // queijo acabou (100 < 200)
  await registrarEntrada(ctx, { ingredienteId: (await idDe("Queijo")), quantidade: 1, unidade: "kg", custoTotal: 40 });
  const c3 = (await mudarStatus(ctx, p3.id, "em_preparo")).cruzamentos; // farinha 150: ainda baixo
  assert.equal(c3.some((c) => c.ingredienteId === far), false);
  // repõe acima do mínimo (reseta) e cruza de novo → avisa de novo
  await registrarEntrada(ctx, { ingredienteId: far, quantidade: 1, unidade: "kg", custoTotal: 5 }); // 1150
  assert.equal(doc("ingredientes", far).alertaNivel, "ok");
  await registrarAjuste(ctx, { ingredienteId: far, tipo: "perda", quantidade: 1150, unidade: "g", motivo: "Saco furou" });
  assert.equal(doc("ingredientes", far).alertaNivel, "zerado");
});

async function idDe(nome) {
  for (const [p, d] of db.store) if (p.includes(`/${COL.ingredientes}/`) && d.nome === nome) return p.split("/").pop();
  return "";
}

test("entrada recalcula custo médio ponderado; ajuste exige motivo", async () => {
  const { qjo } = await montarCardapio(); // 500 g a R$ 0,04/g
  await registrarEntrada(ctx, { ingredienteId: qjo, quantidade: 0.5, unidade: "kg", custoTotal: 25 }); // R$ 0,05/g
  assert.equal(doc("ingredientes", qjo).saldo, 1000);
  assert.equal(doc("ingredientes", qjo).custoMedio, 0.045);
  await rejeita(registrarEntrada(ctx, { ingredienteId: qjo, quantidade: 1, unidade: "L", custoTotal: 1 }), "validation");
  await rejeita(registrarAjuste(ctx, { ingredienteId: qjo, quantidade: 900, unidade: "g" }), "reasonRequired");
  await registrarAjuste(ctx, { ingredienteId: qjo, quantidade: 900, unidade: "g", motivo: "Inventário semanal" });
  assert.equal(doc("ingredientes", qjo).saldo, 900);
  assert.ok(movimentos().some((m) => m.tipo === "ajuste" && m.delta === -100 && m.motivo === "Inventário semanal"));
});

test("lote de produção: baixa insumos da receita e soma ao preparo", async () => {
  const { id: tom } = await criarIngrediente(ctx, { nome: "Tomate", unidadeBase: "g", unidadeExibicao: "kg", custo: 8, saldoInicial: 2 });
  const { id: molho } = await criarIngrediente(ctx, { nome: "Molho", unidadeBase: "ml", unidadeExibicao: "L", preparo: true,
    receita: [{ ingredienteId: tom, quantidade: 1000, perdaPct: 20 }], rendimento: 0.8 });
  const { id: loteId } = await registrarLote(ctx, { ingredienteId: molho, quantidade: 0.4, unidade: "L" });
  assert.equal(doc("ingredientes", tom).saldo, 1375);
  assert.equal(doc("ingredientes", molho).saldo, 400);
  assert.equal(doc("ingredientes", molho).custoMedio, 0.0125);
  const lote = doc("lotes", loteId);
  assert.equal(lote.custoLote, 5);
  assert.equal(lote.ator.nome, "Chef");
  assert.ok(movimentos().some((m) => m.tipo === "producao_consumo" && m.loteId === loteId && m.delta === -625));
  assert.ok(movimentos().some((m) => m.tipo === "producao_entrada" && m.loteId === loteId && m.delta === 400));
  const e = await rejeita(registrarLote(ctx, { ingredienteId: molho, quantidade: 2, unidade: "L" }), "faltaInsumo");
  assert.equal(e.faltas[0].falta, 3125 - 1375);
  await rejeita(registrarLote(ctx, { ingredienteId: tom, quantidade: 1, unidade: "kg" }), "validation");
});

test("exclusão: bloqueada com ficha/movimento/pedido; inativar continua possível", async () => {
  const { far, pizza } = await montarCardapio();
  await rejeita(excluirIngrediente(ctx, far), "inUse"); // está na ficha da pizza
  const { id: sal } = await criarIngrediente(ctx, { nome: "Sal", unidadeBase: "g", saldoInicial: 100 });
  await rejeita(excluirIngrediente(ctx, sal), "inUse"); // tem movimento (saldo inicial)
  const { id: novo } = await criarIngrediente(ctx, { nome: "Orégano", unidadeBase: "g" });
  await excluirIngrediente(ctx, novo);
  assert.equal(doc("ingredientes", novo), undefined);
  await atualizarIngrediente(ctx, sal, { nome: "Sal", unidadeExibicao: "g", ativo: false });
  assert.equal(doc("ingredientes", sal).ativo, false);

  await criarPedido(ctx, { itens: [{ pratoId: pizza, qtd: 1 }] });
  await rejeita(excluirPrato(ctx, pizza), "inUse");
  const { id: rascunho } = await criarPrato(ctx, { nome: "Rascunho", preco: 10, ativo: false, ficha: [] });
  await rejeita(atualizarPrato(ctx, rascunho, { nome: "Rascunho", preco: 10, ativo: true, ficha: [] }), "validation");
  await excluirPrato(ctx, rascunho);
  assert.equal(doc("pratos", rascunho), undefined);
});

test("preparo não pode virar insumo de outro preparo (sem recursão)", async () => {
  const { id: tom } = await criarIngrediente(ctx, { nome: "Tomate", unidadeBase: "g" });
  const { id: molho } = await criarIngrediente(ctx, { nome: "Molho", unidadeBase: "ml", preparo: true, receita: [{ ingredienteId: tom, quantidade: 100 }], rendimento: 80 });
  await rejeita(criarIngrediente(ctx, { nome: "Lasanha base", unidadeBase: "g", preparo: true, receita: [{ ingredienteId: molho, quantidade: 10 }], rendimento: 10 }), "validation");
  await rejeita(atualizarIngrediente(ctx, tom, { nome: "Tomate", preparo: true, receita: [], rendimento: 0 }), "conflict");
});
