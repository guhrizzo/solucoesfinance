// Cálculos do pedido, validação de fornecedor/pedido e matriz de permissão.
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTotals, lineTotal, splitInstallments, addDaysIso } from "../../lib/compras/calc.ts";
import { validateSupplier, validateOrder, isValidCnpj, validateSupplierSelf } from "../../lib/compras/validate.ts";
import { checkAction, diffOrder } from "../../lib/compras/status.ts";

import { VALID_SUPPLIER } from "../support/fixtures.mjs";

const today = "2026-10-20";

test("lineTotal arredonda em centavos (sem erro de ponto flutuante)", () => {
  assert.equal(lineTotal(3, 0.1), 0.3);
  assert.equal(lineTotal(2.5, 4.1), 10.25);
  assert.equal(lineTotal(0.333, 3), 1);
});

test("computeTotals: subtotal − desconto + impostos + frete + outros", () => {
  const t = computeTotals(
    [{ quantity: 2, unitPrice: 10.1 }, { quantity: 1, unitPrice: 0.2 }],
    { discount: 1.3, taxes: 2.05, freight: 10, otherCosts: 0.15 },
  );
  assert.equal(t.subtotal, 20.4);
  assert.equal(t.total, 31.3);
});

test("computeTotals nunca fica negativo", () => {
  assert.equal(computeTotals([{ quantity: 1, unitPrice: 5 }], { discount: 50, taxes: 0, freight: 0, otherCosts: 0 }).total, 0);
});

test("splitInstallments soma exatamente o total (resto na última)", () => {
  const parts = splitInstallments(100, 3);
  assert.deepEqual(parts, [33.33, 33.33, 33.34]);
  assert.equal(Math.round(parts.reduce((a, b) => a + b, 0) * 100), 10000);
  assert.deepEqual(splitInstallments(10, 1), [10]);
});

test("addDaysIso vira o mês/ano sem fuso", () => {
  assert.equal(addDaysIso("2026-12-20", 30), "2027-01-19");
});

test("CNPJ: dígitos verificadores", () => {
  assert.equal(isValidCnpj("11.222.333/0001-81"), true);
  assert.equal(isValidCnpj("11.222.333/0001-82"), false);
  assert.equal(isValidCnpj("11111111111111"), false);
  assert.equal(isValidCnpj("123"), false);
});

test("validateSupplier normaliza e aceita cadastro válido", () => {
  const r = validateSupplier(VALID_SUPPLIER);
  assert.equal(r.ok, true);
  assert.equal(r.value.cnpj, "11222333000181");
  assert.equal(r.value.email, "vendas@alfa.com.br");
  assert.equal(r.value.telefone, "1133334444");
  assert.equal(r.value.endereco.uf, "SP");
  assert.equal(r.value.endereco.cep, "01001000");
});

test("validateSupplier aponta campos inválidos com códigos", () => {
  const r = validateSupplier({ ...VALID_SUPPLIER, cnpj: "11.222.333/0001-00", email: "x@", telefone: "123", razaoSocial: "" });
  assert.equal(r.ok, false);
  assert.equal(r.errors.cnpj, "invalidCnpj");
  assert.equal(r.errors.email, "invalidEmail");
  assert.equal(r.errors.telefone, "invalidPhone");
  assert.equal(r.errors.razaoSocial, "required");
});

test("validateSupplierSelf ignora campos que o fornecedor não pode mudar", () => {
  const r = validateSupplierSelf({ ...VALID_SUPPLIER, cnpj: "99999999999999", razaoSocial: "Outra", email: "hack@x.com" });
  assert.equal(r.ok, true);
  assert.equal("cnpj" in r.value, false);
  assert.equal("razaoSocial" in r.value, false);
  assert.equal("email" in r.value, false);
});

test("validateOrder recalcula totais e ignora total enviado pelo cliente", () => {
  const r = validateOrder({
    items: [{ description: "Caixa", quantity: 10, unit: "un", unitPrice: 2.5, total: 999999 }],
    adjustments: { discount: 5, taxes: 0, freight: 0, otherCosts: 0 },
    total: 1, subtotal: 1,
  }, { forSubmit: true, today });
  assert.equal(r.ok, true);
  assert.equal(r.value.subtotal, 25);
  assert.equal(r.value.total, 20);
  assert.equal(r.value.items[0].total, 25);
});

test("validateOrder: envio exige item e total > 0; desconto não passa do valor", () => {
  const empty = validateOrder({ items: [] }, { forSubmit: true, today });
  assert.equal(empty.ok, false);
  assert.equal(empty.errors.items, "itemsRequired");
  const draft = validateOrder({ items: [] }, { forSubmit: false, today });
  assert.equal(draft.ok, true);
  const disc = validateOrder({ items: [{ description: "x", quantity: 1, unit: "un", unitPrice: 10 }], adjustments: { discount: 11 } }, { forSubmit: false, today });
  assert.equal(disc.ok, false);
  assert.equal(disc.errors["adjustments.discount"], "discountTooHigh");
  const bad = validateOrder({ items: [{ description: "", quantity: -1, unit: "zz", unitPrice: -2 }] }, { forSubmit: false, today });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors["items.0.description"] && bad.errors["items.0.quantity"] && bad.errors["items.0.unit"] && bad.errors["items.0.unitPrice"]);
});

test("matriz de permissão por papel", () => {
  const supplier = { supplier: true };
  const editor = { canEdit: true };
  const approver = { canEdit: true, canApprove: true };
  const onlyApprover = { canApprove: true };

  assert.equal(checkAction("submit", supplier, { status: "rascunho" }).ok, true);
  assert.equal(checkAction("submit", editor, { status: "rascunho" }).ok, false);
  assert.deepEqual(checkAction("approve", supplier, { status: "enviado" }), { ok: false, code: "forbidden" });
  assert.deepEqual(checkAction("approve", editor, { status: "enviado" }), { ok: false, code: "forbidden" });
  assert.equal(checkAction("approve", approver, { status: "em_analise" }).ok, true);
  assert.equal(checkAction("approve", onlyApprover, { status: "em_analise" }).ok, true);
  assert.deepEqual(checkAction("approve", approver, { status: "rascunho" }), { ok: false, code: "invalidStatus" });
  assert.deepEqual(checkAction("supplierEdit", supplier, { status: "enviado" }), { ok: false, code: "invalidStatus" });
  assert.deepEqual(checkAction("cancel", approver, { status: "aprovado", billLink: { billIds: ["x"] } }), { ok: false, code: "hasBills" });
  assert.deepEqual(checkAction("generateBills", editor, { status: "aprovado" }), { ok: false, code: "forbidden" });
  assert.equal(checkAction("generateBills", approver, { status: "concluido" }).ok, true);
});

test("diffOrder: só observação não é mudança relevante", () => {
  const base = {
    issueDate: today, validUntil: "", deliveryDays: 10, paymentTerms: "30 dias", proposedInstallments: 1, proposedFirstDueDays: 30,
    items: [{ description: "a", quantity: 1, unit: "un", unitPrice: 10, total: 10 }],
    adjustments: { discount: 0, taxes: 0, freight: 0, otherCosts: 0 }, notes: "",
  };
  assert.equal(diffOrder(base, { ...base, notes: "oi" }).relevant, false);
  const changed = diffOrder(base, { ...base, items: [{ ...base.items[0], unitPrice: 11 }] });
  assert.equal(changed.relevant, true);
  assert.equal(changed.changes[0].field, "items.0");
});
