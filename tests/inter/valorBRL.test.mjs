// Parser estrito do valor do boleto (lib/boletoTela.ts parseValorBRL).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseValorBRL } from "../../lib/boletoTela";

const ok = (s, v) => assert.deepEqual(parseValorBRL(s), { ok: true, value: v }, s);
const bad = (s) => assert.deepEqual(parseValorBRL(s), { ok: false }, s);

test("com vírgula: vírgula decimal (até 2 casas), pontos são milhar", () => {
  ok("1.234,56", 1234.56);
  ok("12.500,00", 12500);
  ok("1234,5", 1234.5);
  ok("0,99", 0.99);
  ok(" 10,00 ", 10);
  bad("1234,567");
  bad("1,2,3");
  bad("12.50,00");
  bad("1234,");
});

test("sem vírgula: ponto só como milhar; dígitos puros valem", () => {
  ok("12500", 12500);
  ok("12.500", 12500);
  ok("1.234.567", 1234567);
  bad("12.50");
  bad("12.5");
  bad("1234.567");
  bad(".500");
});

test("vazio, zero, negativo, letras: erro", () => {
  for (const s of ["", "  ", "0", "0,00", "-10", "-1,00", "abc", "R$ 10", "1e3", "10,0a"]) bad(s);
});

test("zero à esquerda na parte inteira é recusado; 0,5 e 0,50 valem", () => {
  ok("0,5", 0.5);
  ok("0,50", 0.5);
  bad("0.500");
  bad("00.500");
  bad("01,00");
  bad("012");
  bad("00,50");
});

test("formatos pela metade ou em inglês são recusados", () => {
  bad("12,");
  bad(",50");
  bad("1,234.56");
});

test("teto do servidor: até 99.999.999,99", () => {
  ok("99.999.999,99", 99999999.99);
  ok("99999999,99", 99999999.99);
  bad("100.000.000,00");
  bad("100000000");
  bad("99.999.999.999");
});
