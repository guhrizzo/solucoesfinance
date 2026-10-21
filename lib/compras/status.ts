// lib/compras/status.ts
// Máquina de estados do pedido de compra + matriz de permissão por papel.
// Fonte única pra servidor (autoriza de verdade) e client (só esconde botões).
//
//   rascunho → enviado → em_analise → aprovado → concluido
//                  │           │          │
//                  └───────────┴─→ recusado / cancelado
//
// Papéis:
//   supplier  fornecedor logado no portal (só o próprio pedido)
//   editor    dono ou membro com "contasPagar" (fornecedores, análise, ajuste)
//   approver  dono ou membro com "comprasAprovacao" (aprovar/recusar/cancelar,
//             concluir e gerar o lançamento no Contas a Pagar)

import type { FieldChange, OrderEditable, OrderStatus } from "./types";

export type OrderAction =
  | "supplierEdit"
  | "submit"
  | "supplierCancel"
  | "supplierAttach"
  | "startReview"
  | "internalEdit"
  | "internalAttach"
  | "approve"
  | "reject"
  | "cancel"
  | "complete"
  | "generateBills";

export type Role = "supplier" | "editor" | "approver";

interface Rule {
  from: readonly OrderStatus[];
  to?: OrderStatus;
  role: Role;
  /** Exige que o pedido ainda NÃO tenha gerado lançamento no Contas a Pagar. */
  noBills?: boolean;
  /** Motivo obrigatório. */
  reason?: boolean;
}

export const ACTION_RULES: Record<OrderAction, Rule> = {
  supplierEdit: { from: ["rascunho"], role: "supplier" },
  submit: { from: ["rascunho"], to: "enviado", role: "supplier" },
  supplierCancel: { from: ["rascunho", "enviado"], to: "cancelado", role: "supplier", reason: true },
  supplierAttach: { from: ["rascunho"], role: "supplier" },
  startReview: { from: ["enviado"], to: "em_analise", role: "editor" },
  internalEdit: { from: ["enviado", "em_analise", "aprovado"], role: "editor", noBills: true },
  internalAttach: { from: ["enviado", "em_analise", "aprovado", "recusado", "concluido"], role: "editor" },
  approve: { from: ["enviado", "em_analise"], to: "aprovado", role: "approver" },
  reject: { from: ["enviado", "em_analise"], to: "recusado", role: "approver", reason: true },
  cancel: { from: ["enviado", "em_analise", "aprovado"], to: "cancelado", role: "approver", reason: true, noBills: true },
  complete: { from: ["aprovado"], to: "concluido", role: "approver" },
  generateBills: { from: ["aprovado", "concluido"], role: "approver", noBills: true },
};

export interface ActorRoles {
  supplier?: boolean;
  canEdit?: boolean;
  canApprove?: boolean;
}

export function hasRole(actor: ActorRoles, role: Role): boolean {
  if (role === "supplier") return !!actor.supplier;
  if (role === "editor") return !!actor.canEdit && !actor.supplier;
  return !!actor.canApprove && !actor.supplier;
}

export type CheckResult = { ok: true; to?: OrderStatus } | { ok: false; code: "forbidden" | "invalidStatus" | "hasBills" };

/** Pode `actor` executar `action` num pedido em `status`? */
export function checkAction(
  action: OrderAction,
  actor: ActorRoles,
  order: { status: OrderStatus; billLink?: unknown },
): CheckResult {
  const rule = ACTION_RULES[action];
  if (!hasRole(actor, rule.role)) return { ok: false, code: "forbidden" };
  if (!rule.from.includes(order.status)) return { ok: false, code: "invalidStatus" };
  if (rule.noBills && order.billLink) return { ok: false, code: "hasBills" };
  return { ok: true, to: rule.to };
}

export const FINAL_STATUSES: readonly OrderStatus[] = ["recusado", "cancelado", "concluido"];

/** Campos cuja mudança num pedido APROVADO exige nova aprovação. */
const RELEVANT_FIELDS = [
  "items", "adjustments", "paymentTerms", "proposedInstallments", "proposedFirstDueDays",
  "deliveryDays", "validUntil", "issueDate",
] as const;

const fmt = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/**
 * Diferença entre duas versões dos campos editáveis (pra auditoria). Itens são
 * comparados linha a linha; `relevant` diz se algo que muda valor/condição
 * mudou (o que, num pedido aprovado, derruba a aprovação).
 */
export function diffOrder(before: OrderEditable, after: OrderEditable): { changes: FieldChange[]; relevant: boolean } {
  const changes: FieldChange[] = [];
  const keys: (keyof OrderEditable)[] = [...RELEVANT_FIELDS, "notes"];
  for (const k of keys) {
    if (k === "items") {
      const max = Math.max(before.items.length, after.items.length);
      for (let i = 0; i < max; i++) {
        const a = before.items[i];
        const b = after.items[i];
        const fa = a ? `${a.quantity} ${a.unit} × ${a.unitPrice} — ${a.description}` : "";
        const fb = b ? `${b.quantity} ${b.unit} × ${b.unitPrice} — ${b.description}` : "";
        if (fa !== fb) changes.push({ field: `items.${i}`, from: fa, to: fb });
      }
      continue;
    }
    if (k === "adjustments") {
      for (const ak of ["discount", "taxes", "freight", "otherCosts"] as const) {
        if (before.adjustments[ak] !== after.adjustments[ak]) {
          changes.push({ field: `adjustments.${ak}`, from: fmt(before.adjustments[ak]), to: fmt(after.adjustments[ak]) });
        }
      }
      continue;
    }
    if (fmt(before[k]) !== fmt(after[k])) changes.push({ field: k, from: fmt(before[k]), to: fmt(after[k]) });
  }
  const relevant = changes.some((c) => c.field !== "notes");
  return { changes, relevant };
}
