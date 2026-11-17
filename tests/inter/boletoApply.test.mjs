// Banco Inter: núcleo "aplicar situação" do boleto (lib/interBoletoApply.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeFirestore } from "../support/fakeFirestore.mjs";
import { aplicarSituacao } from "../../lib/interBoletoApply";

const OWNER = "o1";
const ACTOR = { uid: "u1", name: "Ana" };
const NOW = Date.parse("2026-11-18T15:00:00Z");
const P = `users/${OWNER}`;

const boleto = (o = {}) => ({
  id: "b1",
  payer: { nome: "Cliente X", doc: "12345678909", endereco: { cep: "01001000" } },
  amount: 100,
  dueDate: "2026-11-20",
  codigoSolicitacao: "c1",
  situacao: "A_RECEBER",
  createdAt: "2026-11-01T10:00:00Z",
  createdBy: "u1",
  ...o,
});

const pago = (o = {}) => ({
  codigoSolicitacao: "c1",
  situacao: "RECEBIDO",
  valorTotalRecebido: 100,
  dataPagamento: "2026-11-18",
  origemRecebimento: "BOLETO",
  ...o,
});

const receivable = (o = {}) => ({
  title: "Consultoria novembro",
  partyName: "Cliente X",
  amount: 100,
  amountReceived: 0,
  status: "pendente",
  category: "Serviços",
  dueDate: "2026-11-20",
  ...o,
});

const pendente = (o = {}) => ({
  txKey: "id:1",
  date: "2026-11-18",
  amount: 100,
  type: "entrada",
  description: "BOLETO RECEBIDO",
  status: "pendente",
  createdAt: NOW,
  ...o,
});

function setup({ b = boleto(), rec, pendentes = [], cash = [] } = {}) {
  const db = createFakeFirestore();
  db.store.set(`${P}/boletos/b1`, b);
  if (rec) db.store.set(`${P}/receivables/r1`, rec);
  for (const p of pendentes) db.store.set(`${P}/interPendentes/${p.txKey}`, p);
  for (const [id, c] of cash) db.store.set(`${P}/cashflow/${id}`, c);
  return db;
}

const get = (db, path) => db.store.get(`${P}/${path}`);
const cashIds = (db) => [...db.store.keys()].filter((k) => k.startsWith(`${P}/cashflow/`)).map((k) => k.split("/").pop());
const apply = (db, remoto) => aplicarSituacao(db, OWNER, "b1", remoto, ACTOR, NOW);

// ---------- pago → caixa ----------

test("RECEBIDO cria 1 entrada de valorRecebido com boletoId e marca o boleto", async () => {
  const db = setup();
  const r = await apply(db, pago({ valorTotalRecebido: 100 }));
  assert.deepEqual(r, { aplicada: true, pago: true });
  assert.deepEqual(cashIds(db), ["boleto_b1"]);
  const e = get(db, "cashflow/boleto_b1");
  assert.equal(e.type, "entrada");
  assert.equal(e.amount, 100);
  assert.equal(e.date, "2026-11-18");
  assert.equal(e.boletoId, "b1");
  assert.equal(e.createdAt, NOW);
  assert.equal(e.createdBy, "u1");
  assert.equal(e.createdByName, "Ana");
  const b = get(db, "boletos/b1");
  assert.equal(b.situacao, "RECEBIDO");
  assert.equal(b.cashflowId, "boleto_b1");
  assert.equal(b.valorRecebido, 100);
  assert.equal(b.paidAt, "2026-11-18");
  assert.equal(b.origemRecebimento, "BOLETO");
  assert.equal(b.pagoAposCancelamento, undefined);
});

test("mesmo RECEBIDO aplicado 2× → 1 entrada e amountReceived somado 1×", async () => {
  const db = setup({ b: boleto({ receivableId: "r1" }), rec: receivable() });
  assert.deepEqual(await apply(db, pago()), { aplicada: true, pago: true });
  assert.deepEqual(await apply(db, pago()), { aplicada: false, pago: false });
  assert.deepEqual(await apply(db, pago({ situacao: "MARCADO_RECEBIDO" })), { aplicada: false, pago: false });
  assert.deepEqual(cashIds(db), ["boleto_b1"]);
  assert.equal(get(db, "receivables/r1").amountReceived, 100);
});

test("RECEBIDO aplicado em paralelo → 1 entrada só", async () => {
  const db = setup({ b: boleto({ receivableId: "r1" }), rec: receivable() });
  const rs = await Promise.allSettled([apply(db, pago()), apply(db, pago())]);
  assert.equal(rs.filter((x) => x.status === "fulfilled" && x.value.pago).length, 1);
  assert.deepEqual(cashIds(db), ["boleto_b1"]);
  assert.equal(get(db, "receivables/r1").amountReceived, 100);
});

test("RECEBIDO depois CANCELADO → continua pago", async () => {
  const db = setup();
  await apply(db, pago());
  const r = await apply(db, { codigoSolicitacao: "c1", situacao: "CANCELADO" });
  assert.deepEqual(r, { aplicada: false, pago: false });
  assert.equal(get(db, "boletos/b1").situacao, "RECEBIDO");
  assert.deepEqual(cashIds(db), ["boleto_b1"]);
});

test("valor recebido maior que o nominal → entrada com o recebido e conta a receber recebida", async () => {
  const db = setup({ b: boleto({ receivableId: "r1" }), rec: receivable() });
  await apply(db, pago({ valorTotalRecebido: 105.5 }));
  assert.equal(get(db, "cashflow/boleto_b1").amount, 105.5);
  const rec = get(db, "receivables/r1");
  assert.equal(rec.amountReceived, 105.5);
  assert.equal(rec.status, "recebido");
  assert.equal(rec.receivedAt, "2026-11-18");
  assert.equal(rec.settledBy, "u1");
  assert.equal(rec.settledByName, "Ana");
  assert.equal(rec.settledAt, NOW);
});

test("valor recebido menor → amountReceived parcial e status não vira recebido", async () => {
  const db = setup({ b: boleto({ receivableId: "r1" }), rec: receivable({ amountReceived: 10 }) });
  await apply(db, pago({ valorTotalRecebido: 40.1 }));
  const rec = get(db, "receivables/r1");
  assert.equal(rec.amountReceived, 50.1);
  assert.equal(rec.status, "pendente");
  assert.equal(rec.receivedAt, undefined);
});

test("parcial que completa o total (centavos) → recebido", async () => {
  const db = setup({ b: boleto({ receivableId: "r1" }), rec: receivable({ amount: 100.3, amountReceived: 0.1 }) });
  await apply(db, pago({ valorTotalRecebido: 100.2 }));
  const rec = get(db, "receivables/r1");
  assert.equal(rec.amountReceived, 100.3);
  assert.equal(rec.status, "recebido");
});

test("vinculado à conta a receber → descrição = título, categoria do CAT_TO_CASHFLOW, settledReceivableId", async () => {
  const db = setup({ b: boleto({ receivableId: "r1" }), rec: receivable({ category: "Clientes" }) });
  await apply(db, pago());
  const e = get(db, "cashflow/boleto_b1");
  assert.equal(e.description, "Consultoria novembro");
  assert.equal(e.category, "Vendas");
  assert.equal(e.settledReceivableId, "r1");
});

test("avulso → categoria Outros recebimentos, sem settledReceivableId", async () => {
  const db = setup();
  await apply(db, pago());
  const e = get(db, "cashflow/boleto_b1");
  assert.equal(e.category, "Outros recebimentos");
  assert.equal(e.description, "Boleto · Cliente X");
  assert.equal("settledReceivableId" in e, false);
});

test("valor e data arredondados: centavos e YYYY-MM-DD", async () => {
  const db = setup();
  await apply(db, pago({ valorTotalRecebido: 99.999 }));
  assert.equal(get(db, "cashflow/boleto_b1").amount, 100);
});

// ---------- extrato ----------

test("item de extrato pendente único → conciliado com cashflowId e lançamento ganha interTxId", async () => {
  const db = setup({ pendentes: [pendente({ date: "2026-11-20" })] });
  await apply(db, pago());
  const p = get(db, "interPendentes/id:1");
  assert.equal(p.status, "conciliado");
  assert.equal(p.cashflowId, "boleto_b1");
  assert.equal(p.resolvedAt, NOW);
  assert.equal(p.resolvedBy, "u1");
  assert.equal(get(db, "cashflow/boleto_b1").interTxId, "id:1");
  assert.equal(get(db, "boletos/b1").interTxKey, "id:1");
});

test("dois pendentes iguais → ambos continuam pendentes e nada é vinculado", async () => {
  const db = setup({ pendentes: [pendente({ txKey: "id:1" }), pendente({ txKey: "id:2", date: "2026-11-19" })] });
  await apply(db, pago());
  assert.equal(get(db, "interPendentes/id:1").status, "pendente");
  assert.equal(get(db, "interPendentes/id:2").status, "pendente");
  assert.equal("interTxId" in get(db, "cashflow/boleto_b1"), false);
  assert.equal(get(db, "boletos/b1").interTxKey, undefined);
});

test("outro boleto pago de mesmo valor/janela ainda sem extrato → não vincula (ambíguo)", async () => {
  const db = setup({
    pendentes: [pendente()],
    cash: [["boleto_b2", { type: "entrada", amount: 100, date: "2026-11-17", boletoId: "b2", description: "Boleto · Y" }]],
  });
  await apply(db, pago());
  assert.equal(get(db, "interPendentes/id:1").status, "pendente");
  assert.equal("interTxId" in get(db, "cashflow/boleto_b1"), false);
});

test("outro boleto já vinculado ao extrato ou lançamento comum não atrapalha", async () => {
  const db = setup({
    pendentes: [pendente()],
    cash: [
      ["boleto_b2", { type: "entrada", amount: 100, date: "2026-11-17", boletoId: "b2", interTxId: "id:9" }],
      ["manual1", { type: "entrada", amount: 100, date: "2026-11-18", description: "Venda balcão" }],
    ],
  });
  await apply(db, pago());
  assert.equal(get(db, "interPendentes/id:1").status, "conciliado");
  assert.equal(get(db, "cashflow/boleto_b1").interTxId, "id:1");
});

test("pendente de outro valor, fora da janela, saída ou já conciliado → não vincula", async () => {
  const db = setup({
    pendentes: [
      pendente({ txKey: "id:1", amount: 100.01 }),
      pendente({ txKey: "id:2", date: "2026-11-22" }),
      pendente({ txKey: "id:3", type: "saida" }),
      pendente({ txKey: "id:4", status: "conciliado", cashflowId: "outro" }),
    ],
  });
  await apply(db, pago());
  assert.equal("interTxId" in get(db, "cashflow/boleto_b1"), false);
  assert.equal(get(db, "interPendentes/id:1").status, "pendente");
  assert.equal(get(db, "interPendentes/id:4").cashflowId, "outro");
});

// ---------- espelho da conta a receber ----------

const espelho = (o = {}) => ({
  type: "entrada", amount: 100, date: "2026-11-15", description: "Consultoria novembro", sourceReceivableId: "r1", ...o,
});
/** Soma do dinheiro no caixa (excluindo o que não é desta conta). */
const somaCaixa = (db) => [...db.store.entries()]
  .filter(([k, v]) => k.startsWith(`${P}/cashflow/`) && v.type === "entrada")
  .reduce((s, [, v]) => s + v.amount, 0);

test("conta já 'recebido' à mão com espelho de 100; boleto paga 100 → só boleto_b1, espelho some, sem passar do total", async () => {
  const db = setup({
    b: boleto({ receivableId: "r1" }),
    rec: receivable({ status: "recebido", receivedAt: "2026-11-15", amountReceived: 0 }),
    cash: [["esp1", espelho()]],
  });
  assert.deepEqual(await apply(db, pago()), { aplicada: true, pago: true });
  assert.deepEqual(cashIds(db), ["boleto_b1"]);
  assert.equal(somaCaixa(db), 100);
  const rec = get(db, "receivables/r1");
  assert.equal(rec.amountReceived, 100);
  assert.equal(rec.status, "recebido");
  assert.equal(rec.receivedAt, "2026-11-15");
  // Reaplicar não muda nada.
  assert.deepEqual(await apply(db, pago()), { aplicada: false, pago: false });
  assert.equal(get(db, "receivables/r1").amountReceived, 100);
});

test("conta 'recebido' à mão, boleto parcial → espelho vira o saldo (caixa continua no total)", async () => {
  const db = setup({
    b: boleto({ receivableId: "r1" }),
    rec: receivable({ status: "recebido", amountReceived: 0 }),
    cash: [["esp1", espelho()], ["esp2", espelho({ amount: 100 })]],
  });
  await apply(db, pago({ valorTotalRecebido: 40 }));
  assert.deepEqual(cashIds(db).sort(), ["boleto_b1", "esp1"]);
  assert.equal(get(db, "cashflow/esp1").amount, 60);
  assert.equal(get(db, "receivables/r1").amountReceived, 40);
  assert.equal(get(db, "receivables/r1").status, "recebido");
  assert.equal(somaCaixa(db), 100);
});

test("conta 'recebido' à mão, boleto pago com juros → vale o pagamento real e espelho some", async () => {
  const db = setup({
    b: boleto({ receivableId: "r1" }),
    rec: receivable({ status: "recebido", amountReceived: 0 }),
    cash: [["esp1", espelho()]],
  });
  await apply(db, pago({ valorTotalRecebido: 103.2 }));
  assert.deepEqual(cashIds(db), ["boleto_b1"]);
  assert.equal(get(db, "receivables/r1").amountReceived, 103.2);
});

// ---------- entrada do extrato resolvida à mão ("criar") ----------

const lancadaDoExtrato = (o = {}) => ({
  type: "entrada", amount: 100, date: "2026-11-19", description: "BOLETO RECEBIDO", category: "Outros recebimentos", interTxId: "id:7", ...o,
});

test("item do extrato já virou entrada à mão → boleto ADOTA a entrada, sem criar boleto_b1", async () => {
  const db = setup({
    b: boleto({ receivableId: "r1" }),
    rec: receivable(),
    pendentes: [pendente({ txKey: "id:7", status: "conciliado", cashflowId: "man1" })],
    cash: [["man1", lancadaDoExtrato()]],
  });
  assert.deepEqual(await apply(db, pago()), { aplicada: true, pago: true });
  assert.deepEqual(cashIds(db), ["man1"]);
  const e = get(db, "cashflow/man1");
  assert.equal(e.boletoId, "b1");
  assert.equal(e.interTxId, "id:7");
  assert.equal(e.settledReceivableId, "r1");
  const b = get(db, "boletos/b1");
  assert.equal(b.situacao, "RECEBIDO");
  assert.equal(b.cashflowId, "man1");
  assert.equal(b.interTxKey, "id:7");
  assert.equal(b.revisarCaixa, undefined);
  assert.equal(get(db, "receivables/r1").amountReceived, 100);
  assert.equal(get(db, "receivables/r1").status, "recebido");

  // Reaplicar 2× → nada muda (não adota outra, não soma de novo).
  const antes = structuredClone([...db.store.entries()]);
  assert.deepEqual(await apply(db, pago()), { aplicada: false, pago: false });
  assert.deepEqual(await apply(db, pago({ situacao: "MARCADO_RECEBIDO" })), { aplicada: false, pago: false });
  assert.deepEqual([...db.store.entries()], antes);
});

test("adoção de entrada já baixada na mesma conta a receber → não soma de novo", async () => {
  const db = setup({
    b: boleto({ receivableId: "r1" }),
    rec: receivable({ amountReceived: 100, status: "recebido" }),
    cash: [["man1", lancadaDoExtrato({ settledReceivableId: "r1" })]],
  });
  await apply(db, pago());
  assert.deepEqual(cashIds(db), ["man1"]);
  assert.equal(get(db, "cashflow/man1").boletoId, "b1");
  assert.equal(get(db, "receivables/r1").amountReceived, 100);
});

test("entrada à mão de outro valor, sem interTxId, ou de outra conta a receber → não é adotada", async () => {
  const db = setup({
    b: boleto({ receivableId: "r1" }),
    rec: receivable(),
    cash: [
      ["m1", lancadaDoExtrato({ amount: 100.01 })],
      ["m2", lancadaDoExtrato({ interTxId: undefined })],
      ["m3", lancadaDoExtrato({ settledReceivableId: "r9" })],
      ["m4", lancadaDoExtrato({ date: "2026-11-25" })],
    ],
  });
  await apply(db, pago());
  assert.equal(get(db, "boletos/b1").cashflowId, "boleto_b1");
  assert.ok(cashIds(db).includes("boleto_b1"));
  assert.equal(get(db, "boletos/b1").revisarCaixa, undefined);
});

test("duas entradas à mão candidatas → cria boleto_b1 e marca revisarCaixa", async () => {
  const db = setup({
    cash: [["man1", lancadaDoExtrato()], ["man2", lancadaDoExtrato({ interTxId: "id:8", date: "2026-11-17" })]],
  });
  assert.deepEqual(await apply(db, pago()), { aplicada: true, pago: true });
  assert.deepEqual(cashIds(db).sort(), ["boleto_b1", "man1", "man2"]);
  const b = get(db, "boletos/b1");
  assert.equal(b.cashflowId, "boleto_b1");
  assert.equal(b.revisarCaixa, true);
  assert.equal(b.lastError, "Possível lançamento duplicado no caixa; confira");
  assert.equal(get(db, "cashflow/man1").boletoId, undefined);

  const antes = structuredClone([...db.store.entries()]);
  assert.deepEqual(await apply(db, pago()), { aplicada: false, pago: false });
  assert.deepEqual(await apply(db, pago()), { aplicada: false, pago: false });
  assert.deepEqual([...db.store.entries()], antes);
});

// ---------- atomicidade ----------

/** Envolve o fake: a gravação da conta a receber explode NO COMMIT da transação. */
function falhandoNaContaAReceber(db) {
  return {
    ...db,
    runTransaction(fn) {
      return db.runTransaction((tx) =>
        fn({
          ...tx,
          get: tx.get,
          set: tx.set,
          create: tx.create,
          delete: tx.delete,
          update(ref, data) {
            if (ref.path.includes("/receivables/")) {
              const bomba = { ...data };
              Object.defineProperty(bomba, "boom", { enumerable: true, get() { throw new Error("falha simulada"); } });
              return tx.update(ref, bomba);
            }
            return tx.update(ref, data);
          },
        }),
      );
    },
  };
}

test("falha ao gravar a conta a receber → nada gravado; reaplicar depois conserta", async () => {
  const db = setup({ b: boleto({ receivableId: "r1" }), rec: receivable(), pendentes: [pendente()] });
  await assert.rejects(apply(falhandoNaContaAReceber(db), pago()), /falha simulada/);
  assert.deepEqual(cashIds(db), []);
  assert.equal(get(db, "boletos/b1").situacao, "A_RECEBER");
  assert.equal(get(db, "receivables/r1").amountReceived, 0);
  assert.equal(get(db, "interPendentes/id:1").status, "pendente");

  assert.deepEqual(await apply(db, pago()), { aplicada: true, pago: true });
  assert.deepEqual(cashIds(db), ["boleto_b1"]);
  assert.equal(get(db, "receivables/r1").amountReceived, 100);
  assert.equal(get(db, "boletos/b1").situacao, "RECEBIDO");
  assert.equal(get(db, "interPendentes/id:1").status, "conciliado");
});

// ---------- regras de transição ----------

for (const s of ["CANCELADO", "EXPIRADO", "FALHA_EMISSAO"]) {
  test(`boleto ${s} localmente e pago no banco → aplica como pago com pagoAposCancelamento`, async () => {
    const db = setup({ b: boleto({ situacao: s, receivableId: "r1" }), rec: receivable() });
    assert.deepEqual(await apply(db, pago()), { aplicada: true, pago: true });
    const b = get(db, "boletos/b1");
    assert.equal(b.situacao, "RECEBIDO");
    assert.equal(b.pagoAposCancelamento, true);
    assert.deepEqual(cashIds(db), ["boleto_b1"]);
    assert.equal(get(db, "receivables/r1").status, "recebido");
  });
}

test("pago sem valor → nada pago, sem entrada, lastError; consulta posterior conserta", async () => {
  const db = setup();
  assert.deepEqual(await apply(db, pago({ valorTotalRecebido: undefined })), { aplicada: false, pago: false });
  assert.deepEqual(cashIds(db), []);
  let b = get(db, "boletos/b1");
  assert.equal(b.situacao, "A_RECEBER");
  assert.equal(b.lastError, "Pagamento confirmado sem valor/data; consulte novamente");

  assert.deepEqual(await apply(db, pago()), { aplicada: true, pago: true });
  b = get(db, "boletos/b1");
  assert.equal(b.situacao, "RECEBIDO");
  assert.equal(b.lastError ?? null, null);
});

test("pago com valor zero ou sem data → nada pago", async () => {
  const db = setup();
  assert.deepEqual(await apply(db, pago({ valorTotalRecebido: 0 })), { aplicada: false, pago: false });
  assert.deepEqual(await apply(db, pago({ dataPagamento: undefined })), { aplicada: false, pago: false });
  assert.deepEqual(await apply(db, pago({ situacao: "MARCADO_RECEBIDO", dataPagamento: undefined })), { aplicada: false, pago: false });
  assert.deepEqual(cashIds(db), []);
  assert.equal(get(db, "boletos/b1").situacao, "A_RECEBER");
  assert.equal(get(db, "boletos/b1").lastError, "Pagamento confirmado sem valor/data; consulte novamente");
});

test("transição não paga: EM_PROCESSAMENTO → A_RECEBER grava situação e dados do boleto", async () => {
  const db = setup({ b: boleto({ situacao: "EM_PROCESSAMENTO" }) });
  const r = await apply(db, {
    codigoSolicitacao: "c1",
    situacao: "A_RECEBER",
    linhaDigitavel: "07790001",
    codigoBarras: "0779",
    nossoNumero: "123",
    pixCopiaECola: "000201pix",
  });
  assert.deepEqual(r, { aplicada: true, pago: false });
  const b = get(db, "boletos/b1");
  assert.equal(b.situacao, "A_RECEBER");
  assert.equal(b.linhaDigitavel, "07790001");
  assert.equal(b.codigoBarras, "0779");
  assert.equal(b.nossoNumero, "123");
  assert.equal(b.pixCopiaECola, "000201pix");
  assert.deepEqual(cashIds(db), []);
});

test("dado ausente na consulta não apaga o que o boleto já tem", async () => {
  const db = setup({ b: boleto({ linhaDigitavel: "LD", pixCopiaECola: "PIX" }) });
  await apply(db, { codigoSolicitacao: "c1", situacao: "ATRASADO" });
  const b = get(db, "boletos/b1");
  assert.equal(b.situacao, "ATRASADO");
  assert.equal(b.linhaDigitavel, "LD");
  assert.equal(b.pixCopiaECola, "PIX");
});

test("mesma situação → não grava nada", async () => {
  const db = setup();
  const antes = structuredClone(get(db, "boletos/b1"));
  assert.deepEqual(await apply(db, { codigoSolicitacao: "c1", situacao: "A_RECEBER", linhaDigitavel: "novo" }), { aplicada: false, pago: false });
  assert.deepEqual(get(db, "boletos/b1"), antes);
});

test("CANCELADO sobre boleto não pago → aplica sem entrada", async () => {
  const db = setup();
  assert.deepEqual(await apply(db, { codigoSolicitacao: "c1", situacao: "CANCELADO" }), { aplicada: true, pago: false });
  assert.equal(get(db, "boletos/b1").situacao, "CANCELADO");
  assert.deepEqual(cashIds(db), []);
});

test("boleto inexistente → erro legível", async () => {
  const db = createFakeFirestore();
  await assert.rejects(apply(db, pago()), /Boleto não encontrado/);
});
