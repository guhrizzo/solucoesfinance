import test from "node:test";
import assert from "node:assert/strict";
import { interpret } from "@/lib/midas/interpret.ts";

test("planilha em pt/en/es", () => {
  for (const t of ["uso Excel", "google sheets", "spreadsheet", "hoja de cálculo"]) {
    assert.equal(interpret(t).tool, "planilha", t);
  }
});

test("não sabe quanto ganha nem gasta", () => {
  const r = interpret("não sei quanto ganho nem gasto");
  assert.equal(r.visibilityGap, true);
  assert.equal(r.pain, "financeiro");
});

test("marketplaces viram ecommerce", () => {
  assert.equal(interpret("vendo no mercado livre e shopee").segment, "ecommerce");
});

test("controla de cabeça", () => {
  assert.equal(interpret("controlo na cabeça").tool, "memoria");
});

test("vazio", () => {
  assert.equal(interpret("   ").empty, true);
  assert.equal(interpret("😀😀").empty, true);
  assert.equal(interpret("oi").empty, false);
});

test("texto longo não lança", () => {
  const r = interpret("a".repeat(2000));
  assert.equal(r.empty, false);
  interpret("excel ".repeat(500));
});

test("ferramenta e dor juntas", () => {
  const r = interpret("uso Excel e meu problema é estoque");
  assert.equal(r.tool, "planilha");
  assert.equal(r.pain, "estoque");
});

test("sim/não/visão geral", () => {
  assert.equal(interpret("sim").yes, true);
  assert.equal(interpret("não").no, true);
  assert.equal(interpret("quero ver tudo").wantsOverview, true);
});

test("dor explicita vence visibilityGap", () => {
  const a = interpret("estou sem controle de estoque");
  assert.equal(a.pain, "estoque");
  assert.equal(a.visibilityGap, true);
  const b = interpret("não sei quanto gasto e meu problema é estoque");
  assert.equal(b.pain, "estoque");
  assert.equal(b.visibilityGap, true);
  assert.equal(interpret("não sei quanto ganho nem gasto").pain, "financeiro");
});

test("'das' preposição não vira impostos", () => {
  assert.notEqual(interpret("controle das entradas").pain, "impostos");
  assert.equal(interpret("dificuldades das vendas").pain, "vendas");
  assert.equal(interpret("pago a guia do DAS").pain, "impostos");
});

test("limites de palavra", () => {
  assert.notEqual(interpret("internet").tool, "app_banco");
  assert.notEqual(interpret("preciso calcular").tool, "planilha");
});

test("en e es", () => {
  assert.equal(interpret("we sell on amazon").segment, "ecommerce");
  assert.equal(interpret("tengo una tienda").segment, "loja");
  assert.equal(interpret("my problem is inventory").pain, "estoque");
  assert.equal(interpret("mi problema son las facturas").pain, "contas");
  assert.equal(interpret("yes").yes, true);
  assert.equal(interpret("no").no, true);
  assert.equal(interpret("si").yes, true);
  assert.equal(interpret("ahora no").no, true);
});

test("negação antes de sim", () => {
  const r = interpret("claro que não");
  assert.equal(r.yes, undefined);
  assert.equal(r.no, true);
});
