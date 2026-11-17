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
