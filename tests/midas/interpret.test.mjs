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
