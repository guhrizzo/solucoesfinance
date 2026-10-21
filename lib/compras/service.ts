// lib/compras/service.ts
// Regras de negócio do módulo de Compras — SOMENTE server-side (Admin SDK).
// As rotas app/api/compras/** autenticam, resolvem o papel de quem chama e
// delegam pra cá. Tudo que muda estado roda em TRANSAÇÃO do Firestore (todas
// as leituras antes das escritas), o que dá:
//   • nº do pedido único (contador por conta),
//   • CNPJ único por conta (doc-índice supplierCnpjIndex/{cnpj}),
//   • envio/criação idempotentes (chave de requisição → ID determinístico),
//   • conversão pedido → Contas a Pagar idempotente (bills/po_{id}_{n} +
//     vínculo `billLink` gravado no pedido na mesma transação).
//
// `db` é tipado como o Firestore do Admin SDK, mas só usamos um subconjunto
// pequeno (doc/collection/get/runTransaction) — os testes (tests/compras)
// passam um Firestore em memória com a mesma forma.

import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import { addMonthsClamped } from "../dateSeries";
import { CASHFLOW_CATEGORIES } from "../cashflowCategories";
import { computeTotals, splitInstallments, addDaysIso } from "./calc";
import { checkAction, diffOrder, type ActorRoles, type OrderAction } from "./status";
import { deterministicId, hashToken } from "./token";
import { validateOrder, type FieldErrors } from "./validate";
import {
  INVITE_TTL_MS, MAX_ATTACHMENTS, MAX_INSTALLMENTS,
  type BillLink, type HistoryEvent, type InviteDoc, type OrderAttachment, type OrderEditable,
  type OrderStatus, type PortalLinkDoc, type PurchaseOrderDoc, type SupplierDoc, type SupplierInput,
  type SupplierSelfField,
} from "./types";

// ─── Erros ──────────────────────────────────────────────────────────────────

export class ComprasError extends Error {
  code: string;
  status: number;
  fields?: FieldErrors;
  constructor(code: string, status: number, fields?: FieldErrors) {
    super(code);
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

/** Mensagens em pt-BR pros códigos (a UI traduz por código; isto é o fallback). */
export const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "Você não tem permissão para esta ação.",
  invalidStatus: "Esta ação não é permitida no status atual do pedido.",
  hasBills: "Este pedido já gerou lançamento no Contas a Pagar.",
  notFound: "Registro não encontrado.",
  duplicateCnpj: "Já existe um fornecedor com este CNPJ nesta conta.",
  validation: "Revise os campos destacados.",
  supplierInactive: "Fornecedor inativo — não é possível criar ou enviar pedidos.",
  reasonRequired: "Informe o motivo (mínimo de 3 caracteres).",
  staleRevision: "O pedido mudou desde que você abriu. Recarregue e revise de novo.",
  inviteInvalid: "Convite inválido.",
  inviteExpired: "Este convite expirou. Peça um novo à empresa.",
  inviteUsed: "Este convite já foi usado.",
  inviteRevoked: "Este convite foi cancelado. Peça um novo à empresa.",
  emailMismatch: "Entre com o mesmo e-mail para o qual o convite foi enviado.",
  alreadyActive: "Este fornecedor já tem acesso ativo ao portal.",
  noSupplierEmail: "Cadastre o e-mail comercial do fornecedor antes de convidar.",
  tooManyAttachments: "Limite de anexos atingido.",
  attachmentNotFound: "Anexo não encontrado.",
  billExists: "Já existe lançamento com o identificador deste pedido.",
  invalidBillParams: "Revise parcelas, vencimento e categoria.",
  costCenterNotFound: "Centro de custo não encontrado.",
  portalNoAccess: "Seu acesso ao portal não está ativo para esta empresa.",
};

export const errorMessage = (code: string) => ERROR_MESSAGES[code] ?? "Não foi possível concluir a operação.";

// ─── Caminhos ───────────────────────────────────────────────────────────────

export const paths = {
  supplier: (o: string, id: string) => `users/${o}/suppliers/${id}`,
  suppliers: (o: string) => `users/${o}/suppliers`,
  cnpjIndex: (o: string, cnpj: string) => `users/${o}/supplierCnpjIndex/${cnpj}`,
  order: (o: string, id: string) => `users/${o}/purchaseOrders/${id}`,
  orders: (o: string) => `users/${o}/purchaseOrders`,
  history: (o: string, id: string) => `users/${o}/purchaseOrders/${id}/history`,
  counter: (o: string) => `users/${o}/counters/purchaseOrders`,
  bill: (o: string, id: string) => `users/${o}/bills/${id}`,
  invite: (hash: string) => `supplierInvites/${hash}`,
  portalUser: (uid: string) => `supplierPortalUsers/${uid}`,
  link: (uid: string, o: string, s: string) => `supplierPortalUsers/${uid}/links/${o}__${s}`,
  links: (uid: string) => `supplierPortalUsers/${uid}/links`,
  notifications: (o: string) => `users/${o}/comprasNotifications`,
};

export interface Actor {
  uid: string;
  name: string;
  side: "supplier" | "internal";
  roles: ActorRoles;
}

export const numberLabel = (n: number) => `PC-${String(n).padStart(6, "0")}`;

function assertAction(action: OrderAction, actor: Actor, order: PurchaseOrderDoc) {
  const r = checkAction(action, actor.roles, order);
  if (!r.ok) throw new ComprasError(r.code, r.code === "forbidden" ? 403 : 409);
  return r.to;
}

function writeHistory(db: Firestore, tx: Transaction, ownerUid: string, orderId: string, ev: HistoryEvent) {
  const ref = db.collection(paths.history(ownerUid, orderId)).doc();
  tx.set(ref, stripUndefined(ev));
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

function editableOf(o: OrderEditable): OrderEditable {
  return {
    issueDate: o.issueDate,
    validUntil: o.validUntil,
    deliveryDays: o.deliveryDays,
    paymentTerms: o.paymentTerms,
    proposedInstallments: o.proposedInstallments,
    proposedFirstDueDays: o.proposedFirstDueDays,
    items: o.items,
    adjustments: o.adjustments,
    notes: o.notes,
  };
}

// ─── Fornecedores ───────────────────────────────────────────────────────────

export async function createSupplier(
  db: Firestore, ownerUid: string, input: SupplierInput, actor: Actor, now = Date.now(),
): Promise<string> {
  const ref = db.collection(paths.suppliers(ownerUid)).doc();
  const idxRef = db.doc(paths.cnpjIndex(ownerUid, input.cnpj));
  await db.runTransaction(async (tx) => {
    const idx = await tx.get(idxRef);
    if (idx.exists) throw new ComprasError("duplicateCnpj", 409, { cnpj: "duplicateCnpj" });
    tx.create(idxRef, { supplierId: ref.id, createdAt: now });
    const doc: Omit<SupplierDoc, "id"> = {
      ...input,
      ownerUid,
      portal: { status: "none" },
      orderCount: 0,
      createdAt: now,
      createdBy: actor.uid,
      createdByName: actor.name,
      updatedAt: now,
    };
    tx.create(ref, doc);
  });
  return ref.id;
}

export async function updateSupplier(
  db: Firestore, ownerUid: string, supplierId: string, input: SupplierInput, actor: Actor, now = Date.now(),
): Promise<void> {
  const ref = db.doc(paths.supplier(ownerUid, supplierId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ComprasError("notFound", 404);
    const cur = snap.data() as SupplierDoc;
    const cnpjChanged = cur.cnpj !== input.cnpj;
    const newIdxRef = db.doc(paths.cnpjIndex(ownerUid, input.cnpj));
    if (cnpjChanged) {
      const idx = await tx.get(newIdxRef);
      if (idx.exists && idx.data()?.supplierId !== supplierId) {
        throw new ComprasError("duplicateCnpj", 409, { cnpj: "duplicateCnpj" });
      }
    }
    // ── escritas ──
    if (cnpjChanged) {
      tx.set(newIdxRef, { supplierId, createdAt: now });
      tx.delete(db.doc(paths.cnpjIndex(ownerUid, cur.cnpj)));
    }
    tx.update(ref, { ...input, updatedAt: now, updatedBy: actor.uid, updatedByName: actor.name });
  });
}

export async function updateSupplierSelf(
  db: Firestore, ownerUid: string, supplierId: string,
  fields: Pick<SupplierInput, SupplierSelfField>, actor: Actor, now = Date.now(),
): Promise<void> {
  const ref = db.doc(paths.supplier(ownerUid, supplierId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ComprasError("notFound", 404);
    tx.update(ref, { ...fields, updatedAt: now, updatedBy: actor.uid, updatedByName: `${actor.name} (fornecedor)` });
  });
}

/** Visão do cadastro que o próprio fornecedor pode ver (sem observações internas). */
export function supplierSelfView(s: SupplierDoc) {
  return {
    id: s.id,
    razaoSocial: s.razaoSocial,
    nomeFantasia: s.nomeFantasia,
    cnpj: s.cnpj,
    ie: s.ie,
    responsavel: s.responsavel,
    email: s.email,
    telefone: s.telefone,
    whatsapp: s.whatsapp,
    endereco: s.endereco,
    categoria: s.categoria,
    status: s.status,
  };
}

// ─── Convite / portal ───────────────────────────────────────────────────────

export async function createInvite(
  db: Firestore, ownerUid: string, supplierId: string, tokenHash: string,
  channels: ("email" | "whatsapp")[], actor: Actor, now = Date.now(),
): Promise<{ supplier: SupplierDoc; expiresAt: number }> {
  const ref = db.doc(paths.supplier(ownerUid, supplierId));
  const inviteRef = db.doc(paths.invite(tokenHash));
  let supplier!: SupplierDoc;
  const expiresAt = now + INVITE_TTL_MS;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ComprasError("notFound", 404);
    supplier = { ...(snap.data() as SupplierDoc), id: snap.id };
    if (supplier.status !== "ativo") throw new ComprasError("supplierInactive", 409);
    if (!supplier.email) throw new ComprasError("noSupplierEmail", 400);
    if (supplier.portal?.status === "active") throw new ComprasError("alreadyActive", 409);
    const prevHash = (snap.data() as { portalInviteHash?: string }).portalInviteHash;
    // ── escritas ──
    if (prevHash) tx.set(db.doc(paths.invite(prevHash)), { revokedAt: now }, { merge: true });
    const invite: InviteDoc = {
      ownerUid, supplierId, email: supplier.email.toLowerCase(), phone: supplier.whatsapp || supplier.telefone || null,
      channels, createdAt: now, expiresAt, createdBy: actor.uid, usedAt: null, usedByUid: null, revokedAt: null,
    };
    tx.create(inviteRef, invite);
    tx.update(ref, {
      portalInviteHash: tokenHash,
      portal: { ...supplier.portal, status: "invited", email: supplier.email.toLowerCase(), invitedAt: now, inviteExpiresAt: expiresAt },
      updatedAt: now,
    });
  });
  return { supplier, expiresAt };
}

export type InviteState =
  | { ok: true; invite: InviteDoc; supplier: SupplierDoc }
  | { ok: false; code: "inviteInvalid" | "inviteExpired" | "inviteUsed" | "inviteRevoked" | "supplierInactive" };

export async function readInvite(db: Firestore, token: string, now = Date.now()): Promise<InviteState> {
  const snap = await db.doc(paths.invite(hashToken(token))).get();
  if (!snap.exists) return { ok: false, code: "inviteInvalid" };
  const invite = snap.data() as InviteDoc;
  const state = inviteProblem(invite, now);
  if (state) return { ok: false, code: state };
  const s = await db.doc(paths.supplier(invite.ownerUid, invite.supplierId)).get();
  if (!s.exists) return { ok: false, code: "inviteInvalid" };
  const supplier = { ...(s.data() as SupplierDoc), id: s.id };
  if (supplier.status !== "ativo") return { ok: false, code: "supplierInactive" };
  return { ok: true, invite, supplier };
}

function inviteProblem(invite: InviteDoc, now: number) {
  if (invite.revokedAt) return "inviteRevoked" as const;
  if (invite.usedAt) return "inviteUsed" as const;
  if (invite.expiresAt <= now) return "inviteExpired" as const;
  return null;
}

/**
 * Consome o convite (uso único) e liga o login `uid` ao fornecedor. Revalida
 * tudo DENTRO da transação: dois aceites simultâneos do mesmo token → só um
 * passa (o outro vê `usedAt`).
 */
export async function acceptInvite(
  db: Firestore, token: string, uid: string, email: string, now = Date.now(),
): Promise<{ ownerUid: string; supplierId: string }> {
  const inviteRef = db.doc(paths.invite(hashToken(token)));
  let out!: { ownerUid: string; supplierId: string };
  await db.runTransaction(async (tx) => {
    const inv = await tx.get(inviteRef);
    if (!inv.exists) throw new ComprasError("inviteInvalid", 404);
    const invite = inv.data() as InviteDoc;
    const problem = inviteProblem(invite, now);
    if (problem) throw new ComprasError(problem, 410);
    if (invite.email.toLowerCase() !== email.trim().toLowerCase()) throw new ComprasError("emailMismatch", 403);
    const supplierRef = db.doc(paths.supplier(invite.ownerUid, invite.supplierId));
    const sSnap = await tx.get(supplierRef);
    if (!sSnap.exists) throw new ComprasError("inviteInvalid", 404);
    const supplier = sSnap.data() as SupplierDoc;
    if (supplier.status !== "ativo") throw new ComprasError("supplierInactive", 409);
    const prevUid = supplier.portal?.uid && supplier.portal.uid !== uid ? supplier.portal.uid : null;

    // ── escritas ──
    if (prevUid) {
      tx.set(db.doc(paths.link(prevUid, invite.ownerUid, invite.supplierId)), { active: false, revokedAt: now }, { merge: true });
    }
    const link: PortalLinkDoc = { ownerUid: invite.ownerUid, supplierId: invite.supplierId, active: true, linkedAt: now, revokedAt: null };
    tx.set(db.doc(paths.link(uid, invite.ownerUid, invite.supplierId)), link);
    tx.set(db.doc(paths.portalUser(uid)), { email: email.toLowerCase(), updatedAt: now }, { merge: true });
    tx.update(inviteRef, { usedAt: now, usedByUid: uid });
    tx.update(supplierRef, {
      portalInviteHash: null,
      portal: { status: "active", uid, email: email.toLowerCase(), invitedAt: supplier.portal?.invitedAt ?? null, activatedAt: now, inviteExpiresAt: null },
      updatedAt: now,
    });
    out = { ownerUid: invite.ownerUid, supplierId: invite.supplierId };
  });
  return out;
}

export async function revokePortal(
  db: Firestore, ownerUid: string, supplierId: string, actor: Actor, now = Date.now(),
): Promise<void> {
  const ref = db.doc(paths.supplier(ownerUid, supplierId));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ComprasError("notFound", 404);
    const s = snap.data() as SupplierDoc & { portalInviteHash?: string | null };
    if (s.portal?.uid) tx.set(db.doc(paths.link(s.portal.uid, ownerUid, supplierId)), { active: false, revokedAt: now }, { merge: true });
    if (s.portalInviteHash) tx.set(db.doc(paths.invite(s.portalInviteHash)), { revokedAt: now }, { merge: true });
    tx.update(ref, {
      portalInviteHash: null,
      portal: { ...s.portal, status: "revoked", revokedAt: now, inviteExpiresAt: null },
      updatedAt: now, updatedBy: actor.uid, updatedByName: actor.name,
    });
  });
}

export interface PortalContext {
  ownerUid: string;
  supplierId: string;
  supplier: SupplierDoc;
  linkKey: string;
}

/**
 * Resolve QUAL fornecedor o login `uid` representa. Confere os dois lados do
 * vínculo (doc de link ativo E supplier.portal.uid == uid com status ativo) —
 * revogar de qualquer um dos lados corta o acesso.
 */
export async function resolvePortal(db: Firestore, uid: string, linkKey?: string | null): Promise<PortalContext[] | PortalContext> {
  const snap = await db.collection(paths.links(uid)).get();
  const links = snap.docs
    .map((d) => ({ key: d.id, ...(d.data() as PortalLinkDoc) }))
    .filter((l) => l.active);
  const out: PortalContext[] = [];
  for (const l of links) {
    const s = await db.doc(paths.supplier(l.ownerUid, l.supplierId)).get();
    if (!s.exists) continue;
    const supplier = { ...(s.data() as SupplierDoc), id: s.id };
    if (supplier.portal?.status !== "active" || supplier.portal.uid !== uid) continue;
    out.push({ ownerUid: l.ownerUid, supplierId: l.supplierId, supplier, linkKey: l.key });
  }
  if (linkKey !== undefined) {
    const chosen = linkKey ? out.find((c) => c.linkKey === linkKey) : out[0];
    if (!chosen) throw new ComprasError("portalNoAccess", 403);
    return chosen;
  }
  return out;
}

// ─── Pedidos (fornecedor) ───────────────────────────────────────────────────

export async function createDraft(
  db: Firestore, ctx: Pick<PortalContext, "ownerUid" | "supplierId">, actor: Actor,
  requestKey: string, raw: unknown, today: string, now = Date.now(),
): Promise<{ id: string; created: boolean }> {
  const id = deterministicId("po_", ctx.ownerUid, ctx.supplierId, actor.uid, requestKey);
  const ref = db.doc(paths.order(ctx.ownerUid, id));
  const supplierRef = db.doc(paths.supplier(ctx.ownerUid, ctx.supplierId));
  const counterRef = db.doc(paths.counter(ctx.ownerUid));
  let created = false;
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) return; // mesma chave → mesmo pedido (idempotente)
    const sSnap = await tx.get(supplierRef);
    if (!sSnap.exists) throw new ComprasError("notFound", 404);
    const supplier = sSnap.data() as SupplierDoc;
    if (supplier.status !== "ativo") throw new ComprasError("supplierInactive", 409);
    const v = validateOrder(raw, { forSubmit: false, today });
    if (!v.ok) throw new ComprasError("validation", 400, v.errors);
    const counter = await tx.get(counterRef);
    const next = (Number(counter.data()?.next) || 0) + 1;

    // ── escritas ──
    tx.set(counterRef, { next, updatedAt: now });
    const order: Omit<PurchaseOrderDoc, "id"> = {
      ...v.value,
      ownerUid: ctx.ownerUid,
      number: next,
      numberLabel: numberLabel(next),
      supplierId: ctx.supplierId,
      supplierName: supplier.nomeFantasia || supplier.razaoSocial,
      supplierCnpj: supplier.cnpj,
      status: "rascunho",
      attachments: [],
      revision: 1,
      createdAt: now,
      createdBy: actor.uid,
      createdByName: actor.name,
      createdSide: actor.side,
      updatedAt: now,
      billLink: null,
    };
    tx.create(ref, order);
    tx.update(supplierRef, { orderCount: (Number(supplier.orderCount) || 0) + 1 });
    writeHistory(db, tx, ctx.ownerUid, id, {
      type: "created", at: now, actorUid: actor.uid, actorName: actor.name, actorSide: actor.side, toStatus: "rascunho",
    });
    created = true;
  });
  return { id, created };
}

async function getOwnOrder(tx: Transaction, ref: DocumentReference, supplierId: string | null): Promise<PurchaseOrderDoc> {
  const snap = await tx.get(ref);
  if (!snap.exists) throw new ComprasError("notFound", 404);
  const order = { ...(snap.data() as PurchaseOrderDoc), id: snap.id };
  // Fornecedor só enxerga o PRÓPRIO pedido; responde 404 (não 403) pra não
  // confirmar a existência de pedido alheio.
  if (supplierId !== null && order.supplierId !== supplierId) throw new ComprasError("notFound", 404);
  return order;
}

export async function saveDraft(
  db: Firestore, ctx: Pick<PortalContext, "ownerUid" | "supplierId">, orderId: string, actor: Actor,
  raw: unknown, today: string, now = Date.now(),
): Promise<void> {
  const ref = db.doc(paths.order(ctx.ownerUid, orderId));
  await db.runTransaction(async (tx) => {
    const order = await getOwnOrder(tx, ref, ctx.supplierId);
    assertAction("supplierEdit", actor, order);
    const v = validateOrder(raw, { forSubmit: false, today });
    if (!v.ok) throw new ComprasError("validation", 400, v.errors);
    const { changes } = diffOrder(editableOf(order), v.value);
    tx.update(ref, { ...v.value, updatedAt: now });
    if (changes.length) {
      writeHistory(db, tx, ctx.ownerUid, orderId, {
        type: "updated", at: now, actorUid: actor.uid, actorName: actor.name, actorSide: actor.side, changes: changes.slice(0, 50),
      });
    }
  });
}

/**
 * Envia o rascunho pra análise. Idempotente por `submitKey`: o mesmo clique
 * reenviado (rede instável, duplo clique) devolve `already: true` sem gerar
 * outro envio nem outra notificação.
 */
export async function submitOrder(
  db: Firestore, ctx: Pick<PortalContext, "ownerUid" | "supplierId">, orderId: string, actor: Actor,
  submitKey: string, today: string, now = Date.now(),
): Promise<{ already: boolean; order: PurchaseOrderDoc }> {
  const ref = db.doc(paths.order(ctx.ownerUid, orderId));
  const supplierRef = db.doc(paths.supplier(ctx.ownerUid, ctx.supplierId));
  let result!: { already: boolean; order: PurchaseOrderDoc };
  await db.runTransaction(async (tx) => {
    const order = await getOwnOrder(tx, ref, ctx.supplierId);
    if (order.status !== "rascunho" && order.lastSubmitKey === submitKey) {
      result = { already: true, order };
      return;
    }
    const sSnap = await tx.get(supplierRef);
    if (!sSnap.exists || (sSnap.data() as SupplierDoc).status !== "ativo") throw new ComprasError("supplierInactive", 409);
    const to = assertAction("submit", actor, order) as OrderStatus;
    // Revalida o que está GRAVADO (o cliente não manda valores no envio).
    const v = validateOrder(editableOf(order), { forSubmit: true, today });
    if (!v.ok) throw new ComprasError("validation", 400, v.errors);
    const patch = { ...v.value, status: to, submittedAt: now, lastSubmitKey: submitKey, updatedAt: now };
    tx.update(ref, patch);
    writeHistory(db, tx, ctx.ownerUid, orderId, {
      type: "submitted", at: now, actorUid: actor.uid, actorName: actor.name, actorSide: actor.side, fromStatus: order.status, toStatus: to,
    });
    result = { already: false, order: { ...order, ...patch } };
  });
  return result;
}

// ─── Transições ─────────────────────────────────────────────────────────────

export type TransitionAction = "supplierCancel" | "startReview" | "approve" | "reject" | "cancel" | "complete";

const HISTORY_OF: Record<TransitionAction, HistoryEvent["type"]> = {
  supplierCancel: "cancelled",
  startReview: "review_started",
  approve: "approved",
  reject: "rejected",
  cancel: "cancelled",
  complete: "completed",
};

/**
 * Muda o status. `supplierId` restringe ao pedido do fornecedor (portal);
 * `expectedRevision` (aprovação) garante que se aprova exatamente a versão
 * revisada — se alguém alterou o pedido no meio, falha com staleRevision.
 */
export async function transitionOrder(
  db: Firestore, ownerUid: string, orderId: string, action: TransitionAction, actor: Actor,
  opts: { reason?: string | null; supplierId?: string | null; expectedRevision?: number | null } = {}, now = Date.now(),
): Promise<{ order: PurchaseOrderDoc; from: OrderStatus; to: OrderStatus }> {
  const ref = db.doc(paths.order(ownerUid, orderId));
  let out!: { order: PurchaseOrderDoc; from: OrderStatus; to: OrderStatus };
  await db.runTransaction(async (tx) => {
    const order = await getOwnOrder(tx, ref, opts.supplierId ?? null);
    const to = assertAction(action, actor, order) as OrderStatus;
    const needsReason = action === "reject" || action === "cancel" || action === "supplierCancel";
    const reason = (opts.reason ?? "").trim();
    if (needsReason && reason.length < 3) throw new ComprasError("reasonRequired", 400, { reason: "reasonRequired" });
    if (action === "approve" && opts.expectedRevision != null && opts.expectedRevision !== order.revision) {
      throw new ComprasError("staleRevision", 409);
    }

    const patch: Record<string, unknown> = { status: to, updatedAt: now };
    if (action === "startReview") patch.reviewStartedAt = now;
    if (action === "approve") {
      Object.assign(patch, { approvedAt: now, approvedBy: actor.uid, approvedByName: actor.name, approvedTotal: order.total });
    }
    if (action === "reject") {
      Object.assign(patch, { rejectedAt: now, rejectedBy: actor.uid, rejectedByName: actor.name, rejectionReason: reason });
    }
    if (action === "cancel" || action === "supplierCancel") {
      Object.assign(patch, { cancelledAt: now, cancelledBy: actor.uid, cancelledByName: actor.name, cancelReason: reason });
    }
    if (action === "complete") patch.completedAt = now;

    tx.update(ref, patch);
    writeHistory(db, tx, ownerUid, orderId, {
      type: HISTORY_OF[action], at: now, actorUid: actor.uid, actorName: actor.name, actorSide: actor.side,
      fromStatus: order.status, toStatus: to, reason: needsReason ? reason : null,
    });
    out = { order: { ...order, ...(patch as Partial<PurchaseOrderDoc>) }, from: order.status, to };
  });
  return out;
}

/**
 * Ajuste da equipe interna (itens, valores, condições) durante a análise.
 * Pedido APROVADO com mudança relevante volta pra "em_analise" e exige nova
 * aprovação — nada muda em silêncio; cada alteração vai pro histórico.
 */
export async function internalEditOrder(
  db: Firestore, ownerUid: string, orderId: string, actor: Actor, raw: unknown,
  extra: { internalNotes?: string; category?: string; costCenterId?: string | null },
  expectedRevision: number | null, today: string, now = Date.now(),
): Promise<{ reapproval: boolean; revision: number }> {
  const ref = db.doc(paths.order(ownerUid, orderId));
  let out!: { reapproval: boolean; revision: number };
  await db.runTransaction(async (tx) => {
    const order = await getOwnOrder(tx, ref, null);
    assertAction("internalEdit", actor, order);
    if (expectedRevision != null && expectedRevision !== order.revision) throw new ComprasError("staleRevision", 409);
    const v = validateOrder(raw, { forSubmit: true, today });
    if (!v.ok) throw new ComprasError("validation", 400, v.errors);
    const { changes, relevant } = diffOrder(editableOf(order), v.value);
    const reapproval = relevant && order.status === "aprovado";
    const revision = relevant ? order.revision + 1 : order.revision;

    const patch: Record<string, unknown> = { ...v.value, revision, updatedAt: now };
    if (extra.internalNotes !== undefined) patch.internalNotes = String(extra.internalNotes).slice(0, 2000);
    if (extra.category !== undefined) patch.category = extra.category;
    if (extra.costCenterId !== undefined) patch.costCenterId = extra.costCenterId;
    if (reapproval) {
      Object.assign(patch, { status: "em_analise", approvedAt: null, approvedBy: null, approvedByName: null, approvedTotal: null });
    }
    tx.update(ref, patch);
    if (changes.length) {
      writeHistory(db, tx, ownerUid, orderId, {
        type: "updated", at: now, actorUid: actor.uid, actorName: actor.name, actorSide: actor.side, changes: changes.slice(0, 50),
      });
    }
    if (reapproval) {
      writeHistory(db, tx, ownerUid, orderId, {
        type: "reapproval_required", at: now, actorUid: actor.uid, actorName: actor.name, actorSide: actor.side,
        fromStatus: "aprovado", toStatus: "em_analise",
      });
    }
    out = { reapproval, revision };
  });
  return out;
}

// ─── Anexos ─────────────────────────────────────────────────────────────────

export async function addAttachment(
  db: Firestore, ownerUid: string, orderId: string, att: OrderAttachment, actor: Actor,
  supplierId: string | null, now = Date.now(),
): Promise<void> {
  const ref = db.doc(paths.order(ownerUid, orderId));
  await db.runTransaction(async (tx) => {
    const order = await getOwnOrder(tx, ref, supplierId);
    assertAction(actor.side === "supplier" ? "supplierAttach" : "internalAttach", actor, order);
    const list = Array.isArray(order.attachments) ? order.attachments : [];
    if (list.length >= MAX_ATTACHMENTS) throw new ComprasError("tooManyAttachments", 400);
    tx.update(ref, { attachments: [...list, att], updatedAt: now });
    writeHistory(db, tx, ownerUid, orderId, {
      type: "attachment_added", at: now, actorUid: actor.uid, actorName: actor.name, actorSide: actor.side, detail: att.name,
    });
  });
}

/** Tira o anexo do pedido e devolve o caminho no Storage (a rota apaga o arquivo). */
export async function removeAttachment(
  db: Firestore, ownerUid: string, orderId: string, attachmentId: string, actor: Actor,
  supplierId: string | null, now = Date.now(),
): Promise<OrderAttachment> {
  const ref = db.doc(paths.order(ownerUid, orderId));
  let removed!: OrderAttachment;
  await db.runTransaction(async (tx) => {
    const order = await getOwnOrder(tx, ref, supplierId);
    assertAction(actor.side === "supplier" ? "supplierAttach" : "internalAttach", actor, order);
    const list = Array.isArray(order.attachments) ? order.attachments : [];
    const att = list.find((a) => a.id === attachmentId);
    // Cada lado só remove o que é seu (a equipe não apaga a proposta do fornecedor).
    if (!att || att.side !== actor.side) throw new ComprasError("attachmentNotFound", 404);
    tx.update(ref, { attachments: list.filter((a) => a.id !== attachmentId), updatedAt: now });
    writeHistory(db, tx, ownerUid, orderId, {
      type: "attachment_removed", at: now, actorUid: actor.uid, actorName: actor.name, actorSide: actor.side, detail: att.name,
    });
    removed = att;
  });
  return removed;
}

// ─── Visão do fornecedor ────────────────────────────────────────────────────

/** O que o portal pode ver de um pedido (sem notas internas, centro de custo, vínculo financeiro…). */
export function supplierOrderView(o: PurchaseOrderDoc) {
  return {
    id: o.id,
    number: o.number,
    numberLabel: o.numberLabel,
    status: o.status,
    issueDate: o.issueDate,
    validUntil: o.validUntil,
    deliveryDays: o.deliveryDays,
    paymentTerms: o.paymentTerms,
    proposedInstallments: o.proposedInstallments,
    proposedFirstDueDays: o.proposedFirstDueDays,
    items: o.items,
    adjustments: o.adjustments,
    notes: o.notes,
    subtotal: o.subtotal,
    total: o.total,
    attachments: (o.attachments ?? []).filter((a) => a.side === "supplier").map((a) => ({
      id: a.id, name: a.name, size: a.size, contentType: a.contentType, uploadedAt: a.uploadedAt,
    })),
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    submittedAt: o.submittedAt ?? null,
    reviewStartedAt: o.reviewStartedAt ?? null,
    approvedAt: o.approvedAt ?? null,
    rejectedAt: o.rejectedAt ?? null,
    rejectionReason: o.rejectionReason ?? null,
    cancelledAt: o.cancelledAt ?? null,
    cancelReason: o.cancelReason ?? null,
    completedAt: o.completedAt ?? null,
  };
}
export type SupplierOrderView = ReturnType<typeof supplierOrderView>;

// ─── Conversão pedido → Contas a Pagar ──────────────────────────────────────

export interface BillParams {
  installments: number;
  firstDueDate: string;
  category: string;
  costCenterId?: string | null;
  paymentMethod?: string | null;
}

/** Espelha app/types/payment.ts (PAYMENT_METHODS) — sem import pra rodar nos testes. */
export const PAYMENT_METHODS_OK = new Set(["dinheiro", "conta_corrente", "cheque", "pix", "cartao_credito", "cartao_debito", "transferencia", "boleto"]);

export function validateBillParams(raw: unknown): BillParams | null {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const installments = Number(r.installments);
  const firstDueDate = String(r.firstDueDate ?? "");
  const category = String(r.category ?? "");
  if (!Number.isInteger(installments) || installments < 1 || installments > MAX_INSTALLMENTS) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstDueDate)) return null;
  if (!CASHFLOW_CATEGORIES.saida.includes(category)) return null;
  const costCenterId = typeof r.costCenterId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(r.costCenterId) ? r.costCenterId : null;
  const pm = typeof r.paymentMethod === "string" && PAYMENT_METHODS_OK.has(r.paymentMethod) ? r.paymentMethod : null;
  return { installments, firstDueDate, category, costCenterId, paymentMethod: pm };
}

/** Monta os docs de bills (mesmo formato do Contas a Pagar) — pura, testável. */
export function buildBillDocs(
  order: PurchaseOrderDoc, supplier: Pick<SupplierDoc, "razaoSocial" | "nomeFantasia" | "cnpj"> | null,
  params: BillParams, actor: Actor, now: number,
): { id: string; data: Record<string, unknown> }[] {
  const n = params.installments;
  const amounts = splitInstallments(order.total, n);
  const seriesId = n > 1 ? `po_${order.id}` : null;
  const name = supplier?.nomeFantasia || supplier?.razaoSocial || order.supplierName;
  const title = `Pedido ${order.numberLabel} — ${name}`;
  const notes = [
    `Gerado do pedido de compra ${order.numberLabel}.`,
    order.paymentTerms ? `Condições: ${order.paymentTerms}` : "",
    (order.attachments ?? []).length ? `Anexos: ${(order.attachments ?? []).map((a) => a.name).join(", ")} (ver o pedido em Compras).` : "",
  ].filter(Boolean).join("\n");
  return amounts.map((amount, i) => ({
    id: `po_${order.id}_${i + 1}`,
    data: stripUndefined({
      title,
      amount,
      dueDate: addMonthsClamped(params.firstDueDate, i),
      category: params.category,
      status: "pendente",
      recurrence: n > 1 ? "numeral" : "unica",
      ...(n > 1 ? { seriesId, installmentIndex: i + 1, installmentCount: n } : {}),
      notes,
      photos: [],
      createdAt: now,
      userId: order.ownerUid,
      partyName: supplier?.razaoSocial || order.supplierName,
      partyDoc: supplier?.cnpj || order.supplierCnpj,
      paymentMethod: params.paymentMethod ?? undefined,
      costCenterId: params.costCenterId ?? undefined,
      purchaseOrderId: order.id,
      purchaseOrderNumber: order.numberLabel,
      createdBy: actor.uid,
      createdByName: actor.name,
    }),
  }));
}

/**
 * Gera os lançamentos no Contas a Pagar. Idempotente: os IDs são
 * determinísticos (po_{pedido}_{parcela}) e o vínculo `billLink` é gravado no
 * pedido na MESMA transação — chamar de novo devolve o vínculo existente.
 */
export async function generateBills(
  db: Firestore, ownerUid: string, orderId: string, actor: Actor, params: BillParams, now = Date.now(),
): Promise<{ already: boolean; link: BillLink }> {
  const ref = db.doc(paths.order(ownerUid, orderId));
  let out!: { already: boolean; link: BillLink };
  await db.runTransaction(async (tx) => {
    const order = await getOwnOrder(tx, ref, null);
    if (order.billLink) {
      out = { already: true, link: order.billLink };
      return;
    }
    assertAction("generateBills", actor, order);
    if (params.costCenterId) {
      const cc = await tx.get(db.doc(`costCenters/${params.costCenterId}`));
      if (!cc.exists || cc.data()?.userId !== ownerUid) throw new ComprasError("costCenterNotFound", 400);
    }
    const sSnap = await tx.get(db.doc(paths.supplier(ownerUid, order.supplierId)));
    const supplier = sSnap.exists ? (sSnap.data() as SupplierDoc) : null;
    // Total revalidado no servidor a partir dos itens gravados.
    const totals = computeTotals(order.items, order.adjustments);
    const fixed = { ...order, total: totals.total, subtotal: totals.subtotal };
    const bills = buildBillDocs(fixed, supplier, params, actor, now);
    const billRefs = bills.map((b) => db.doc(paths.bill(ownerUid, b.id)));
    for (const r of billRefs) {
      const s = await tx.get(r);
      if (s.exists) throw new ComprasError("billExists", 409);
    }
    // ── escritas ──
    bills.forEach((b, i) => tx.create(billRefs[i], b.data));
    const link: BillLink = {
      billIds: bills.map((b) => b.id),
      seriesId: params.installments > 1 ? `po_${order.id}` : null,
      total: totals.total,
      createdAt: now,
      createdBy: actor.uid,
      createdByName: actor.name,
    };
    tx.update(ref, { billLink: link, category: params.category, costCenterId: params.costCenterId ?? null, updatedAt: now });
    writeHistory(db, tx, ownerUid, orderId, {
      type: "bills_generated", at: now, actorUid: actor.uid, actorName: actor.name, actorSide: actor.side,
      detail: `${bills.length} lançamento(s) · ${link.billIds.join(", ")}`,
    });
    out = { already: false, link };
  });
  return out;
}

/** Sugestão de 1º vencimento a partir da proposta do fornecedor. */
export const suggestedFirstDue = (o: Pick<OrderEditable, "issueDate" | "proposedFirstDueDays">) =>
  addDaysIso(o.issueDate, o.proposedFirstDueDays);
