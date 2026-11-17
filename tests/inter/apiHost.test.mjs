// INTER_API_HOST (lib/inter.ts): produção por padrão, sandbox só quando configurado,
// qualquer outro valor é erro de configuração do servidor (nunca cai na produção em
// silêncio e nunca parece problema de credencial).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createFakeFirestore } from "../support/fakeFirestore.mjs";
import {
  interApiHost,
  InterConfigError,
  INTER_HOST_PRODUCAO,
  INTER_HOST_SANDBOX,
  request,
  mapNetworkError,
} from "../../lib/inter";
import { transporteMtls, InterRedeError } from "../../lib/interCobranca";
import { emitirBoleto, atualizarBoletos, BoletoError } from "../../lib/interBoletoServer";
import { syncOwner, InterSyncError } from "../../lib/interSync";
import { ativarBoletos } from "../../lib/interBoletoWebhook";
import { encryptInterSecrets } from "../../lib/interCrypto";
import { SERVER_CONFIG_ERROR } from "../../lib/interErrors";

const ORIGINAL = process.env.INTER_API_HOST;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.INTER_API_HOST;
  else process.env.INTER_API_HOST = ORIGINAL;
});

const INVALIDO = "evil.example.com";

test("INTER_API_HOST ausente → produção", () => {
  delete process.env.INTER_API_HOST;
  assert.equal(interApiHost(), "cdpj.partners.bancointer.com.br");
  assert.equal(INTER_HOST_PRODUCAO, "cdpj.partners.bancointer.com.br");
});

test("INTER_API_HOST vazio ou só espaços → produção", () => {
  process.env.INTER_API_HOST = "";
  assert.equal(interApiHost(), INTER_HOST_PRODUCAO);
  process.env.INTER_API_HOST = "   ";
  assert.equal(interApiHost(), INTER_HOST_PRODUCAO);
});

test("INTER_API_HOST = sandbox (com espaços em volta) → sandbox", () => {
  process.env.INTER_API_HOST = ` ${INTER_HOST_SANDBOX} `;
  assert.equal(interApiHost(), "cdpj-sandbox.partners.uatinter.co");
  process.env.INTER_API_HOST = INTER_HOST_PRODUCAO;
  assert.equal(interApiHost(), INTER_HOST_PRODUCAO);
});

test("INTER_API_HOST inválido → InterConfigError genérico, sem citar o valor", () => {
  for (const v of [INVALIDO, "https://cdpj.partners.bancointer.com.br", "cdpj.partners.bancointer.com.br.evil.com", "CDPJ.PARTNERS.BANCOINTER.COM.BR"]) {
    process.env.INTER_API_HOST = v;
    assert.throws(() => interApiHost(), (e) => {
      assert.ok(e instanceof InterConfigError);
      assert.equal(e.message, SERVER_CONFIG_ERROR);
      assert.ok(!e.message.includes(v));
      return true;
    });
  }
});

test("request com host inválido rejeita antes de abrir conexão; mapNetworkError não o mascara", async () => {
  process.env.INTER_API_HOST = INVALIDO;
  // agent nunca é usado: o host é conferido antes do https.request.
  await assert.rejects(request(/** @type {any} */ ({}), "GET", "/x", {}), (e) => e instanceof InterConfigError);
  const cfg = new InterConfigError();
  assert.equal(mapNetworkError(cfg), cfg);
});

test("transporteMtls: InterConfigError do token ou da chamada passa intacto (não vira InterRedeError)", async () => {
  const destroyed = [];
  const base = {
    makeAgent: () => ({ destroy: () => destroyed.push(1) }),
    getToken: async () => {
      throw new InterConfigError();
    },
    request: async () => ({ status: 200, body: "{}" }),
  };
  const s = { clientId: "a", clientSecret: "b", certPem: "c", keyPem: "d" };
  await assert.rejects(transporteMtls(s, base)({ method: "GET", path: "/x", scope: "s" }), (e) => {
    assert.ok(e instanceof InterConfigError);
    assert.ok(!(e instanceof InterRedeError));
    return true;
  });
  const naChamada = { ...base, getToken: async () => "tok", request: async () => { throw new InterConfigError(); } };
  await assert.rejects(transporteMtls(s, naChamada)({ method: "GET", path: "/x", scope: "s" }), (e) => e instanceof InterConfigError);
  assert.equal(destroyed.length, 2);
});

// ---------- núcleos: viram o erro de configuração do servidor ----------

const OWNER = "o1";
const ACTOR = { uid: "u1", name: "ana@x.com" };
const SECRETS = {
  clientId: "cid-fake",
  clientSecret: "csecret-fake",
  certPem: "-----BEGIN CERTIFICATE-----\nAAA\n-----END CERTIFICATE-----",
  keyPem: "-----BEGIN PRIVATE KEY-----\nBBB\n-----END PRIVATE KEY-----",
};
const NOW = Date.parse("2026-11-17T15:00:00Z");

function conectado() {
  process.env.INTER_ENC_KEY = "b".repeat(64);
  const db = createFakeFirestore();
  db.store.set(`integracoesBanco/${OWNER}`, { provider: "inter", ...encryptInterSecrets(SECRETS), conta: "123", createdAt: 1 });
  return db;
}

const endereco = { cep: "01310-100", logradouro: "Av. Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" };
const payer = { nome: "Cliente X", doc: "529.982.247-25", endereco };

test("emitir com host inválido → BoletoError config, nenhum boleto gravado", async () => {
  const db = conectado();
  process.env.INTER_API_HOST = INVALIDO;
  await assert.rejects(
    emitirBoleto(db, OWNER, { payer, amount: 10, dueDate: "2026-12-10" }, ACTOR, { now: NOW }),
    (e) => e instanceof BoletoError && e.kind === "config" && e.message === SERVER_CONFIG_ERROR,
  );
  assert.equal([...db.store.keys()].filter((k) => k.includes("/boletos/")).length, 0);
});

test("atualizar com boleto aberto e host inválido → BoletoError config", async () => {
  const db = conectado();
  db.store.set(`users/${OWNER}/boletos/b1`, { id: "b1", situacao: "A_RECEBER", codigoSolicitacao: "c1", dueDate: "2026-12-10", amount: 10, createdAt: "2026-11-17T10:00:00.000Z" });
  process.env.INTER_API_HOST = INVALIDO;
  await assert.rejects(atualizarBoletos(db, OWNER, ACTOR, { now: NOW }), (e) => e instanceof BoletoError && e.kind === "config");
});

test("sincronizar extrato com host inválido → InterSyncError config (não 'falha')", async () => {
  const db = conectado();
  const fetchExtrato = async () => {
    throw new InterConfigError();
  };
  await assert.rejects(syncOwner(db, OWNER, NOW, { fetchExtrato }), (e) => {
    assert.ok(e instanceof InterSyncError);
    assert.equal(e.kind, "config");
    assert.equal(e.message, SERVER_CONFIG_ERROR);
    return true;
  });
});

test("ativar boletos com host inválido → 500 de configuração (nunca 'sem escopo')", async () => {
  const db = conectado();
  process.env.INTER_API_HOST = INVALIDO;
  const r = await ativarBoletos(db, OWNER, "adm", { appUrl: "https://app.exemplo.com.br", producao: true, now: NOW });
  assert.deepEqual(r, { ok: false, status: 500, error: SERVER_CONFIG_ERROR });
  assert.equal(db.store.get(`integracoesBanco/${OWNER}`).cobranca, undefined);
});
