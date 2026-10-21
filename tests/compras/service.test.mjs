// Fluxos críticos do serviço de Compras contra um Firestore em memória:
// CNPJ duplicado, convite (hash, expiração, uso único), isolamento entre
// fornecedores, idempotência de criação/envio, reaprovação e conversão
// idempotente pro Contas a Pagar.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createFakeFirestore } from "../support/fakeFirestore.mjs";
import { validateSupplier } from "../../lib/compras/validate.ts";
import { generateInviteToken, hashToken } from "../../lib/compras/token.ts";
import {
  createSupplier, updateSupplier, createInvite, readInvite, acceptInvite, revokePortal, resolvePortal,
  createDraft, saveDraft, submitOrder, transitionOrder, internalEditOrder, generateBills, addAttachment,
  supplierOrderView, ComprasError, paths,
} from "../../lib/compras/service.ts";
import { INVITE_TTL_MS } from "../../lib/compras/types.ts";
import { VALID_SUPPLIER } from "../support/fixtures.mjs";

const OWNER = "owner1";
const today = "2026-10-20";
const owner = { uid: OWNER, name: "Dono", side: "internal", roles: { canEdit: true, canApprove: true } };
const editor = { uid: "member1", name: "Membro", side: "internal", roles: { canEdit: true } };
const supplierActor = (uid) => ({ uid, name: "Fornecedor", side: "supplier", roles: { supplier: true } });

const ITEMS = {
  items: [
    { description: "Caixa de papelão", quantity: 100, unit: "un", unitPrice: 1.25 },
    { description: "Fita", quantity: 3, unit: "un", unitPrice: 9.9 },
  ],
  adjustments: { discount: 5, taxes: 3.3, freight: 20, otherCosts: 0 },
  paymentTerms: "3x 30/60/90",
  proposedInstallments: 3,
  proposedFirstDueDays: 30,
};

let db;
beforeEach(() => { db = createFakeFirestore(); });

const supplierInput = (over = {}) => {
  const r = validateSupplier({ ...VALID_SUPPLIER, ...over });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  return r.value;
};

async function expectCode(promise, code) {
  await assert.rejects(promise, (e) => e instanceof ComprasError && e.code === code);
}

/** Fornecedor cadastrado + convite aceito pelo login `uid`. */
async function activeSupplier(uid = "sup-uid-1", over = {}) {
  const id = await createSupplier(db, OWNER, supplierInput(over), owner);
  const { token, hash } = generateInviteToken();
  await createInvite(db, OWNER, id, hash, ["email"], owner);
  await acceptInvite(db, token, uid, supplierInput(over).email);
  const ctx = await resolvePortal(db, uid, "");
  return { id, ctx, actor: supplierActor(uid) };
}

test("CNPJ duplicado é bloqueado por conta (criar e editar)", async () => {
  const a = await createSupplier(db, OWNER, supplierInput(), owner);
  await expectCode(createSupplier(db, OWNER, supplierInput({ razaoSocial: "Outra" }), owner), "duplicateCnpj");
  // Outra conta pode ter o mesmo CNPJ.
  await createSupplier(db, "owner2", supplierInput(), { ...owner, uid: "owner2" });
  const b = await createSupplier(db, OWNER, supplierInput({ cnpj: "11.444.777/0001-61" }), owner);
  await expectCode(updateSupplier(db, OWNER, b, supplierInput(), owner), "duplicateCnpj");
  // Trocar o CNPJ libera o antigo.
  await updateSupplier(db, OWNER, a, supplierInput({ cnpj: "04.252.011/0001-10" }), owner);
  await createSupplier(db, OWNER, supplierInput({ razaoSocial: "Nova" }), owner);
});

test("convite: guarda só o hash, expira, é de uso único e exige o mesmo e-mail", async () => {
  const id = await createSupplier(db, OWNER, supplierInput(), owner);
  const { token, hash } = generateInviteToken();
  const now = Date.now();
  await createInvite(db, OWNER, id, hash, ["email"], owner, now);

  // Nenhum documento guarda o token em claro.
  for (const [, v] of db.store) assert.equal(JSON.stringify(v).includes(token), false);
  assert.ok(db.store.has(paths.invite(hashToken(token))));

  assert.equal((await readInvite(db, token, now)).ok, true);
  assert.deepEqual(await readInvite(db, token, now + INVITE_TTL_MS + 1), { ok: false, code: "inviteExpired" });
  assert.deepEqual(await readInvite(db, "x".repeat(43), now), { ok: false, code: "inviteInvalid" });

  await expectCode(acceptInvite(db, token, "u1", "outro@x.com", now), "emailMismatch");
  await acceptInvite(db, token, "u1", "vendas@alfa.com.br", now);
  await expectCode(acceptInvite(db, token, "u2", "vendas@alfa.com.br", now), "inviteUsed");

  const s = db.store.get(paths.supplier(OWNER, id));
  assert.equal(s.portal.status, "active");
  assert.equal(s.portal.uid, "u1");
});

test("novo convite revoga o anterior; convite expirado não ativa", async () => {
  const id = await createSupplier(db, OWNER, supplierInput(), owner);
  const first = generateInviteToken();
  const second = generateInviteToken();
  await createInvite(db, OWNER, id, first.hash, ["email"], owner);
  await createInvite(db, OWNER, id, second.hash, ["email"], owner);
  await expectCode(acceptInvite(db, first.token, "u1", "vendas@alfa.com.br"), "inviteRevoked");
  const later = Date.now() + INVITE_TTL_MS + 10;
  await expectCode(acceptInvite(db, second.token, "u1", "vendas@alfa.com.br", later), "inviteExpired");
});

test("acesso revogado corta o portal", async () => {
  const { id } = await activeSupplier("u9");
  assert.equal((await resolvePortal(db, "u9")).length, 1);
  await revokePortal(db, OWNER, id, owner);
  assert.equal((await resolvePortal(db, "u9")).length, 0);
  await expectCode(resolvePortal(db, "u9", ""), "portalNoAccess");
});

test("rascunho: criação idempotente e numeração sequencial por conta", async () => {
  const { ctx, actor } = await activeSupplier();
  const a1 = await createDraft(db, ctx, actor, "req-aaaaaaaa", ITEMS, today);
  const a2 = await createDraft(db, ctx, actor, "req-aaaaaaaa", ITEMS, today);
  assert.equal(a1.id, a2.id);
  assert.equal(a1.created, true);
  assert.equal(a2.created, false);
  const b = await createDraft(db, ctx, actor, "req-bbbbbbbb", ITEMS, today);
  assert.equal(db.store.get(paths.order(OWNER, a1.id)).numberLabel, "PC-000001");
  assert.equal(db.store.get(paths.order(OWNER, b.id)).numberLabel, "PC-000002");
  // Total calculado no servidor: 125 + 29,70 − 5 + 3,30 + 20 = 173
  assert.equal(db.store.get(paths.order(OWNER, a1.id)).total, 173);
});

test("fornecedor não acessa pedido de outro fornecedor", async () => {
  const A = await activeSupplier("ua");
  const B = await activeSupplier("ub", { cnpj: "11.444.777/0001-61", email: "b@b.com" });
  const { id } = await createDraft(db, A.ctx, A.actor, "req-aaaaaaaa", ITEMS, today);
  await expectCode(saveDraft(db, B.ctx, id, B.actor, ITEMS, today), "notFound");
  await expectCode(submitOrder(db, B.ctx, id, B.actor, "sub-xxxxxxxx", today), "notFound");
  await expectCode(transitionOrder(db, OWNER, id, "supplierCancel", B.actor, { reason: "teste", supplierId: B.ctx.supplierId }), "notFound");
  // A visão do portal nunca leva campos internos.
  const view = supplierOrderView({ ...db.store.get(paths.order(OWNER, id)), id, internalNotes: "segredo", billLink: { billIds: ["x"] } });
  assert.equal("internalNotes" in view, false);
  assert.equal("billLink" in view, false);
  assert.equal("costCenterId" in view, false);
});

test("envio idempotente e sem duplicidade", async () => {
  const { ctx, actor } = await activeSupplier();
  const { id } = await createDraft(db, ctx, actor, "req-aaaaaaaa", ITEMS, today);
  const r1 = await submitOrder(db, ctx, id, actor, "sub-11111111", today);
  const r2 = await submitOrder(db, ctx, id, actor, "sub-11111111", today);
  assert.equal(r1.already, false);
  assert.equal(r2.already, true);
  await expectCode(submitOrder(db, ctx, id, actor, "sub-22222222", today), "invalidStatus");
  await expectCode(saveDraft(db, ctx, id, actor, ITEMS, today), "invalidStatus");
  const hist = [...db.store.keys()].filter((k) => k.startsWith(paths.history(OWNER, id)));
  const submitted = hist.filter((k) => db.store.get(k).type === "submitted");
  assert.equal(submitted.length, 1);
});

test("envio exige item; rascunho vazio não sai", async () => {
  const { ctx, actor } = await activeSupplier();
  const { id } = await createDraft(db, ctx, actor, "req-vazio000", { items: [] }, today);
  await expectCode(submitOrder(db, ctx, id, actor, "sub-11111111", today), "validation");
});

test("fluxo de aprovação: papéis, motivo obrigatório e revisão", async () => {
  const { ctx, actor } = await activeSupplier();
  const { id } = await createDraft(db, ctx, actor, "req-aaaaaaaa", ITEMS, today);
  await submitOrder(db, ctx, id, actor, "sub-11111111", today);

  await expectCode(transitionOrder(db, OWNER, id, "approve", actor), "forbidden");
  await expectCode(transitionOrder(db, OWNER, id, "approve", editor), "forbidden");
  await transitionOrder(db, OWNER, id, "startReview", editor);
  await expectCode(transitionOrder(db, OWNER, id, "reject", owner, { reason: "" }), "reasonRequired");
  await expectCode(transitionOrder(db, OWNER, id, "approve", owner, { expectedRevision: 99 }), "staleRevision");
  const ok = await transitionOrder(db, OWNER, id, "approve", owner, { expectedRevision: 1 });
  assert.equal(ok.to, "aprovado");
  const o = db.store.get(paths.order(OWNER, id));
  assert.equal(o.approvedBy, OWNER);
  assert.equal(o.approvedTotal, 173);
  assert.ok(o.approvedAt > 0);
});

test("alteração relevante em pedido aprovado exige nova aprovação", async () => {
  const { ctx, actor } = await activeSupplier();
  const { id } = await createDraft(db, ctx, actor, "req-aaaaaaaa", ITEMS, today);
  await submitOrder(db, ctx, id, actor, "sub-11111111", today);
  await transitionOrder(db, OWNER, id, "approve", owner);

  const onlyNotes = await internalEditOrder(db, OWNER, id, editor, { ...ITEMS, notes: "obs" }, {}, 1, today);
  assert.equal(onlyNotes.reapproval, false);
  assert.equal(db.store.get(paths.order(OWNER, id)).status, "aprovado");

  const changed = { ...ITEMS, items: [{ ...ITEMS.items[0], unitPrice: 1.5 }, ITEMS.items[1]] };
  const r = await internalEditOrder(db, OWNER, id, editor, changed, {}, 1, today);
  assert.equal(r.reapproval, true);
  const o = db.store.get(paths.order(OWNER, id));
  assert.equal(o.status, "em_analise");
  assert.equal(o.revision, 2);
  assert.equal(o.approvedBy, null);
  assert.equal(o.total, 198); // 150 + 29,70 − 5 + 3,30 + 20
});

test("gerar lançamento no Contas a Pagar é idempotente e soma o total", async () => {
  const { ctx, actor } = await activeSupplier();
  const { id } = await createDraft(db, ctx, actor, "req-aaaaaaaa", ITEMS, today);
  await submitOrder(db, ctx, id, actor, "sub-11111111", today);
  await expectCode(generateBills(db, OWNER, id, owner, { installments: 3, firstDueDate: "2026-11-19", category: "Fornecedores" }), "invalidStatus");
  await transitionOrder(db, OWNER, id, "approve", owner);
  await expectCode(generateBills(db, OWNER, id, editor, { installments: 3, firstDueDate: "2026-11-19", category: "Fornecedores" }), "forbidden");

  const params = { installments: 3, firstDueDate: "2026-11-30", category: "Fornecedores" };
  const [r1, r2] = await Promise.all([
    generateBills(db, OWNER, id, owner, params),
    generateBills(db, OWNER, id, owner, params),
  ]);
  const r3 = await generateBills(db, OWNER, id, owner, { ...params, installments: 1 });
  assert.equal([r1.already, r2.already].filter(Boolean).length, 1);
  assert.equal(r3.already, true);

  const bills = [...db.store.entries()].filter(([k]) => k.startsWith(`users/${OWNER}/bills/`));
  assert.equal(bills.length, 3);
  const total = bills.reduce((s, [, b]) => s + Math.round(b.amount * 100), 0);
  assert.equal(total, 17300);
  const due = bills.map(([, b]) => b.dueDate).sort();
  assert.deepEqual(due, ["2026-11-30", "2026-12-30", "2027-01-30"]);
  const b1 = db.store.get(paths.bill(OWNER, `po_${id}_1`));
  assert.equal(b1.status, "pendente");
  assert.equal(b1.recurrence, "numeral");
  assert.equal(b1.partyDoc, "11222333000181");
  assert.equal(b1.userId, OWNER);

  // Com lançamento gerado, cancelar/editar fica bloqueado.
  await expectCode(transitionOrder(db, OWNER, id, "cancel", owner, { reason: "desistência" }), "hasBills");
  await expectCode(internalEditOrder(db, OWNER, id, owner, ITEMS, {}, null, today), "hasBills");
});

test("centro de custo de outra conta é recusado na conversão", async () => {
  const { ctx, actor } = await activeSupplier();
  const { id } = await createDraft(db, ctx, actor, "req-aaaaaaaa", ITEMS, today);
  await submitOrder(db, ctx, id, actor, "sub-11111111", today);
  await transitionOrder(db, OWNER, id, "approve", owner);
  db.store.set("costCenters/ccX", { userId: "outra-conta" });
  await expectCode(
    generateBills(db, OWNER, id, owner, { installments: 1, firstDueDate: "2026-11-30", category: "Fornecedores", costCenterId: "ccX" }),
    "costCenterNotFound",
  );
});

test("anexos: fornecedor só anexa no rascunho; limite por pedido", async () => {
  const { ctx, actor } = await activeSupplier();
  const { id } = await createDraft(db, ctx, actor, "req-aaaaaaaa", ITEMS, today);
  const att = (n) => ({ id: `a${n}`, name: `f${n}.pdf`, size: 10, contentType: "application/pdf", path: `x/${n}`, side: "supplier", uploadedAt: 1, uploadedBy: actor.uid, uploadedByName: "F" });
  for (let i = 0; i < 10; i++) await addAttachment(db, OWNER, id, att(i), actor, ctx.supplierId);
  await expectCode(addAttachment(db, OWNER, id, att(11), actor, ctx.supplierId), "tooManyAttachments");
  await submitOrder(db, ctx, id, actor, "sub-11111111", today);
});

test("fornecedor inativo não cria pedido", async () => {
  const { id, ctx, actor } = await activeSupplier();
  await updateSupplier(db, OWNER, id, supplierInput({ status: "inativo" }), owner);
  await expectCode(createDraft(db, ctx, actor, "req-aaaaaaaa", ITEMS, today), "supplierInactive");
});
