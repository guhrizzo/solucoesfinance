// Banco Inter: tipos e regras puras dos boletos (lib/interBoletoTypes.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { grupoDe, resumo, podeAplicar, newBoletoId, seuNumeroDe } from "../../lib/interBoletoTypes";

const HOJE = "2026-11-16";

test("grupoDe: A_RECEBER futuro ou hoje é aguardando; ontem é vencido", () => {
  assert.equal(grupoDe({ situacao: "A_RECEBER", dueDate: "2026-11-20" }, HOJE), "aguardando");
  assert.equal(grupoDe({ situacao: "A_RECEBER", dueDate: HOJE }, HOJE), "aguardando");
  assert.equal(grupoDe({ situacao: "A_RECEBER", dueDate: "2026-11-15" }, HOJE), "vencido");
});

test("grupoDe: demais situações", () => {
  assert.equal(grupoDe({ situacao: "ATRASADO", dueDate: "2026-11-30" }, HOJE), "vencido");
  assert.equal(grupoDe({ situacao: "EM_PROCESSAMENTO", dueDate: "2026-11-30" }, HOJE), "aguardando");
  assert.equal(grupoDe({ situacao: "RECEBIDO", dueDate: "2026-01-01" }, HOJE), "pago");
  assert.equal(grupoDe({ situacao: "MARCADO_RECEBIDO", dueDate: "2026-01-01" }, HOJE), "pago");
  for (const s of ["CANCELADO", "EXPIRADO", "FALHA_EMISSAO", "PROTESTO"]) {
    assert.equal(grupoDe({ situacao: s, dueDate: HOJE }, HOJE), "outros");
  }
});

test("resumo: soma por grupo e aReceber", () => {
  const r = resumo(
    [
      { situacao: "A_RECEBER", dueDate: "2026-11-20", amount: 100 },
      { situacao: "ATRASADO", dueDate: "2026-11-01", amount: 50 },
      { situacao: "RECEBIDO", dueDate: "2026-11-01", amount: 70 },
      { situacao: "CANCELADO", dueDate: "2026-11-01", amount: 999 },
    ],
    HOJE,
  );
  assert.deepEqual(r.aReceber, { qtd: 2, total: 150 });
  assert.equal(r.pago.total, 70);
  assert.equal(r.pago.qtd, 1);
});

test("resumo: soma em centavos sem erro de ponto flutuante", () => {
  const r = resumo(
    [
      { situacao: "A_RECEBER", dueDate: "2026-11-20", amount: 0.1 },
      { situacao: "A_RECEBER", dueDate: "2026-11-20", amount: 0.2 },
    ],
    HOJE,
  );
  assert.equal(r.aguardando.total, 0.3);
  assert.equal(r.aReceber.total, 0.3);
});

test("podeAplicar: terminais e transições", () => {
  assert.equal(podeAplicar("RECEBIDO", "CANCELADO"), false);
  assert.equal(podeAplicar("RECEBIDO", "A_RECEBER"), false);
  assert.equal(podeAplicar("RECEBIDO", "RECEBIDO"), false);
  assert.equal(podeAplicar("MARCADO_RECEBIDO", "RECEBIDO"), false);
  assert.equal(podeAplicar("MARCADO_RECEBIDO", "CANCELADO"), false);
  assert.equal(podeAplicar("A_RECEBER", "RECEBIDO"), true);
  assert.equal(podeAplicar("EM_PROCESSAMENTO", "A_RECEBER"), true);
  assert.equal(podeAplicar("CANCELADO", "RECEBIDO"), false);
  assert.equal(podeAplicar("A_RECEBER", "CANCELADO"), true);
});

test("newBoletoId: 12 chars [0-9a-z], sem repetição", () => {
  const ids = new Set();
  for (let i = 0; i < 1000; i++) {
    const id = newBoletoId();
    assert.match(id, /^[0-9a-z]{12}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 1000);
});

test("seuNumeroDe: devolve o id e lança se passar de 15", () => {
  assert.equal(seuNumeroDe("abc123"), "abc123");
  assert.equal(seuNumeroDe("x".repeat(15)), "x".repeat(15));
  assert.throws(() => seuNumeroDe("x".repeat(16)));
});
