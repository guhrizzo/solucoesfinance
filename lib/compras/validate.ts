// lib/compras/validate.ts
// Validação + saneamento dos dados de fornecedor e de pedido. Usada no client
// (mensagem imediata no formulário) e no servidor (a fonte da verdade — nada é
// gravado sem passar por aqui). Erros saem como CÓDIGOS estáveis por campo; a
// tela traduz com `compras.errors.<código>`.

import { isValidCnpj } from "../contract";
import { computeTotals, round2 } from "./calc";
import {
  MAX_INSTALLMENTS, MAX_ITEMS, MAX_MONEY, SUPPLIER_STATUSES, UFS, UNITS,
  type OrderAdjustments, type OrderEditable, type OrderItem, type SupplierAddress,
  type SupplierInput, type SupplierSelfField, type SupplierStatus,
} from "./types";

export type FieldErrors = Record<string, string>;
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export const onlyDigits = (s: unknown): string => String(s ?? "").replace(/\D/g, "");
const str = (v: unknown, max: number): string => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const multiline = (v: unknown, max: number): string =>
  String(v ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (s: string): boolean => EMAIL_RE.test(s.trim());
/** Telefone BR com DDD: 10 (fixo) ou 11 (celular) dígitos; aceita 55 na frente. */
export function normalizePhone(raw: unknown): string {
  let d = onlyDigits(raw);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}
export const isValidPhone = (d: string): boolean => d.length === 10 || d.length === 11;

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isIsoDate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function maskCnpj(raw: string): string {
  const d = onlyDigits(raw).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function maskPhone(raw: string): string {
  const d = normalizePhone(raw).slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function maskCep(raw: string): string {
  const d = onlyDigits(raw).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export { isValidCnpj };

// ─── Fornecedor ─────────────────────────────────────────────────────────────

function parseAddress(raw: unknown, errors: FieldErrors, required: boolean): SupplierAddress {
  const a = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const addr: SupplierAddress = {
    logradouro: str(a.logradouro, 160),
    numero: str(a.numero, 20),
    complemento: str(a.complemento, 80),
    bairro: str(a.bairro, 80),
    cep: onlyDigits(a.cep).slice(0, 8),
    cidade: str(a.cidade, 80),
    uf: str(a.uf, 2).toUpperCase(),
  };
  if (required) {
    if (!addr.logradouro) errors["endereco.logradouro"] = "required";
    if (!addr.numero) errors["endereco.numero"] = "required";
    if (!addr.cidade) errors["endereco.cidade"] = "required";
  }
  if (addr.cep && addr.cep.length !== 8) errors["endereco.cep"] = "invalidCep";
  if (required && !addr.cep) errors["endereco.cep"] = "required";
  if (addr.uf && !(UFS as readonly string[]).includes(addr.uf)) errors["endereco.uf"] = "invalidUf";
  if (required && !addr.uf) errors["endereco.uf"] = "required";
  return addr;
}

/** Cadastro completo (empresa criando/editando o fornecedor). */
export function validateSupplier(raw: unknown): Validated<SupplierInput> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const errors: FieldErrors = {};

  const value: SupplierInput = {
    razaoSocial: str(r.razaoSocial, 160),
    nomeFantasia: str(r.nomeFantasia, 120),
    cnpj: onlyDigits(r.cnpj).slice(0, 14),
    ie: str(r.ie, 20),
    responsavel: str(r.responsavel, 120),
    email: str(r.email, 160).toLowerCase(),
    telefone: normalizePhone(r.telefone),
    whatsapp: normalizePhone(r.whatsapp),
    endereco: parseAddress(r.endereco, errors, true),
    categoria: str(r.categoria, 80),
    observacoes: multiline(r.observacoes, 2000),
    status: (SUPPLIER_STATUSES as readonly string[]).includes(String(r.status)) ? (r.status as SupplierStatus) : "ativo",
  };

  if (value.razaoSocial.length < 2) errors.razaoSocial = "required";
  if (!value.cnpj) errors.cnpj = "required";
  else if (!isValidCnpj(value.cnpj)) errors.cnpj = "invalidCnpj";
  if (value.ie && !/^[0-9A-Za-z.\-/ ]+$/.test(value.ie)) errors.ie = "invalidIe";
  if (!value.responsavel) errors.responsavel = "required";
  if (!value.email) errors.email = "required";
  else if (!isValidEmail(value.email)) errors.email = "invalidEmail";
  if (!value.telefone) errors.telefone = "required";
  else if (!isValidPhone(value.telefone)) errors.telefone = "invalidPhone";
  if (value.whatsapp && !isValidPhone(value.whatsapp)) errors.whatsapp = "invalidPhone";
  if (!value.categoria) errors.categoria = "required";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** Atualização feita pelo próprio fornecedor no portal — só campos permitidos. */
export function validateSupplierSelf(raw: unknown): Validated<Pick<SupplierInput, SupplierSelfField>> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const errors: FieldErrors = {};
  const value = {
    nomeFantasia: str(r.nomeFantasia, 120),
    ie: str(r.ie, 20),
    responsavel: str(r.responsavel, 120),
    telefone: normalizePhone(r.telefone),
    whatsapp: normalizePhone(r.whatsapp),
    endereco: parseAddress(r.endereco, errors, true),
    categoria: str(r.categoria, 80),
  };
  if (value.ie && !/^[0-9A-Za-z.\-/ ]+$/.test(value.ie)) errors.ie = "invalidIe";
  if (!value.responsavel) errors.responsavel = "required";
  if (!value.telefone) errors.telefone = "required";
  else if (!isValidPhone(value.telefone)) errors.telefone = "invalidPhone";
  if (value.whatsapp && !isValidPhone(value.whatsapp)) errors.whatsapp = "invalidPhone";
  if (!value.categoria) errors.categoria = "required";
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

// ─── Pedido ─────────────────────────────────────────────────────────────────

function money(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > MAX_MONEY) return null;
  return round2(n);
}

function qty(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return Math.round(n * 1000) / 1000;
}

/**
 * Normaliza os campos editáveis do pedido. `forSubmit` aplica as regras de
 * envio (pelo menos 1 item, total > 0). No rascunho só a lista VAZIA é
 * tolerada — todo item presente precisa ser válido.
 */
export function validateOrder(raw: unknown, opts: { forSubmit: boolean; today: string }): Validated<OrderEditable & { subtotal: number; total: number }> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const errors: FieldErrors = {};

  const rawItems = Array.isArray(r.items) ? r.items : [];
  if (rawItems.length > MAX_ITEMS) errors.items = "tooManyItems";
  const items: OrderItem[] = rawItems.slice(0, MAX_ITEMS).map((it, i) => {
    const o = (it && typeof it === "object" ? it : {}) as Record<string, unknown>;
    const description = str(o.description, 300);
    const quantity = qty(o.quantity);
    const unit = str(o.unit, 10).toLowerCase();
    const unitPrice = money(o.unitPrice);
    if (!description) errors[`items.${i}.description`] = "required";
    if (quantity === null) errors[`items.${i}.quantity`] = "invalidQuantity";
    if (!(UNITS as readonly string[]).includes(unit)) errors[`items.${i}.unit`] = "invalidUnit";
    if (unitPrice === null) errors[`items.${i}.unitPrice`] = "invalidMoney";
    return { description, quantity: quantity ?? 0, unit, unitPrice: unitPrice ?? 0, total: 0 };
  });

  const a = (r.adjustments && typeof r.adjustments === "object" ? r.adjustments : {}) as Record<string, unknown>;
  const adjustments: OrderAdjustments = { discount: 0, taxes: 0, freight: 0, otherCosts: 0 };
  for (const k of ["discount", "taxes", "freight", "otherCosts"] as const) {
    const v = money(a[k] ?? 0);
    if (v === null) errors[`adjustments.${k}`] = "invalidMoney";
    adjustments[k] = v ?? 0;
  }

  const issueDate = str(r.issueDate, 10) || opts.today;
  if (!isIsoDate(issueDate)) errors.issueDate = "invalidDate";
  const validUntil = str(r.validUntil, 10);
  if (validUntil && !isIsoDate(validUntil)) errors.validUntil = "invalidDate";
  else if (validUntil && isIsoDate(issueDate) && validUntil < issueDate) errors.validUntil = "validBeforeIssue";

  let deliveryDays: number | null = null;
  if (r.deliveryDays !== null && r.deliveryDays !== undefined && r.deliveryDays !== "") {
    const n = Number(r.deliveryDays);
    if (!Number.isInteger(n) || n < 0 || n > 3650) errors.deliveryDays = "invalidDays";
    else deliveryDays = n;
  }

  const proposedInstallments = Number(r.proposedInstallments ?? 1);
  if (!Number.isInteger(proposedInstallments) || proposedInstallments < 1 || proposedInstallments > MAX_INSTALLMENTS) {
    errors.proposedInstallments = "invalidInstallments";
  }
  const proposedFirstDueDays = Number(r.proposedFirstDueDays ?? 30);
  if (!Number.isInteger(proposedFirstDueDays) || proposedFirstDueDays < 0 || proposedFirstDueDays > 365) {
    errors.proposedFirstDueDays = "invalidDays";
  }

  const totals = computeTotals(items, adjustments);
  const itemsWithTotal = items.map((it) => ({ ...it, total: computeTotals([it], { discount: 0, taxes: 0, freight: 0, otherCosts: 0 }).subtotal }));

  if (adjustments.discount > totals.subtotal + totals.taxes + totals.freight + totals.otherCosts) {
    errors["adjustments.discount"] = "discountTooHigh";
  }
  if (opts.forSubmit) {
    if (items.length === 0) errors.items = "itemsRequired";
    if (totals.total <= 0) errors.total = "totalZero";
  }

  const value = {
    issueDate,
    validUntil,
    deliveryDays,
    paymentTerms: multiline(r.paymentTerms, 500),
    proposedInstallments: Number.isInteger(proposedInstallments) ? Math.min(Math.max(proposedInstallments, 1), MAX_INSTALLMENTS) : 1,
    proposedFirstDueDays: Number.isInteger(proposedFirstDueDays) ? Math.min(Math.max(proposedFirstDueDays, 0), 365) : 30,
    items: itemsWithTotal,
    adjustments,
    notes: multiline(r.notes, 2000),
    subtotal: totals.subtotal,
    total: totals.total,
  };
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/** Motivo obrigatório (recusa/cancelamento): 3..500 caracteres. */
export function validateReason(raw: unknown): string | null {
  const s = multiline(raw, 500);
  return s.length >= 3 ? s : null;
}
