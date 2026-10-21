// lib/compras/types.ts
// ─── Módulo de Compras (Contas a Pagar) + portal do fornecedor ───────────────
//
// Modelo de dados (Firestore). Tudo é ESCRITO só pelo servidor (Admin SDK, rotas
// app/api/compras/**); o app interno LÊ pelo client SDK (firestore.rules libera
// leitura pra conta) e o fornecedor NUNCA lê o Firestore direto — só pelas rotas
// /api/compras/portal/**, que devolvem uma visão filtrada.
//
//   users/{ownerUid}/suppliers/{supplierId}           cadastro do fornecedor
//   users/{ownerUid}/supplierCnpjIndex/{cnpj}         trava de CNPJ duplicado (por conta)
//   users/{ownerUid}/purchaseOrders/{orderId}         pedido de compra
//   users/{ownerUid}/purchaseOrders/{orderId}/history/{eventId}   auditoria do pedido
//   users/{ownerUid}/comprasNotifications/{logId}     log de envios (e-mail/WhatsApp)
//   users/{ownerUid}/counters/purchaseOrders          contador transacional do nº
//   users/{ownerUid}/bills/po_{orderId}_{n}           lançamentos gerados (ID determinístico)
//
//   supplierInvites/{sha256(token)}                   convite (só o HASH do token)
//   supplierPortalUsers/{uid}/links/{ownerUid}__{supplierId}   vínculo login ↔ fornecedor
//
// Este arquivo só tem tipos e constantes — sem import de runtime — pra poder ser
// usado no client, no servidor e nos testes (node --test).

export const ORDER_STATUSES = [
  "rascunho",
  "enviado",
  "em_analise",
  "aprovado",
  "recusado",
  "cancelado",
  "concluido",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const SUPPLIER_STATUSES = ["ativo", "inativo"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];

export type PortalStatus = "none" | "invited" | "active" | "revoked";

export const UNITS = ["un", "cx", "pc", "kg", "g", "l", "ml", "m", "m2", "m3", "h", "serv", "pct", "par", "dz"] as const;
export type Unit = (typeof UNITS)[number];

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
  "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export interface SupplierAddress {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string; // só dígitos
  cidade: string;
  uf: string;
}

/** Campos editáveis pela empresa. */
export interface SupplierInput {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string; // só dígitos
  ie: string;
  responsavel: string;
  email: string;
  telefone: string; // só dígitos
  whatsapp: string; // só dígitos
  endereco: SupplierAddress;
  categoria: string;
  observacoes: string; // INTERNO — nunca vai pro portal
  status: SupplierStatus;
}

/** Subconjunto que o PRÓPRIO fornecedor pode atualizar pelo portal. */
export const SUPPLIER_SELF_FIELDS = ["nomeFantasia", "ie", "responsavel", "telefone", "whatsapp", "endereco", "categoria"] as const;
export type SupplierSelfField = (typeof SUPPLIER_SELF_FIELDS)[number];

export interface SupplierPortalInfo {
  status: PortalStatus;
  uid?: string | null;
  email?: string | null;
  invitedAt?: number | null;
  inviteExpiresAt?: number | null;
  activatedAt?: number | null;
  revokedAt?: number | null;
}

export interface SupplierDoc extends SupplierInput {
  id: string;
  ownerUid: string;
  portal: SupplierPortalInfo;
  orderCount?: number;
  createdAt: number;
  createdBy?: string;
  createdByName?: string;
  updatedAt?: number;
  updatedBy?: string;
  updatedByName?: string;
}

export interface OrderItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  /** quantity × unitPrice, arredondado — calculado no servidor. */
  total: number;
}

/** Valores informados (descontos/acréscimos em R$). */
export interface OrderAdjustments {
  discount: number;
  taxes: number;
  freight: number;
  otherCosts: number;
}

export interface OrderTotals extends OrderAdjustments {
  subtotal: number;
  total: number;
}

export interface OrderAttachment {
  id: string;
  name: string;
  size: number;
  contentType: string;
  path: string;
  side: "supplier" | "internal";
  uploadedAt: number;
  uploadedBy: string;
  uploadedByName: string;
}

/** Campos do pedido editáveis (pelo fornecedor no rascunho; pela equipe na análise). */
export interface OrderEditable {
  issueDate: string; // YYYY-MM-DD
  validUntil: string; // YYYY-MM-DD ou ""
  deliveryDays: number | null;
  paymentTerms: string;
  /** Proposta de parcelas (1 = à vista) e prazo da 1ª em dias. */
  proposedInstallments: number;
  proposedFirstDueDays: number;
  items: OrderItem[];
  adjustments: OrderAdjustments;
  notes: string;
}

export interface BillLink {
  billIds: string[];
  seriesId: string | null;
  total: number;
  createdAt: number;
  createdBy: string;
  createdByName: string;
}

export interface PurchaseOrderDoc extends OrderEditable {
  id: string;
  ownerUid: string;
  number: number;
  numberLabel: string;
  supplierId: string;
  supplierName: string;
  supplierCnpj: string;
  status: OrderStatus;
  subtotal: number;
  total: number;
  attachments: OrderAttachment[];
  /** Notas da equipe interna — nunca vão pro portal. */
  internalNotes?: string;
  category?: string;
  costCenterId?: string | null;
  revision: number;
  createdAt: number;
  createdBy: string;
  createdByName: string;
  createdSide: "supplier" | "internal";
  updatedAt: number;
  submittedAt?: number | null;
  lastSubmitKey?: string | null;
  reviewStartedAt?: number | null;
  approvedAt?: number | null;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedTotal?: number | null;
  rejectedAt?: number | null;
  rejectedBy?: string | null;
  rejectedByName?: string | null;
  rejectionReason?: string | null;
  cancelledAt?: number | null;
  cancelledBy?: string | null;
  cancelledByName?: string | null;
  cancelReason?: string | null;
  completedAt?: number | null;
  billLink?: BillLink | null;
}

export type HistoryType =
  | "created"
  | "updated"
  | "submitted"
  | "review_started"
  | "approved"
  | "rejected"
  | "cancelled"
  | "completed"
  | "reapproval_required"
  | "attachment_added"
  | "attachment_removed"
  | "bills_generated";

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface HistoryEvent {
  type: HistoryType;
  at: number;
  actorUid: string;
  actorName: string;
  actorSide: "supplier" | "internal";
  fromStatus?: OrderStatus | null;
  toStatus?: OrderStatus | null;
  reason?: string | null;
  changes?: FieldChange[];
  detail?: string | null;
}

export interface InviteDoc {
  ownerUid: string;
  supplierId: string;
  email: string;
  phone: string | null;
  channels: ("email" | "whatsapp")[];
  createdAt: number;
  expiresAt: number;
  createdBy: string;
  usedAt: number | null;
  usedByUid: string | null;
  revokedAt: number | null;
}

export interface PortalLinkDoc {
  ownerUid: string;
  supplierId: string;
  active: boolean;
  linkedAt: number;
  revokedAt?: number | null;
}

export type NotificationChannel = "email" | "whatsapp";
export type NotificationStatus = "sent" | "failed" | "not_configured" | "invalid_recipient" | "fallback_link";

export interface NotificationLog {
  channel: NotificationChannel;
  kind: string;
  to: string;
  status: NotificationStatus;
  error?: string | null;
  providerId?: string | null;
  orderId?: string | null;
  supplierId?: string | null;
  at: number;
}

/** Validade padrão do convite. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_ITEMS = 200;
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // limite de corpo da Vercel (~4,5 MB)
export const MAX_INSTALLMENTS = 24;
export const MAX_MONEY = 100_000_000; // R$ 100 mi por campo — teto de sanidade
