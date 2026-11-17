// Banco Inter: webhook público de boletos e ativação pelo adm
// (lib/interBoletoWebhook.ts) com transporte falso + Firestore em memória.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createFakeFirestore } from "../support/fakeFirestore.mjs";
import {
  processarCallbacks,
  ativarBoletos,
  hashWebhookToken,
  tokenComFormato,
  lerTextoLimitado,
  MSG_ROTACAO_NAO_SALVA,
} from "../../lib/interBoletoWebhook";
import { disconnectInter } from "../../lib/interConexaoServer";

const OWNER = "o1";
const P = `users/${OWNER}`;
const NOW = Date.parse("2026-11-17T15:00:00Z");
const TOKEN = "A".repeat(43); // formato de 32 bytes em base64url
const HASH = createHash("sha256").update(TOKEN).digest("hex");
const LINHA = "07790001161234567890112345678901234567890123456";
const endereco = { cep: "01310100", logradouro: "Av. Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" };

const emitido = (o = {}) => ({
  id: "b1",
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

const PAGO = (c) => ({ cobranca: { codigoSolicitacao: c, situacao: "RECEBIDO", valorTotalRecebido: "150.50", dataSituacao: "2026-11-17" } });
const ABERTO = (c) => ({ cobranca: { codigoSolicitacao: c, situacao: "A_RECEBER" }, boleto: { linhaDigitavel: LINHA } });

function inter(consulta = PAGO) {
  const calls = [];
  const t = async (req) => {
    calls.push(req);
    if (req.method === "GET" && req.path.startsWith("/cobranca/v3/cobrancas/")) {
      return { status: 200, json: consulta(decodeURIComponent(req.path.split("/").pop())) };
    }
    if (req.method === "PUT" && req.path === "/cobranca/v3/cobrancas/webhook") return { status: 204, json: null };
    return { status: 404, json: null };
  };
  return { t, calls };
}

function setup() {
  const db = createFakeFirestore();
  db.store.set(`integracoesBanco/${OWNER}`, {
    provider: "inter",
    clientIdEnc: "x",
    conta: "123",
    cobranca: { ativo: true, token: HASH, escopos: { write: true, read: true }, webhook: true },
  });
  db.store.set(`interWebhookTokens/${HASH}`, { ownerUid: OWNER, createdAt: 1 });
  db.store.set(`${P}/boletos/b1`, emitido());
  return db;
}

const cb = (o = {}) => ({ codigoSolicitacao: "c1", seuNumero: "b1", situacao: "RECEBIDO", valorTotalRecebido: "999999.00", ...o });
const cashIds = (db) => [...db.store.keys()].filter((k) => k.startsWith(`${P}/cashflow/`));
const dump = (db) => JSON.stringify([...db.store.entries()]);

// ---------- webhook ----------

test("hashWebhookToken = sha256 hex do token bruto", () => {
  assert.equal(hashWebhookToken(TOKEN), HASH);
});

test("token desconhecido → 404 sem consultar o Inter nem tocar em dados", async () => {
  const db = setup();
  const antes = dump(db);
  const { t, calls } = inter();
  for (const tok of ["B".repeat(43), "curto", "../../x", "", TOKEN + "x"]) {
    const r = await processarCallbacks(db, tok, [cb()], { transporte: t, now: NOW });
    assert.equal(r.status, 404);
    assert.equal(r.processados, 0);
  }
  assert.equal(calls.length, 0);
  assert.equal(dump(db), antes);
});

test("token cujo hash não bate com a conexão (rotacionado/desativado) → 404", async () => {
  const db = setup();
  db.store.set(`integracoesBanco/${OWNER}`, { provider: "inter", cobranca: { ativo: true, token: "f".repeat(64) } });
  const { t, calls } = inter();
  const r = await processarCallbacks(db, TOKEN, [cb()], { transporte: t, now: NOW });
  assert.equal(r.status, 404);
  assert.equal(calls.length, 0);

  // Sem conexão (desconectado) também é 404.
  db.store.delete(`integracoesBanco/${OWNER}`);
  assert.equal((await processarCallbacks(db, TOKEN, [cb()], { transporte: t, now: NOW })).status, 404);
});

test("callback RECEBIDO confirmado pelo GET remoto → 1 entrada com o valor REMOTO", async () => {
  const db = setup();
  const { t, calls } = inter(PAGO);
  const r = await processarCallbacks(db, TOKEN, [cb()], { transporte: t, now: NOW });
  assert.deepEqual({ status: r.status, processados: r.processados }, { status: 200, processados: 1 });
  assert.equal(calls.filter((c) => c.method === "GET").length, 1);
  assert.equal(calls[0].path, "/cobranca/v3/cobrancas/c1");
  assert.deepEqual(cashIds(db), [`${P}/cashflow/boleto_b1`]);
  assert.equal(db.store.get(`${P}/cashflow/boleto_b1`).amount, 150.5);
  assert.equal(db.store.get(`${P}/boletos/b1`).situacao, "RECEBIDO");
});

test("mesmo callback 2× (inclusive repetido no mesmo corpo) → 1 entrada só", async () => {
  const db = setup();
  const { t, calls } = inter(PAGO);
  const r1 = await processarCallbacks(db, TOKEN, [cb(), cb()], { transporte: t, now: NOW });
  assert.equal(r1.status, 200);
  assert.equal(calls.length, 1, "o mesmo boleto é consultado uma vez por chamada");
  const r2 = await processarCallbacks(db, TOKEN, [cb()], { transporte: t, now: NOW });
  assert.equal(r2.status, 200);
  assert.equal(cashIds(db).length, 1);
});

test("callback RECEBIDO mas o GET remoto diz A_RECEBER → nada muda (não confia no corpo)", async () => {
  const db = setup();
  const { t } = inter(ABERTO);
  const r = await processarCallbacks(db, TOKEN, [cb()], { transporte: t, now: NOW });
  assert.equal(r.status, 200);
  assert.equal(cashIds(db).length, 0);
  assert.equal(db.store.get(`${P}/boletos/b1`).situacao, "A_RECEBER");
});

test("callback de boleto inexistente ou seuNumero inválido → 200, 0 processados, sem consulta", async () => {
  const db = setup();
  const { t, calls } = inter();
  const r = await processarCallbacks(
    db,
    TOKEN,
    [cb({ seuNumero: "naoexiste" }), cb({ seuNumero: "../../users/x" }), cb({ seuNumero: 7 }), "lixo", null],
    { transporte: t, now: NOW },
  );
  assert.deepEqual({ status: r.status, processados: r.processados }, { status: 200, processados: 0 });
  assert.equal(calls.length, 0);
  assert.equal(cashIds(db).length, 0);
});

test("codigoSolicitacao do callback diferente do boleto (ou boleto sem código) → ignorado", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b2`, emitido({ id: "b2", codigoSolicitacao: undefined, situacao: "EM_PROCESSAMENTO" }));
  const { t, calls } = inter();
  const r = await processarCallbacks(db, TOKEN, [cb({ codigoSolicitacao: "outro" }), cb({ seuNumero: "b2", codigoSolicitacao: "c9" })], {
    transporte: t,
    now: NOW,
  });
  assert.equal(r.status, 200);
  assert.equal(r.processados, 0);
  assert.equal(calls.length, 0);
  assert.equal(cashIds(db).length, 0);
});

test("erro em um callback não derruba os outros; objeto único é aceito; corpo não-array/ilegível → 200", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b2`, emitido({ id: "b2", codigoSolicitacao: "c2" }));
  // c1 devolve resposta ilegível (erro só deste boleto); c2 está pago.
  const { t } = inter((c) => (c === "c1" ? { cobranca: { situacao: "XYZ" } } : PAGO(c)));
  const r = await processarCallbacks(db, TOKEN, [cb(), cb({ seuNumero: "b2", codigoSolicitacao: "c2" })], { transporte: t, now: NOW });
  assert.equal(r.status, 200);
  assert.equal(r.processados, 1);
  assert.deepEqual(cashIds(db), [`${P}/cashflow/boleto_b2`]);

  const db2 = setup();
  const r2 = await processarCallbacks(db2, TOKEN, cb(), { transporte: inter().t, now: NOW });
  assert.equal(r2.processados, 1);
  for (const corpo of [null, "x", 5, {}]) {
    assert.equal((await processarCallbacks(setup(), TOKEN, corpo, { transporte: inter().t, now: NOW })).status, 200);
  }
});

test("no máximo 50 callbacks por chamada", async () => {
  const db = setup();
  const { t, calls } = inter(ABERTO);
  const muitos = Array.from({ length: 80 }, (_, i) => {
    const id = `x${i}`;
    db.store.set(`${P}/boletos/${id}`, emitido({ id, codigoSolicitacao: `k${i}` }));
    return cb({ seuNumero: id, codigoSolicitacao: `k${i}` });
  });
  await processarCallbacks(db, TOKEN, muitos, { transporte: t, now: NOW });
  assert.equal(calls.length, 50);
});

// ---------- ativar ----------

function escopos(write, read) {
  const pedidos = [];
  const testarEscopo = async (scope) => {
    pedidos.push(scope);
    if (scope === "boleto-cobranca.write") return write;
    if (scope === "boleto-cobranca.read") return read;
    return "falha";
  };
  return { testarEscopo, pedidos };
}

const APP = "https://app.exemplo.com.br";
const tokenDocs = (db) => [...db.store.keys()].filter((k) => k.startsWith("interWebhookTokens/"));
const auditorias = (db) => [...db.store.entries()].filter(([k]) => k.startsWith("auditoriaIntegracoes/")).map(([, v]) => v);

function conectado() {
  const db = createFakeFirestore();
  db.store.set(`integracoesBanco/${OWNER}`, { provider: "inter", clientIdEnc: "cid", keyPemEnc: "k", conta: "123", updatedAt: 5 });
  return db;
}

test("ativar sem escopo de escrita → escopos.write false, nada de token, extrato intacto, flags no status", async () => {
  const db = conectado();
  const antes = { ...db.store.get(`integracoesBanco/${OWNER}`) };
  const { t, calls } = inter();
  const r = await ativarBoletos(db, OWNER, "adm1", { ...escopos("sem-escopo", "ok"), transporte: t, appUrl: APP, now: NOW });
  assert.deepEqual(r, { ok: true, escopos: { write: false, read: true }, webhook: false });
  assert.equal(calls.length, 0, "não registra webhook sem escopo de escrita");
  assert.deepEqual(tokenDocs(db), []);
  const con = db.store.get(`integracoesBanco/${OWNER}`);
  for (const [k, v] of Object.entries(antes)) assert.deepEqual(con[k], v, `campo ${k} da conexão intacto`);
  assert.equal(con.cobranca.ativo, false);
  assert.equal(con.cobranca.token ?? null, null);
  assert.deepEqual(con.cobranca.escopos, { write: false, read: true });
  const st = db.store.get(`${P}/profile/interStatus`);
  assert.equal(st.cobrancaAtiva, false);
  assert.deepEqual(st.cobrancaEscopos, { write: false, read: true });
  const [a] = auditorias(db);
  assert.equal(a.acao, "ativar-boletos");
  assert.equal(a.adminUid, "adm1");
  assert.equal(a.alvoOwnerUid, OWNER);
});

test("ativar com os dois escopos: registra o webhook e grava SÓ o hash do token", async () => {
  const db = conectado();
  const { t, calls } = inter();
  const r = await ativarBoletos(db, OWNER, "adm1", { ...escopos("ok", "ok"), transporte: t, appUrl: APP + "/", now: NOW });
  assert.deepEqual(r, { ok: true, escopos: { write: true, read: true }, webhook: true });

  const put = calls.filter((c) => c.method === "PUT");
  assert.equal(put.length, 1);
  const url = put[0].body.webhookUrl;
  const m = /^https:\/\/app\.exemplo\.com\.br\/api\/webhooks\/inter-boletos\/([A-Za-z0-9_-]{43})$/.exec(url);
  assert.ok(m, `URL do webhook inesperada: ${url}`);
  const bruto = m[1];
  const hash = createHash("sha256").update(bruto).digest("hex");

  assert.deepEqual(tokenDocs(db), [`interWebhookTokens/${hash}`]);
  assert.equal(db.store.get(`interWebhookTokens/${hash}`).ownerUid, OWNER);
  const con = db.store.get(`integracoesBanco/${OWNER}`);
  assert.equal(con.cobranca.token, hash);
  assert.equal(con.cobranca.ativo, true);
  assert.equal(db.store.get(`${P}/profile/interStatus`).cobrancaAtiva, true);
  // O valor bruto não aparece em lugar nenhum do banco nem na resposta.
  assert.equal(dump(db).includes(bruto), false);
  assert.equal(JSON.stringify(r).includes(bruto), false);
  assert.equal(JSON.stringify(r).includes(hash), false);

  // E o token funciona no webhook.
  db.store.set(`${P}/boletos/b1`, emitido());
  const w = await processarCallbacks(db, bruto, [cb()], { transporte: inter(PAGO).t, now: NOW });
  assert.equal(w.status, 200);
  assert.equal(w.processados, 1);
});

test("reativar rotaciona o token: o hash antigo some e o token antigo passa a dar 404", async () => {
  const db = setup();
  const r = await ativarBoletos(db, OWNER, "adm1", { ...escopos("ok", "ok"), transporte: inter().t, appUrl: APP, now: NOW });
  assert.equal(r.webhook, true);
  assert.equal(db.store.has(`interWebhookTokens/${HASH}`), false);
  assert.equal(tokenDocs(db).length, 1);
  assert.equal((await processarCallbacks(db, TOKEN, [cb()], { transporte: inter().t, now: NOW })).status, 404);
});

test("ativar: falha ao registrar no Inter mantém o token anterior e devolve webhook false", async () => {
  const db = setup();
  const t = async () => ({ status: 500, json: { detail: "SEGREDO" } });
  const r = await ativarBoletos(db, OWNER, "adm1", { ...escopos("ok", "ok"), transporte: t, appUrl: APP, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.webhook, false);
  assert.equal(JSON.stringify(r).includes("SEGREDO"), false);
  assert.deepEqual(tokenDocs(db), [`interWebhookTokens/${HASH}`]);
  assert.equal(db.store.get(`integracoesBanco/${OWNER}`).cobranca.token, HASH);
});

test("ativar em produção sem NEXT_PUBLIC_APP_URL https → erro claro, nada registrado nem gravado", async () => {
  for (const appUrl of [undefined, "", "http://app.exemplo.com.br", "https://localhost:3000", "nao-e-url"]) {
    const db = conectado();
    const { t, calls } = inter();
    const esc = escopos("ok", "ok");
    const r = await ativarBoletos(db, OWNER, "adm1", { ...esc, transporte: t, appUrl, producao: true, now: NOW });
    assert.equal(r.ok, false, `appUrl=${appUrl}`);
    assert.match(r.error, /NEXT_PUBLIC_APP_URL|HTTPS/i);
    assert.equal(calls.length, 0);
    assert.equal(esc.pedidos.length, 0);
    assert.deepEqual(tokenDocs(db), []);
    assert.equal(db.store.get(`integracoesBanco/${OWNER}`).cobranca, undefined);
  }
});

test("ativar fora de produção com URL http (localhost) grava as flags mas não registra webhook", async () => {
  const db = conectado();
  const { t, calls } = inter();
  const r = await ativarBoletos(db, OWNER, "adm1", { ...escopos("ok", "ok"), transporte: t, appUrl: "http://localhost:3000", producao: false, now: NOW });
  assert.deepEqual(r, { ok: true, escopos: { write: true, read: true }, webhook: false });
  assert.equal(calls.length, 0);
  assert.deepEqual(tokenDocs(db), []);
  assert.equal(db.store.get(`integracoesBanco/${OWNER}`).cobranca.ativo, true);
});

test("ativar: falha transitória ao testar escopo → erro, nada gravado; sem conexão → erro", async () => {
  const db = conectado();
  const r = await ativarBoletos(db, OWNER, "adm1", { ...escopos("falha", "ok"), transporte: inter().t, appUrl: APP, now: NOW });
  assert.equal(r.ok, false);
  assert.equal(db.store.get(`integracoesBanco/${OWNER}`).cobranca, undefined);
  assert.equal(db.store.get(`${P}/profile/interStatus`), undefined);

  const vazio = createFakeFirestore();
  const r2 = await ativarBoletos(vazio, OWNER, "adm1", { ...escopos("ok", "ok"), transporte: inter().t, appUrl: APP, now: NOW });
  assert.equal(r2.ok, false);
  assert.match(r2.error, /não está conectado/);
  assert.deepEqual(tokenDocs(vazio), []);
});

test("desconectar o Inter apaga o índice do token do webhook", async () => {
  const db = setup();
  const r = await disconnectInter(db, OWNER);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(tokenDocs(db), []);
  assert.equal((await processarCallbacks(db, TOKEN, [cb()], { transporte: inter().t, now: NOW })).status, 404);
});

// ---------- formato do token e corpo com limite (F1) ----------

test("tokenComFormato: só 43 caracteres base64url", () => {
  assert.equal(tokenComFormato(TOKEN), true);
  assert.equal(tokenComFormato("a-_Z9".repeat(8) + "abc"), true);
  for (const t of ["", "curto", TOKEN + "x", TOKEN.slice(1), "A".repeat(42) + "=", "A".repeat(42) + "/", "../../x", "A".repeat(200), undefined, null, 43]) {
    assert.equal(tokenComFormato(t), false, String(t));
  }
});

const corpoStream = (bytes) =>
  new Request("http://localhost/x", {
    method: "POST",
    duplex: "half",
    body: new ReadableStream({
      start(c) {
        // Em pedaços, sem content-length (como um envio chunked).
        for (let i = 0; i < bytes; i += 1000) c.enqueue(new Uint8Array(Math.min(1000, bytes - i)).fill(0x61));
        c.close();
      },
    }),
  });

test("lerTextoLimitado: devolve o texto até o limite e null acima dele (sem content-length)", async () => {
  assert.equal(await lerTextoLimitado(new Request("http://localhost/x", { method: "POST", body: '[{"a":"ç"}]' }), 100), '[{"a":"ç"}]');
  assert.equal(await lerTextoLimitado(new Request("http://localhost/x", { method: "POST" }), 100), "");
  assert.equal((await lerTextoLimitado(corpoStream(5000), 5000)).length, 5000);
  assert.equal(await lerTextoLimitado(corpoStream(5001), 5000), null);
  assert.equal(await lerTextoLimitado(corpoStream(300 * 1024), 256 * 1024), null);
});

// ---------- erro geral → o Inter reenvia (F2) ----------

test("processou um e parou num erro geral (503 do Inter) → parouPorErroGeral, o resto fica para o reenvio", async () => {
  const db = setup();
  db.store.set(`${P}/boletos/b2`, emitido({ id: "b2", codigoSolicitacao: "c2" }));
  db.store.set(`${P}/boletos/b3`, emitido({ id: "b3", codigoSolicitacao: "c3" }));
  const calls = [];
  const t = async (req) => {
    calls.push(req);
    const c = decodeURIComponent(req.path.split("/").pop());
    if (c === "c2") return { status: 503, json: null };
    return { status: 200, json: PAGO(c) };
  };
  const corpo = [cb(), cb({ seuNumero: "b2", codigoSolicitacao: "c2" }), cb({ seuNumero: "b3", codigoSolicitacao: "c3" })];
  const r = await processarCallbacks(db, TOKEN, corpo, { transporte: t, now: NOW });
  assert.equal(r.status, 200);
  assert.equal(r.parouPorErroGeral, true);
  assert.equal(r.processados, 1);
  assert.equal(calls.length, 2, "não consulta o terceiro depois do erro geral");
  assert.deepEqual(cashIds(db), [`${P}/cashflow/boleto_b1`]);

  // Reenvio do Inter com o Inter de volta: b1 não duplica, b2 e b3 entram.
  const r2 = await processarCallbacks(db, TOKEN, corpo, { transporte: inter(PAGO).t, now: NOW });
  assert.equal(r2.parouPorErroGeral, false);
  assert.deepEqual(cashIds(db).sort(), [`${P}/cashflow/boleto_b1`, `${P}/cashflow/boleto_b2`, `${P}/cashflow/boleto_b3`]);
});

test("erro geral já no primeiro (429) → parouPorErroGeral; erro de UM callback só → não", async () => {
  const db = setup();
  const r = await processarCallbacks(db, TOKEN, [cb()], { transporte: async () => ({ status: 429, json: null }), now: NOW });
  assert.equal(r.parouPorErroGeral, true);
  assert.equal(r.processados, 0);

  const db2 = setup();
  const ilegivel = await processarCallbacks(db2, TOKEN, [cb()], { transporte: inter(() => ({ cobranca: { situacao: "XYZ" } })).t, now: NOW });
  assert.equal(ilegivel.status, 200);
  assert.equal(ilegivel.parouPorErroGeral, false);
  assert.equal(ilegivel.falhas, 1);

  const nao = await processarCallbacks(setup(), "B".repeat(43), [cb()], { transporte: inter().t, now: NOW });
  assert.equal(nao.parouPorErroGeral, false);
});

// ---------- rotação que não foi salva (F3) ----------

const transacaoFalhando = (db) => ({
  ...db,
  runTransaction: async () => {
    throw Object.assign(new Error("falha simulada"), { code: "unavailable" });
  },
});

test("ativar: Inter recebeu a URL nova mas o hash não foi salvo → 500 com o aviso de reativar", async () => {
  const db = setup();
  const { t, calls } = inter();
  const r = await ativarBoletos(transacaoFalhando(db), OWNER, "adm1", { ...escopos("ok", "ok"), transporte: t, appUrl: APP, now: NOW });
  assert.deepEqual(r, { ok: false, status: 500, error: MSG_ROTACAO_NAO_SALVA });
  assert.match(MSG_ROTACAO_NAO_SALVA, /Reativar boletos/);
  assert.equal(calls.filter((c) => c.method === "PUT").length, 1);
  // O token antigo continua guardado (nada foi trocado).
  assert.deepEqual(tokenDocs(db), [`interWebhookTokens/${HASH}`]);

  // Sem registro novo (sem escopo de escrita), a falha ao gravar segue a mensagem genérica.
  const r2 = await ativarBoletos(transacaoFalhando(conectado()), OWNER, "adm1", { ...escopos("sem-escopo", "ok"), transporte: inter().t, appUrl: APP, now: NOW });
  assert.equal(r2.ok, false);
  assert.equal(r2.status, 500);
  assert.notEqual(r2.error, MSG_ROTACAO_NAO_SALVA);
});
