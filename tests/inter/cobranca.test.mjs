// Cliente da API Cobrança V3 do Inter (lib/interCobranca.ts), com transporte falso.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildEmitBody,
  parseCobranca,
  emitirCobranca,
  consultarCobranca,
  cancelarCobranca,
  pdfCobranca,
  registrarWebhook,
  buscarPorSeuNumero,
  transporteMtls,
} from "../../lib/interCobranca";

const endereco = { cep: "01310100", logradouro: "Av. Paulista", numero: "1000", bairro: "Bela Vista", cidade: "São Paulo", uf: "SP" };
const input = {
  seuNumero: "abc123",
  valorNominal: 150.5,
  dataVencimento: "2026-12-10",
  pagador: { nome: "Fulano de Tal", doc: "123.456.789-09", email: "f@x.com", telefone: "(11) 91234-5678", endereco },
};

function fake(status, json) {
  const calls = [];
  const t = async (req) => {
    calls.push(req);
    return { status, json };
  };
  return { t, calls };
}

test("emitirCobranca: POST /cobranca/v3/cobrancas com escopo write", async () => {
  const { t, calls } = fake(200, { codigoSolicitacao: "uuid-1" });
  const r = await emitirCobranca(t, input);
  assert.deepEqual(r, { codigoSolicitacao: "uuid-1" });
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].path, "/cobranca/v3/cobrancas");
  assert.equal(calls[0].scope, "boleto-cobranca.write");
  assert.equal(calls[0].body.seuNumero, "abc123");
});

test("emitirCobranca: resposta sem codigoSolicitacao lança", async () => {
  const { t } = fake(200, {});
  await assert.rejects(() => emitirCobranca(t, input), /inesperada/i);
});

test("consultarCobranca: GET com escopo read", async () => {
  const { t, calls } = fake(200, { situacao: "A_RECEBER", cobranca: { codigoSolicitacao: "uuid-1" } });
  const c = await consultarCobranca(t, "uuid-1");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].path, "/cobranca/v3/cobrancas/uuid-1");
  assert.equal(calls[0].scope, "boleto-cobranca.read");
  assert.equal(c.situacao, "A_RECEBER");
  assert.equal(c.codigoSolicitacao, "uuid-1");
});

test("cancelarCobranca: POST /cancelar com motivo e escopo write", async () => {
  const { t, calls } = fake(200, {});
  await cancelarCobranca(t, "uuid-1", "Pedido cancelado");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].path, "/cobranca/v3/cobrancas/uuid-1/cancelar");
  assert.equal(calls[0].scope, "boleto-cobranca.write");
  assert.deepEqual(calls[0].body, { motivoCancelamento: "Pedido cancelado" });
});

test("pdfCobranca: decodifica base64 do JSON", async () => {
  const { t, calls } = fake(200, { pdf: Buffer.from("%PDF-1.4 teste").toString("base64") });
  const b = await pdfCobranca(t, "uuid-1");
  assert.equal(calls[0].path, "/cobranca/v3/cobrancas/uuid-1/pdf");
  assert.equal(calls[0].scope, "boleto-cobranca.read");
  assert.equal(b.toString("utf8"), "%PDF-1.4 teste");
});

test("pdfCobranca: sem pdf lança", async () => {
  const { t } = fake(200, {});
  await assert.rejects(() => pdfCobranca(t, "uuid-1"), /inesperada/i);
});

test("registrarWebhook: PUT /cobrancas/webhook com escopo write", async () => {
  const { t, calls } = fake(204, null);
  await registrarWebhook(t, "https://x.com/hook");
  assert.equal(calls[0].method, "PUT");
  assert.equal(calls[0].path, "/cobranca/v3/cobrancas/webhook");
  assert.equal(calls[0].scope, "boleto-cobranca.write");
  assert.deepEqual(calls[0].body, { webhookUrl: "https://x.com/hook" });
});

test("parseCobranca: valorTotalRecebido string ou número dá 150.5", () => {
  const a = parseCobranca({ situacao: "RECEBIDO", cobranca: { codigoSolicitacao: "u", valorTotalRecebido: "150.50" } });
  const b = parseCobranca({ situacao: "RECEBIDO", cobranca: { codigoSolicitacao: "u", valorTotalRecebido: 150.5 } });
  assert.equal(a.valorTotalRecebido, 150.5);
  assert.equal(b.valorTotalRecebido, 150.5);
});

test("parseCobranca: lê campos aninhados em boleto e pix", () => {
  const c = parseCobranca({
    situacao: "A_RECEBER",
    cobranca: { codigoSolicitacao: "u", seuNumero: "x" },
    boleto: { linhaDigitavel: "123", codigoBarras: "456", nossoNumero: "789" },
    pix: { pixCopiaECola: "000201" },
  });
  assert.equal(c.linhaDigitavel, "123");
  assert.equal(c.codigoBarras, "456");
  assert.equal(c.nossoNumero, "789");
  assert.equal(c.pixCopiaECola, "000201");
});

test("parseCobranca: situação desconhecida ou ausente lança em português", () => {
  assert.throws(() => parseCobranca({ situacao: "XPTO" }), /situação/i);
  assert.throws(() => parseCobranca({}), /situação/i);
  assert.throws(() => parseCobranca(null), /inesperad/i);
});

test("parseCobranca: valor recebido ilegível lança", () => {
  assert.throws(() => parseCobranca({ situacao: "RECEBIDO", valorTotalRecebido: "abc" }), /valor/i);
});

test("erros HTTP: 403 pede escopo, 429 pede espera, 5xx indisponível, sem vazar corpo", async () => {
  const segredo = "SEGREDO-NO-CORPO";
  const casos = [
    [403, /escopo de cobran[cç]a.*reconecte/i],
    [429, /aguarde/i],
    [503, /indispon[ií]vel/i],
    [401, /credenciais/i],
    [422, /recusou/i],
  ];
  for (const [status, re] of casos) {
    const { t } = fake(status, { message: segredo });
    await assert.rejects(
      () => consultarCobranca(t, "u"),
      (e) => re.test(e.message) && !e.message.includes(segredo),
    );
  }
});

test("buildEmitBody: sem multa/mora não inclui os campos", () => {
  const b = buildEmitBody(input);
  assert.equal(b.valorNominal, 150.5);
  assert.equal(b.numDiasAgenda, 30);
  assert.equal(b.dataVencimento, "2026-12-10");
  assert.equal("multa" in b, false);
  assert.equal("mora" in b, false);
  assert.equal(b.pagador.cnpjCpf, "12345678909");
  assert.equal(b.pagador.tipoPessoa, "FISICA");
  assert.equal(b.pagador.ddd, "11");
  assert.equal(b.pagador.telefone, "912345678");
  assert.equal(b.pagador.endereco, "Av. Paulista");
  assert.equal(b.pagador.uf, "SP");
});

test("buildEmitBody: CNPJ é JURIDICA; multa 2 e mora 1 entram", () => {
  const b = buildEmitBody({
    ...input,
    pagador: { ...input.pagador, doc: "12.345.678/0001-95" },
    multaPercentual: 2,
    moraPercentualMensal: 1,
    mensagem: ["a", "b"],
  });
  assert.equal(b.pagador.tipoPessoa, "JURIDICA");
  assert.deepEqual(b.multa, { codigoMulta: "PERCENTUAL", taxa: 2 });
  assert.deepEqual(b.mora, { codigoMora: "TAXAMENSAL", taxa: 1 });
  assert.deepEqual(b.mensagem, { linha1: "a", linha2: "b" });
});

test("buildEmitBody: valor com 2 casas (arredonda centavos)", () => {
  assert.equal(buildEmitBody({ ...input, valorNominal: 10.005 }).valorNominal, 10.01);
  assert.equal(buildEmitBody({ ...input, valorNominal: 0.1 + 0.2 }).valorNominal, 0.3);
});

// ---------- endurecimento (revisão da Task 2) ----------

test("erro HTTP 400 na cobrança fala de dados, não de credenciais", async () => {
  const { t } = fake(400, { message: "SEGREDO" });
  await assert.rejects(
    () => emitirCobranca(t, input),
    (e) => /recusou os dados da cobran[cç]a \(HTTP 400\)/i.test(e.message) && !/credenciais|reconecte/i.test(e.message) && e.status === 400,
  );
});

test("erro HTTP leva o status (para o chamador distinguir recusa de falha ambígua)", async () => {
  const { t } = fake(429, {});
  await assert.rejects(() => emitirCobranca(t, input), (e) => e.status === 429);
});

test("buildEmitBody: documento com 11 dígitos = FISICA, 14 = JURIDICA, outro tamanho lança", () => {
  assert.equal(buildEmitBody(input).pagador.tipoPessoa, "FISICA");
  assert.equal(buildEmitBody({ ...input, pagador: { ...input.pagador, doc: "12345678000195" } }).pagador.tipoPessoa, "JURIDICA");
  for (const doc of ["1234567890", "123456789012", "", "1234567800019"]) {
    assert.throws(() => buildEmitBody({ ...input, pagador: { ...input.pagador, doc } }), /CPF|CNPJ/);
  }
});

test("buildEmitBody: valor NaN, zero ou negativo lança", () => {
  for (const v of [NaN, 0, -5, Infinity]) {
    assert.throws(() => buildEmitBody({ ...input, valorNominal: v }), /valor/i);
  }
});

test("parseCobranca: valorTotalRecebido negativo lança (sem Math.abs)", () => {
  assert.throws(() => parseCobranca({ situacao: "RECEBIDO", valorTotalRecebido: "-150.50" }), /valor/i);
  assert.throws(() => parseCobranca({ situacao: "RECEBIDO", valorTotalRecebido: -1 }), /valor/i);
});

test("parseCobranca: lê seuNumero quando vem", () => {
  const c = parseCobranca({ cobranca: { situacao: "A_RECEBER", codigoSolicitacao: "u", seuNumero: "abc123" } });
  assert.equal(c.seuNumero, "abc123");
});

test("consultarCobranca: código diferente do pedido lança", async () => {
  const { t } = fake(200, { cobranca: { situacao: "A_RECEBER", codigoSolicitacao: "outro" } });
  await assert.rejects(() => consultarCobranca(t, "uuid-1"), /diferente|n[aã]o corresponde/i);
});

test("emitirCobranca: seuNumero devolvido diferente do enviado lança", async () => {
  const { t } = fake(200, { codigoSolicitacao: "uuid-1", seuNumero: "outro" });
  await assert.rejects(() => emitirCobranca(t, input), /diferente|n[aã]o corresponde/i);
});

test("pdfCobranca: conteúdo que não é PDF ou vazio lança", async () => {
  for (const pdf of [Buffer.from("<html>erro</html>").toString("base64"), "AAAA", "===="]) {
    const { t } = fake(200, { pdf });
    await assert.rejects(() => pdfCobranca(t, "uuid-1"), /PDF/);
  }
});

test("buscarPorSeuNumero: lista por seuNumero e devolve a cobrança que casa", async () => {
  const { t, calls } = fake(200, {
    totalPaginas: 1,
    cobrancas: [
      { cobranca: { codigoSolicitacao: "c9", seuNumero: "abc123", situacao: "A_RECEBER" }, boleto: { linhaDigitavel: "999" } },
    ],
  });
  const c = await buscarPorSeuNumero(t, "abc123", "2026-11-01", "2026-11-17");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].scope, "boleto-cobranca.read");
  assert.match(calls[0].path, /^\/cobranca\/v3\/cobrancas\?/);
  assert.match(calls[0].path, /seuNumero=abc123/);
  assert.match(calls[0].path, /dataInicial=2026-11-01/);
  assert.equal(c.codigoSolicitacao, "c9");
  assert.equal(c.linhaDigitavel, "999");
});

test("buscarPorSeuNumero: nada encontrado = null; dois iguais lança", async () => {
  assert.equal(await buscarPorSeuNumero(fake(200, { cobrancas: [] }).t, "abc", "2026-11-01", "2026-11-17"), null);
  const dois = { cobrancas: [1, 2].map((n) => ({ cobranca: { codigoSolicitacao: `c${n}`, seuNumero: "abc", situacao: "A_RECEBER" } })) };
  await assert.rejects(() => buscarPorSeuNumero(fake(200, dois).t, "abc", "2026-11-01", "2026-11-17"), /mais de uma/i);
});

// ---------- transporte mTLS: cache do token por escopo ----------

function redeFalsa(respostas) {
  const log = { tokens: [], requests: [], agents: 0, destroyed: 0 };
  let n = 0;
  const net = {
    makeAgent: () => {
      log.agents++;
      return { destroy: () => log.destroyed++ };
    },
    getToken: async (_agent, _s, scope) => {
      log.tokens.push(scope);
      return `tok-${log.tokens.length}`;
    },
    request: async (_agent, method, path, headers) => {
      log.requests.push({ method, path, auth: headers.Authorization });
      const r = respostas[n++] ?? { status: 200, body: "{}" };
      return r;
    },
  };
  return { net, log };
}

const SECRETS = { clientId: "id", clientSecret: "sec", certPem: "c", keyPem: "k", conta: "00123" };

test("transporteMtls: reaproveita o token do mesmo escopo; escopo novo pede outro", async () => {
  const { net, log } = redeFalsa([]);
  const t = transporteMtls(SECRETS, net);
  await t({ method: "GET", path: "/a", scope: "boleto-cobranca.read" });
  await t({ method: "GET", path: "/b", scope: "boleto-cobranca.read" });
  await t({ method: "POST", path: "/c", scope: "boleto-cobranca.write", body: {} });
  assert.deepEqual(log.tokens, ["boleto-cobranca.read", "boleto-cobranca.write"]);
  assert.equal(log.requests[1].auth, "Bearer tok-1");
  assert.equal(log.destroyed, log.agents);
});

test("transporteMtls: 401 na chamada renova o token UMA vez e repete", async () => {
  const { net, log } = redeFalsa([{ status: 401, body: "" }, { status: 200, body: '{"ok":1}' }]);
  const t = transporteMtls(SECRETS, net);
  const r = await t({ method: "GET", path: "/a", scope: "boleto-cobranca.read" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: 1 });
  assert.equal(log.tokens.length, 2);
  assert.deepEqual(log.requests.map((x) => x.auth), ["Bearer tok-1", "Bearer tok-2"]);
});

test("transporteMtls: 401 de novo após renovar devolve 401 (sem laço)", async () => {
  const { net, log } = redeFalsa([{ status: 401, body: "" }, { status: 401, body: "" }, { status: 200, body: "{}" }]);
  const t = transporteMtls(SECRETS, net);
  const r = await t({ method: "GET", path: "/a", scope: "boleto-cobranca.read" });
  assert.equal(r.status, 401);
  assert.equal(log.requests.length, 2);
  assert.equal(log.tokens.length, 2);
});

test("transporteMtls: falha ao obter token não fica em cache", async () => {
  const { net, log } = redeFalsa([]);
  let falhar = true;
  const getToken = net.getToken;
  net.getToken = async (...a) => {
    if (falhar) {
      falhar = false;
      log.tokens.push("falhou");
      throw new Error("Credenciais do Banco Inter inválidas");
    }
    return getToken(...a);
  };
  const t = transporteMtls(SECRETS, net);
  await assert.rejects(() => t({ method: "GET", path: "/a", scope: "boleto-cobranca.read" }), /Credenciais/);
  const r = await t({ method: "GET", path: "/a", scope: "boleto-cobranca.read" });
  assert.equal(r.status, 200);
});
