// Banco Inter: estado de "boletos" a partir do status público (lib/interBoletosEstado.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { boletosEstado } from "../../lib/interBoletosEstado";

test("sem status ou desconectado: indisponivel", () => {
  assert.equal(boletosEstado(null), "indisponivel");
  assert.equal(boletosEstado({ connected: false }), "indisponivel");
});

test("conectado sem cobranca ativa: inativo", () => {
  assert.equal(boletosEstado({ connected: true }), "inativo");
  assert.equal(boletosEstado({ connected: true, cobrancaAtiva: false }), "inativo");
});

test("ativo quando cobrancaAtiva e escopos completos (ou ausentes)", () => {
  assert.equal(boletosEstado({ connected: true, cobrancaAtiva: true }), "ativo");
  assert.equal(
    boletosEstado({ connected: true, cobrancaAtiva: true, cobrancaEscopos: { write: true, read: true } }),
    "ativo",
  );
});

test("escopo faltando tem prioridade, mesmo ativo", () => {
  assert.equal(
    boletosEstado({ connected: true, cobrancaAtiva: true, cobrancaEscopos: { write: false, read: true } }),
    "escopoFaltando",
  );
  assert.equal(
    boletosEstado({ connected: true, cobrancaEscopos: { write: true, read: false } }),
    "escopoFaltando",
  );
});
