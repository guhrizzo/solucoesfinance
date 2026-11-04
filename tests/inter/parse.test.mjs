// Banco Inter: parse do extrato, janelas de 90 dias e validade do certificado (lib/inter.ts).
// Fixtures no formato de uma cópia de terceiros do OpenAPI do Inter (edusouza/inter-pj-cli);
// NÃO verificado contra a documentação oficial ao vivo nem contra conta real.
// (GET /banking/v2/extrato → TransacaoSimples; /extrato/completo → TransacaoCompleta com idTransacao e detalhes).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExtrato, windowsBetween, certExpiresAt } from "../../lib/inter.ts";

const simples = {
  transacoes: [
    { dataEntrada: "2026-10-05", tipoTransacao: "PIX", tipoOperacao: "C", valor: "150.50", titulo: "Pix recebido", descricao: "PIX RECEBIDO - Maria" },
    { dataEntrada: "2026-10-05", tipoTransacao: "PAGAMENTO", tipoOperacao: "D", valor: "80.00", titulo: "Pagamento", descricao: "BOLETO ENERGIA" },
  ],
};

test("parseExtrato mapeia crédito→entrada e débito→saida", () => {
  const r = parseExtrato(simples);
  assert.equal(r.length, 2);
  assert.equal(r[0].type, "entrada");
  assert.equal(r[0].amount, 150.5);
  assert.equal(r[0].date, "2026-10-05");
  assert.equal(r[0].description, "PIX RECEBIDO - Maria");
  assert.equal(r[1].type, "saida");
  assert.equal(r[1].amount, 80);
});

test("txKey estável entre chamadas e distinto para transações iguais do mesmo dia (usa ordem)", () => {
  const igual = { dataEntrada: "2026-10-06", tipoTransacao: "PIX", tipoOperacao: "D", valor: "10.00", titulo: "Pix", descricao: "PIX ENVIADO - Joao" };
  const raw = { transacoes: [igual, { ...igual }] };
  const a = parseExtrato(raw);
  const b = parseExtrato(raw);
  assert.deepEqual(a.map((t) => t.txKey), b.map((t) => t.txKey));
  assert.notEqual(a[0].txKey, a[1].txKey);
});

test("extrato completo usa idTransacao como chave e extrai a contraparte", () => {
  const raw = {
    totalPaginas: 1,
    transacoes: [
      { idTransacao: "abc123", dataInclusao: "2026-10-07", dataTransacao: "2026-10-07", tipoTransacao: "PIX", tipoOperacao: "C", valor: "200.00", titulo: "Pix recebido", descricao: "PIX RECEBIDO", detalhes: { nomePagador: "Maria Silva" } },
    ],
  };
  const [t] = parseExtrato(raw);
  assert.ok(t.txKey.includes("abc123"));
  assert.equal(t.counterparty, "Maria Silva");
  assert.equal(t.date, "2026-10-07");
});

test("extrato vazio → []", () => {
  assert.deepEqual(parseExtrato({ transacoes: [] }), []);
  assert.deepEqual(parseExtrato({}), []);
  assert.deepEqual(parseExtrato(null), []);
});

test("valor 0 é descartado", () => {
  const r = parseExtrato({ transacoes: [{ dataEntrada: "2026-10-05", tipoOperacao: "C", valor: "0.00", descricao: "x" }, ...simples.transacoes] });
  assert.equal(r.length, 2);
});

test("windowsBetween divide 200 dias em 3 janelas de ≤90 dias sem sobreposição nem buraco", () => {
  const w = windowsBetween("2026-01-01", "2026-07-19"); // 200 dias inclusive
  assert.equal(w.length, 3);
  const dias = (a, b) => (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000;
  assert.equal(w[0].from, "2026-01-01");
  assert.equal(w[2].to, "2026-07-19");
  for (const x of w) assert.ok(dias(x.from, x.to) + 1 <= 90);
  for (let i = 1; i < w.length; i++) assert.equal(dias(w[i - 1].to, w[i].from), 1);
});

test("windowsBetween: intervalo curto vira 1 janela; invertido vira vazio", () => {
  assert.deepEqual(windowsBetween("2026-10-01", "2026-10-10"), [{ from: "2026-10-01", to: "2026-10-10" }]);
  assert.deepEqual(windowsBetween("2026-10-10", "2026-10-01"), []);
});

test("certExpiresAt lança erro legível para PEM inválido", () => {
  assert.throws(() => certExpiresAt("lixo"), /certificado/i);
});

test("txKey sem id: linhas idênticas em 'páginas' diferentes ficam distintas e estáveis ao concatenar", () => {
  const igual = { dataEntrada: "2026-10-06", tipoTransacao: "PIX", tipoOperacao: "D", valor: "10.00", titulo: "Pix", descricao: "PIX ENVIADO - Joao" };
  // Parse por página reinicia o contador (por isso fetchExtrato junta as linhas da janela antes).
  const porPagina = [parseExtrato({ transacoes: [igual] })[0].txKey, parseExtrato({ transacoes: [igual] })[0].txKey];
  assert.equal(porPagina[0], porPagina[1]);
  const junto = parseExtrato({ transacoes: [igual, { ...igual }] });
  assert.notEqual(junto[0].txKey, junto[1].txKey);
  assert.equal(junto[0].txKey, porPagina[0]);
  assert.deepEqual(junto.map((t) => t.txKey), parseExtrato({ transacoes: [igual, { ...igual }] }).map((t) => t.txKey));
});

test("valor pt-BR '1.234,56' é interpretado como 1234.56", () => {
  const [t] = parseExtrato({ transacoes: [{ dataEntrada: "2026-10-05", tipoOperacao: "C", valor: "1.234,56", descricao: "x" }] });
  assert.equal(t.amount, 1234.56);
});

test("valor negativo vira positivo; o sinal vem de tipoOperacao", () => {
  const [t] = parseExtrato({ transacoes: [{ dataEntrada: "2026-10-05", tipoOperacao: "D", valor: "-25.00", descricao: "x" }] });
  assert.equal(t.amount, 25);
  assert.equal(t.type, "saida");
});

test("valor ausente ou ilegível lança erro em português (não some em silêncio); 0 segue descartado", () => {
  for (const valor of [undefined, null, "", "abc"]) {
    assert.throws(
      () => parseExtrato({ transacoes: [{ dataEntrada: "2026-10-05", tipoOperacao: "C", valor, descricao: "x" }] }),
      /valor ausente ou ilegível/,
    );
  }
  assert.deepEqual(parseExtrato({ transacoes: [{ dataEntrada: "2026-10-05", tipoOperacao: "C", valor: "0,00", descricao: "x" }] }), []);
});
