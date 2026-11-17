// Banco Inter: núcleos das rotas de boleto (lib/interBoletoServer.ts) com
// transporte falso + Firestore em memória.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeFirestore } from "../support/fakeFirestore.mjs";
import { emitirBoleto, cancelarBoleto, atualizarBoletos, pdfBoleto } from "../../lib/interBoletoServer";
import { InterRedeError } from "../../lib/interCobranca";

const OWNER = "o1";
const ACTOR = { uid: "u1", name: "ana@x.com" };
const P = `users/${OWNER}`;
const NOW = Date.parse("2026-11-17T15:00:00Z");
const RAPIDO = { tentativas: 2, intervaloMs: 0 };
const LINHA = "07790001161234567890112345678901234567890123456";

const endereco = { cep: "01310-100", logradouro: "Av. Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "sp" };
const payer = { nome: "Cliente X", doc: "529.982.247-25", email: "c@x.com", endereco };
const entrada = (o = {}) => ({ receivableId: "r1", payer, amount: 150.5, dueDate: "2026-12-10", ...o });

const receivable = (o = {}) => ({
  title: "Consultoria novembro",
  partyName: "Cliente X",
  amount: 150.5,
  amountReceived: 0,
  status: "pendente",
  category: "Serviços",
  dueDate: "2026-12-10",
  ...o,
});

/**
 * Transporte falso do Inter. `cfg` decide as respostas; `calls` registra tudo.
 * situacao: o que o GET individual devolve (função ou valor).
 */
function inter(cfg = {}) {
  const calls = [];
  const t = async (req) => {
    calls.push(req);
    const { method, path } = req;
    if (method === "POST" && path === "/cobranca/v3/cobrancas") {
      if (cfg.postFalha) return cfg.postFalha(req);
      return { status: 200, json: { codigoSolicitacao: cfg.codigo ?? "c1" } };
    }
    if (method === "POST" && path.endsWith("/cancelar")) return { status: cfg.cancelStatus ?? 204, json: null };
    if (method === "GET" && path.startsWith("/cobranca/v3/cobrancas?")) {
      if (cfg.listaStatus) return { status: cfg.listaStatus, json: null };
      return { status: 200, json: { cobrancas: cfg.lista ?? [] } };
    }
    if (method === "GET" && path.endsWith("/pdf")) {
      return { status: 200, json: { pdf: Buffer.from("%PDF-1.4 boleto").toString("base64") } };
    }
    if (method === "GET" && path.startsWith("/cobranca/v3/cobrancas/")) {
      const codigo = decodeURIComponent(path.split("/").pop());
      const s = typeof cfg.consulta === "function" ? cfg.consulta(codigo) : cfg.consulta;
      return {
        status: 200,
        json: s ?? {
          cobranca: { codigoSolicitacao: codigo, situacao: "A_RECEBER" },
          boleto: { linhaDigitavel: LINHA, nossoNumero: "123", codigoBarras: "0779" },
          pix: { pixCopiaECola: "000201pix" },
        },
      };
    }
    return { status: 404, json: null };
  };
  return { t, calls };
}

function setup({ rec = receivable() } = {}) {
  const db = createFakeFirestore();
  if (rec) db.store.set(`${P}/receivables/r1`, rec);
  return db;
}

const get = (db, path) => db.store.get(`${P}/${path}`);
const boletos = (db) => [...db.store.entries()].filter(([k]) => k.startsWith(`${P}/boletos/`)).map(([, v]) => v);
const cashIds = (db) => [...db.store.keys()].filter((k) => k.startsWith(`${P}/cashflow/`)).map((k) => k.split("/").pop());
const posts = (calls) => calls.filter((c) => c.method === "POST" && c.path === "/cobranca/v3/cobrancas");
const deps = (t, o = {}) => ({ transporte: t, aguardar: RAPIDO, now: NOW, ...o });

// ---------- emitir ----------

test("emitir feliz: doc A_RECEBER com linha digitável e BoletoData na conta a receber", async () => {
  const db = setup();
  const { t, calls } = inter();
  const r = await emitirBoleto(db, OWNER, entrada(), ACTOR, deps(t));
  assert.equal(r.situacao, "A_RECEBER");
  assert.match(r.id, /^[0-9a-z]{12}$/);

  const b = get(db, `boletos/${r.id}`);
  assert.equal(b.id, r.id);
  assert.equal(b.situacao, "A_RECEBER");
  assert.equal(b.codigoSolicitacao, "c1");
  assert.equal(b.linhaDigitavel, LINHA);
  assert.equal(b.pixCopiaECola, "000201pix");
  assert.equal(b.createdBy, "u1");
  assert.equal(b.receivableId, "r1");
  assert.equal(b.amount, 150.5);
  assert.equal(b.payer.doc, "52998224725");
  assert.equal(b.payer.endereco.cep, "01310100");
  assert.equal(b.payer.endereco.uf, "SP");

  const post = posts(calls);
  assert.equal(post.length, 1);
  assert.equal(post[0].body.seuNumero, r.id);
  assert.equal(post[0].body.valorNominal, 150.5);

  const bd = get(db, "receivables/r1").boleto;
  assert.equal(bd.provider, "inter");
  assert.equal(bd.externalId, "c1");
  assert.equal(bd.linhaDigitavel, LINHA);
  assert.equal(bd.nossoNumero, "123");
  assert.equal(bd.pixCopiaECola, "000201pix");
  assert.equal(bd.dueDate, "2026-12-10");
  assert.equal(bd.amount, 150.5);
  assert.equal(typeof bd.issuedAt, "number");
});

test("emitir: POST falhando (429) → doc FALHA_EMISSAO, UMA chamada ao Inter, sem retry", async () => {
  const db = setup();
  const { t, calls } = inter({ postFalha: () => ({ status: 429, json: { detail: "SEGREDO" } }) });
  await assert.rejects(
    () => emitirBoleto(db, OWNER, entrada(), ACTOR, deps(t)),
    (e) => /limite/i.test(e.message) && !e.message.includes("SEGREDO"),
  );
  assert.equal(calls.length, 1);
  const [b] = boletos(db);
  assert.equal(b.situacao, "FALHA_EMISSAO");
  assert.ok(b.lastError && b.lastError.length <= 200 && !b.lastError.includes("SEGREDO"));
  assert.equal(get(db, "receivables/r1").boleto, undefined);
});

test("emitir: 403 do Inter pede o escopo de cobrança e reconexão", async () => {
  const db = setup();
  const { t } = inter({ postFalha: () => ({ status: 403, json: null }) });
  await assert.rejects(() => emitirBoleto(db, OWNER, entrada(), ACTOR, deps(t)), /escopo de cobran[cç]a.*reconecte/i);
});

test("emitir: falha de rede no POST (ambígua) não vira FALHA_EMISSAO; atualizar recupera pelo seuNumero", async () => {
  const db = setup();
  const net = inter({
    postFalha: () => {
      throw new Error("Não foi possível falar com o Banco Inter agora. Tente novamente em instantes.");
    },
  });
  await assert.rejects(() => emitirBoleto(db, OWNER, entrada(), ACTOR, deps(net.t)), /confirmar/i);
  const [b] = boletos(db);
  assert.equal(b.situacao, "EM_PROCESSAMENTO");
  assert.equal(b.codigoSolicitacao, undefined);
  assert.ok(b.lastError);
  assert.equal(posts(net.calls).length, 1);

  // Continua vigente: não deixa emitir outro para a mesma conta.
  await assert.rejects(() => emitirBoleto(db, OWNER, entrada(), ACTOR, deps(net.t)), /vigente/i);
  assert.equal(posts(net.calls).length, 1);

  const rec = inter({ lista: [{ cobranca: { codigoSolicitacao: "c7", seuNumero: b.id, situacao: "A_RECEBER" }, boleto: { linhaDigitavel: LINHA } }] });
  const r = await atualizarBoletos(db, OWNER, ACTOR, deps(rec.t));
  assert.equal(r.consultados, 1);
  const depois = get(db, `boletos/${b.id}`);
  assert.equal(depois.codigoSolicitacao, "c7");
  assert.equal(depois.situacao, "A_RECEBER");
  assert.equal(depois.linhaDigitavel, LINHA);
  assert.equal(get(db, "receivables/r1").boleto.externalId, "c7");
});

test("emitir: dois para a mesma conta a receber → o segundo é recusado", async () => {
  const db = setup();
  const { t, calls } = inter();
  await emitirBoleto(db, OWNER, entrada(), ACTOR, deps(t));
  await assert.rejects(() => emitirBoleto(db, OWNER, entrada(), ACTOR, deps(t)), /vigente/i);
  assert.equal(posts(calls).length, 1);
  assert.equal(boletos(db).length, 1);
});

test("emitir: com o boleto anterior cancelado, a conta aceita um novo", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/velho`, { id: "velho", receivableId: "r1", situacao: "CANCELADO", amount: 150.5, dueDate: "2026-12-01" });
  const { t } = inter();
  const r = await emitirBoleto(db, OWNER, entrada(), ACTOR, deps(t));
  assert.equal(r.situacao, "A_RECEBER");
});

test("emitir: pagador sem endereço é recusado antes de qualquer chamada", async () => {
  const db = setup();
  const { t, calls } = inter();
  const semEndereco = { nome: "Cliente X", doc: "52998224725" };
  await assert.rejects(() => emitirBoleto(db, OWNER, entrada({ payer: semEndereco }), ACTOR, deps(t)), /endere[cç]o/i);
  await assert.rejects(
    () => emitirBoleto(db, OWNER, entrada({ payer: { ...payer, endereco: { ...endereco, cep: "123" } } }), ACTOR, deps(t)),
    /CEP/,
  );
  assert.equal(calls.length, 0);
  assert.equal(boletos(db).length, 0);
});

test("emitir: documento inválido, valor ≤ 0 e vencimento no passado são recusados sem chamada", async () => {
  const db = setup();
  const { t, calls } = inter();
  const casos = [
    [entrada({ payer: { ...payer, doc: "111.111.111-11" } }), /CPF|CNPJ/],
    [entrada({ payer: { ...payer, doc: "123" } }), /CPF|CNPJ/],
    [entrada({ amount: 0 }), /valor/i],
    [entrada({ amount: Number.NaN }), /valor/i],
    [entrada({ dueDate: "2026-11-16" }), /vencimento/i],
    [entrada({ dueDate: "2026-02-30" }), /vencimento/i],
  ];
  for (const [i, re] of casos) await assert.rejects(() => emitirBoleto(db, OWNER, i, ACTOR, deps(t)), re);
  assert.equal(calls.length, 0);
  assert.equal(boletos(db).length, 0);
});

test("emitir: vencimento hoje (Brasília) é aceito", async () => {
  const db = setup();
  const { t } = inter();
  const r = await emitirBoleto(db, OWNER, entrada({ dueDate: "2026-11-17" }), ACTOR, deps(t));
  assert.equal(r.situacao, "A_RECEBER");
});

test("emitir: conta a receber inexistente ou já recebida é recusada", async () => {
  const { t, calls } = inter();
  await assert.rejects(() => emitirBoleto(setup({ rec: null }), OWNER, entrada(), ACTOR, deps(t)), /n[aã]o encontrada/i);
  await assert.rejects(() => emitirBoleto(setup({ rec: receivable({ status: "recebido" }) }), OWNER, entrada(), ACTOR, deps(t)), /recebida/i);
  assert.equal(calls.length, 0);
});

test("emitir avulso: sem conta a receber, fica A_RECEBER sem mexer em receivables", async () => {
  const db = setup({ rec: null });
  const { t } = inter();
  const r = await emitirBoleto(db, OWNER, entrada({ receivableId: undefined }), ACTOR, deps(t));
  const b = get(db, `boletos/${r.id}`);
  assert.equal(b.situacao, "A_RECEBER");
  assert.equal("receivableId" in b, false);
});

test("emitir: ainda EM_PROCESSAMENTO após as tentativas devolve EM_PROCESSAMENTO e não grava boleto na conta", async () => {
  const db = setup();
  const { t } = inter({ consulta: (c) => ({ cobranca: { codigoSolicitacao: c, situacao: "EM_PROCESSAMENTO" } }) });
  const r = await emitirBoleto(db, OWNER, entrada(), ACTOR, deps(t));
  assert.equal(r.situacao, "EM_PROCESSAMENTO");
  assert.equal(get(db, `boletos/${r.id}`).codigoSolicitacao, "c1");
  assert.equal(get(db, "receivables/r1").boleto, undefined);
});

test("emitir: sem conexão com o Inter não grava nada", async () => {
  const db = setup();
  await assert.rejects(() => emitirBoleto(db, OWNER, entrada(), ACTOR, { aguardar: RAPIDO, now: NOW }), /n[aã]o est[aá] conectado/i);
  assert.equal(boletos(db).length, 0);
});

// ---------- cancelar ----------

const emitido = (o = {}) => ({
  id: "b1",
  receivableId: "r1",
  payer: { nome: "Cliente X", doc: "52998224725", endereco },
  amount: 150.5,
  dueDate: "2026-12-10",
  codigoSolicitacao: "c1",
  situacao: "A_RECEBER",
  linhaDigitavel: LINHA,
  createdAt: "2026-11-17T10:00:00.000Z",
  createdBy: "u1",
  ...o,
});

test("cancelar boleto pago → recusado, sem cancelar no Inter", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, emitido({ situacao: "RECEBIDO" }));
  const { t, calls } = inter();
  await assert.rejects(() => cancelarBoleto(db, OWNER, "b1", ACTOR, deps(t)), /pago/i);
  assert.equal(calls.filter((c) => c.path.endsWith("/cancelar")).length, 0);
  assert.equal(get(db, "boletos/b1").situacao, "RECEBIDO");
});

test("cancelar: pago no banco mas ainda não aqui → aplica o pagamento e recusa o cancelamento", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, emitido());
  const { t, calls } = inter({
    consulta: (c) => ({ cobranca: { codigoSolicitacao: c, situacao: "RECEBIDO", valorTotalRecebido: "150.50", dataSituacao: "2026-11-17" } }),
  });
  await assert.rejects(() => cancelarBoleto(db, OWNER, "b1", ACTOR, deps(t)), /pago/i);
  assert.equal(calls.filter((c) => c.path.endsWith("/cancelar")).length, 0);
  assert.equal(get(db, "boletos/b1").situacao, "RECEBIDO");
  assert.deepEqual(cashIds(db), ["boleto_b1"]);
});

test("cancelar feliz: CANCELADO, cancelledBy e limpa o boleto da conta a receber", async () => {
  const db = setup({ rec: receivable({ boleto: { provider: "inter", externalId: "c1", linhaDigitavel: LINHA, issuedAt: 1, dueDate: "2026-12-10", amount: 150.5 } }) });
  db.store.set(`${P}/boletos/b1`, emitido());
  const { t, calls } = inter();
  await cancelarBoleto(db, OWNER, "b1", ACTOR, deps(t));
  const cancel = calls.filter((c) => c.path.endsWith("/cancelar"));
  assert.equal(cancel.length, 1);
  assert.equal(cancel[0].path, "/cobranca/v3/cobrancas/c1/cancelar");
  const b = get(db, "boletos/b1");
  assert.equal(b.situacao, "CANCELADO");
  assert.equal(b.cancelledBy, "u1");
  assert.equal(get(db, "receivables/r1").boleto ?? null, null);
});

test("cancelar: boleto de outra cobrança na conta a receber não é apagado", async () => {
  const outro = { provider: "inter", externalId: "OUTRO", linhaDigitavel: "9", issuedAt: 1, dueDate: "2026-12-10", amount: 150.5 };
  const db = setup({ rec: receivable({ boleto: outro }) });
  db.store.set(`${P}/boletos/b1`, emitido());
  const { t } = inter();
  await cancelarBoleto(db, OWNER, "b1", ACTOR, deps(t));
  assert.deepEqual(get(db, "receivables/r1").boleto, outro);
});

test("cancelar: falha do Inter não marca CANCELADO", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, emitido());
  const { t, calls } = inter({ cancelStatus: 403 });
  await assert.rejects(() => cancelarBoleto(db, OWNER, "b1", ACTOR, deps(t)), /escopo de cobran[cç]a/i);
  assert.equal(calls.filter((c) => c.path.endsWith("/cancelar")).length, 1);
  assert.equal(get(db, "boletos/b1").situacao, "A_RECEBER");
});

test("cancelar: id inválido ou inexistente", async () => {
  const db = setup();
  const { t } = inter();
  await assert.rejects(() => cancelarBoleto(db, OWNER, "../x", ACTOR, deps(t)), /inv[aá]lido|n[aã]o encontrado/i);
  await assert.rejects(() => cancelarBoleto(db, OWNER, "naoexiste", ACTOR, deps(t)), /n[aã]o encontrado/i);
});

// ---------- atualizar ----------

test("atualizarBoletos: pago remoto cria a entrada no caixa 1× e rodar de novo não duplica", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, emitido());
  const pago = { cobranca: { codigoSolicitacao: "c1", situacao: "RECEBIDO", valorTotalRecebido: "150.50", dataSituacao: "2026-11-17" } };
  const { t, calls } = inter({ consulta: () => pago });

  const r1 = await atualizarBoletos(db, OWNER, ACTOR, deps(t));
  assert.deepEqual(r1, { consultados: 1, pagos: 1 });
  assert.deepEqual(cashIds(db), ["boleto_b1"]);
  assert.equal(get(db, "cashflow/boleto_b1").amount, 150.5);
  assert.equal(get(db, "boletos/b1").situacao, "RECEBIDO");
  assert.equal(get(db, "receivables/r1").status, "recebido");

  const r2 = await atualizarBoletos(db, OWNER, ACTOR, deps(t));
  assert.deepEqual(r2, { consultados: 0, pagos: 0 });
  assert.deepEqual(cashIds(db), ["boleto_b1"]);
  assert.equal(calls.length, 1);
});

test("atualizarBoletos: sem boletos em aberto não chama o Inter nem exige conexão", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, emitido({ situacao: "CANCELADO" }));
  const r = await atualizarBoletos(db, OWNER, ACTOR, { now: NOW });
  assert.deepEqual(r, { consultados: 0, pagos: 0 });
});

test("atualizarBoletos: EXPIRADO remoto limpa o boleto da conta a receber", async () => {
  const db = setup({ rec: receivable({ boleto: { provider: "inter", externalId: "c1", linhaDigitavel: LINHA, issuedAt: 1, dueDate: "2026-12-10", amount: 150.5 } }) });
  db.store.set(`${P}/boletos/b1`, emitido());
  const { t } = inter({ consulta: (c) => ({ cobranca: { codigoSolicitacao: c, situacao: "EXPIRADO" } }) });
  const r = await atualizarBoletos(db, OWNER, ACTOR, deps(t));
  assert.deepEqual(r, { consultados: 1, pagos: 0 });
  assert.equal(get(db, "boletos/b1").situacao, "EXPIRADO");
  assert.equal(get(db, "receivables/r1").boleto ?? null, null);
});

test("atualizarBoletos: 429 interrompe a rodada (sem martelar o Inter) e avisa", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, emitido());
  db.store.set(`${P}/boletos/b2`, emitido({ id: "b2", codigoSolicitacao: "c2", receivableId: undefined }));
  const calls = [];
  const t = async (req) => {
    calls.push(req);
    return { status: 429, json: null };
  };
  await assert.rejects(() => atualizarBoletos(db, OWNER, ACTOR, deps(t)), /limite/i);
  assert.equal(calls.length, 1);
});

// ---------- pdf ----------

test("pdfBoleto: devolve o PDF do Inter; boleto sem código é recusado", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, emitido());
  db.store.set(`${P}/boletos/b2`, emitido({ id: "b2", codigoSolicitacao: undefined, situacao: "EM_PROCESSAMENTO" }));
  const { t, calls } = inter();
  const buf = await pdfBoleto(db, OWNER, "b1", deps(t));
  assert.equal(buf.subarray(0, 4).toString(), "%PDF");
  assert.equal(calls[0].path, "/cobranca/v3/cobrancas/c1/pdf");
  await assert.rejects(() => pdfBoleto(db, OWNER, "b2", deps(t)), /PDF|processamento/i);
});

test("emitir: falha ao obter o token (nada foi enviado) → FALHA_EMISSAO", async () => {
  const db = setup();
  const t = async () => {
    throw new InterRedeError("Credenciais do Banco Inter inválidas (Client ID/Secret) ou sem o escopo boleto-cobranca.write.", "token");
  };
  await assert.rejects(() => emitirBoleto(db, OWNER, entrada(), ACTOR, deps(t)), /Credenciais/);
  assert.equal(boletos(db)[0].situacao, "FALHA_EMISSAO");
});

test("atualizarBoletos: resposta ilegível de UM boleto vira lastError nele e a rodada segue", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, emitido({ dueDate: "2026-12-01" }));
  db.store.set(`${P}/boletos/b2`, emitido({ id: "b2", codigoSolicitacao: "c2", receivableId: undefined, dueDate: "2026-12-20" }));
  const { t } = inter({
    consulta: (c) =>
      c === "c1"
        ? { cobranca: { codigoSolicitacao: "c1", situacao: "XPTO" } }
        : { cobranca: { codigoSolicitacao: "c2", situacao: "EXPIRADO" } },
  });
  const r = await atualizarBoletos(db, OWNER, ACTOR, deps(t));
  assert.deepEqual(r, { consultados: 1, pagos: 0 });
  assert.match(get(db, "boletos/b1").lastError, /situa[cç][aã]o/i);
  assert.equal(get(db, "boletos/b2").situacao, "EXPIRADO");
});

test("atualizarBoletos: falha de rede/credencial interrompe a rodada", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, emitido());
  db.store.set(`${P}/boletos/b2`, emitido({ id: "b2", codigoSolicitacao: "c2", receivableId: undefined }));
  let n = 0;
  const t = async () => {
    n++;
    throw new InterRedeError("Não foi possível falar com o Banco Inter agora. Tente novamente em instantes.", "chamada");
  };
  await assert.rejects(() => atualizarBoletos(db, OWNER, ACTOR, deps(t)), /falar com o Banco Inter/);
  assert.equal(n, 1);
});

// ---------- fix round 1: cancelar boleto sem código (Ruling 9) ----------

const H = 3600 * 1000;
/** Boleto sem codigoSolicitacao criado `horas` antes de NOW. */
const semCodigo = (horas, o = {}) =>
  emitido({ codigoSolicitacao: undefined, situacao: "EM_PROCESSAMENTO", createdAt: new Date(NOW - horas * H).toISOString(), ...o });
const cancelCalls = (calls) => calls.filter((c) => c.path.endsWith("/cancelar"));
const DONO = { isOwner: true };

test("cancelar sem código, doc com menos de 24 h e não achado no Inter → recusado, doc intacto", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, semCodigo(2));
  const { t, calls } = inter({ lista: [] });
  await assert.rejects(() => cancelarBoleto(db, OWNER, "b1", ACTOR, deps(t)), /ainda pode estar em processamento/i);
  assert.equal(get(db, "boletos/b1").situacao, "EM_PROCESSAMENTO");
  assert.equal(cancelCalls(calls).length, 0);
  // Continua vigente: a conta a receber segue bloqueada para outra emissão.
  await assert.rejects(() => emitirBoleto(db, OWNER, entrada(), ACTOR, deps(t)), /vigente/i);
});

test("cancelar sem código, doc com 24 h ou mais e não achado → descarta (FALHA_EMISSAO) com aviso", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, semCodigo(25));
  const { t, calls } = inter({ lista: [] });
  const r = await cancelarBoleto(db, OWNER, "b1", ACTOR, deps(t));
  assert.match(r.aviso, /Internet Banking/);
  const b = get(db, "boletos/b1");
  assert.equal(b.situacao, "FALHA_EMISSAO");
  assert.equal(b.cancelledBy, "u1");
  assert.equal(b.descartadoManualmentePor, undefined);
  assert.equal(cancelCalls(calls).length, 0);
});

test("cancelar sem código, doc antigo e listagem com erro, sem forcarDescarte → erro e doc intacto", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, semCodigo(48));
  const { t } = inter({ listaStatus: 503 });
  await assert.rejects(() => cancelarBoleto(db, OWNER, "b1", ACTOR, deps(t)), /indispon[ií]vel/i);
  const b = get(db, "boletos/b1");
  assert.equal(b.situacao, "EM_PROCESSAMENTO");
  assert.equal(b.descartadoManualmentePor, undefined);
});

test("cancelar sem código, doc antigo e listagem com erro, forcarDescarte do dono → descarta com carimbo manual", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, semCodigo(48));
  const { t, calls } = inter({ listaStatus: 503 });
  const r = await cancelarBoleto(db, OWNER, "b1", ACTOR, deps(t), { forcarDescarte: true, ...DONO });
  assert.match(r.aviso, /Internet Banking/);
  const b = get(db, "boletos/b1");
  assert.equal(b.situacao, "FALHA_EMISSAO");
  assert.equal(b.descartadoManualmentePor, "u1");
  assert.equal(b.descartadoManualmenteEm, new Date(NOW).toISOString());
  assert.match(b.lastError, /manualmente/i);
  assert.equal(cancelCalls(calls).length, 0);
});

test("cancelar: forcarDescarte de quem não é dono → proibido, sem chamada e doc intacto", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, semCodigo(48));
  const { t, calls } = inter({ listaStatus: 503 });
  await assert.rejects(
    () => cancelarBoleto(db, OWNER, "b1", ACTOR, deps(t), { forcarDescarte: true, isOwner: false }),
    (e) => e.kind === "proibido" && /dono/i.test(e.message),
  );
  assert.equal(calls.length, 0);
  assert.equal(get(db, "boletos/b1").situacao, "EM_PROCESSAMENTO");
});

test("cancelar: forcarDescarte num doc com menos de 24 h → recusado", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, semCodigo(3));
  const { t } = inter({ listaStatus: 503 });
  await assert.rejects(
    () => cancelarBoleto(db, OWNER, "b1", ACTOR, deps(t), { forcarDescarte: true, ...DONO }),
    /ainda pode estar em processamento/i,
  );
  assert.equal(get(db, "boletos/b1").situacao, "EM_PROCESSAMENTO");
});

test("cancelar sem código achado na listagem → adota o código e cancela no Inter (mesmo doc novo)", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b1`, semCodigo(1));
  const { t, calls } = inter({ lista: [{ cobranca: { codigoSolicitacao: "c5", seuNumero: "b1", situacao: "A_RECEBER" } }] });
  const r = await cancelarBoleto(db, OWNER, "b1", ACTOR, deps(t));
  assert.equal(r.aviso, undefined);
  const cc = cancelCalls(calls);
  assert.equal(cc.length, 1);
  assert.equal(cc[0].path, "/cobranca/v3/cobrancas/c5/cancelar");
  const b = get(db, "boletos/b1");
  assert.equal(b.codigoSolicitacao, "c5");
  assert.equal(b.situacao, "CANCELADO");
  assert.equal(b.cancelledBy, "u1");
});

// ---------- fix round 1: validações menores ----------

test("emitir: receivableId que não é texto → recusado (não vira avulso)", async () => {
  const db = setup();
  const { t, calls } = inter();
  for (const receivableId of [123, { x: 1 }, true]) {
    await assert.rejects(() => emitirBoleto(db, OWNER, entrada({ receivableId }), ACTOR, deps(t)), /conta a receber inv[aá]lida/i);
  }
  assert.equal(calls.length, 0);
  assert.equal(boletos(db).length, 0);
});

test("emitir: e-mail longo/malformado, telefone fora de 10-13 dígitos e vencimento além de 2 anos → recusados", async () => {
  const db = setup();
  const { t, calls } = inter();
  const longo = "a".repeat(115) + "@x.com";
  const casos = [
    [entrada({ payer: { ...payer, email: longo } }), /e-mail/i],
    [entrada({ payer: { ...payer, email: "sem-arroba" } }), /e-mail/i],
    [entrada({ payer: { ...payer, email: 42 } }), /e-mail/i],
    [entrada({ payer: { ...payer, telefone: "12345" } }), /telefone/i],
    [entrada({ payer: { ...payer, telefone: "+55 (11) 91234-56789" } }), /telefone/i],
    [entrada({ dueDate: "2028-11-18" }), /2 anos/],
  ];
  for (const [i, re] of casos) await assert.rejects(() => emitirBoleto(db, OWNER, i, ACTOR, deps(t)), re);
  assert.equal(calls.length, 0);
});

test("emitir: telefone com máscara é guardado só com dígitos; vencimento em exatamente 2 anos é aceito", async () => {
  const db = setup({ rec: null });
  const { t } = inter();
  const r = await emitirBoleto(
    db, OWNER,
    entrada({ receivableId: undefined, dueDate: "2028-11-17", payer: { ...payer, telefone: "(11) 91234-5678" } }),
    ACTOR, deps(t),
  );
  assert.equal(get(db, `boletos/${r.id}`).payer.telefone, "11912345678");
});
