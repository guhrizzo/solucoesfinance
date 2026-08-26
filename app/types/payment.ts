// ─── Tipos de forma de pagamento/recebimento ─────────────────────────────────

export type PaymentMethod =
    | "dinheiro"
    | "conta_corrente"
    | "cheque"
    | "pix"
    | "cartao_credito"
    | "cartao_debito"
    | "transferencia"
    | "boleto";

export const PAYMENT_METHOD_META: Record<PaymentMethod, { label: string; icon: string; color: string }> = {
    dinheiro:       { label: "Dinheiro",          icon: "💵", color: "#10b981" },
    conta_corrente: { label: "Conta Corrente",     icon: "🏦", color: "#3b82f6" },
    cheque:         { label: "Cheque",             icon: "📝", color: "#6366f1" },
    pix:            { label: "PIX",               icon: "⚡", color: "#8b5cf6" },
    cartao_credito: { label: "Cartão de Crédito",  icon: "💳", color: "#f59e0b" },
    cartao_debito:  { label: "Cartão de Débito",   icon: "💴", color: "#0ea5e9" },
    transferencia:  { label: "Transferência",      icon: "↔️", color: "#14b8a6" },
    boleto:         { label: "Boleto",             icon: "📄", color: "#64748b" },
};

export const PAYMENT_METHODS: PaymentMethod[] = [
    "dinheiro",
    "conta_corrente",
    "cheque",
    "pix",
    "cartao_credito",
    "cartao_debito",
    "transferencia",
    "boleto",
];
