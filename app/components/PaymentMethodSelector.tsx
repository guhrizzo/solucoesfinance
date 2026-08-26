"use client";

import {
    Banknote, Building2, FileText, Zap,
    CreditCard, Wallet, ArrowLeftRight, FileBarChart2
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { PaymentMethod } from "../types/payment";
import { PAYMENT_METHODS, PAYMENT_METHOD_META } from "../types/payment";

// Mapa de ícones Lucide para cada método
const METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
    dinheiro:       Banknote,
    conta_corrente: Building2,
    cheque:         FileText,
    pix:            Zap,
    cartao_credito: CreditCard,
    cartao_debito:  Wallet,
    transferencia:  ArrowLeftRight,
    boleto:         FileBarChart2,
};

interface PaymentMethodSelectorProps {
    value: PaymentMethod | null;
    onChange: (m: PaymentMethod) => void;
    label?: string;
    required?: boolean;
}

export default function PaymentMethodSelector({
    value,
    onChange,
    label = "Forma de pagamento",
    required = false,
}: PaymentMethodSelectorProps) {
    return (
        <div className="space-y-2">
            <label
                className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1"
                style={{ color: "var(--cf-text2)" }}
            >
                {label}
                {required && <span style={{ color: "#ef4444" }}>*</span>}
            </label>
            <div className="grid grid-cols-4 gap-2">
                {PAYMENT_METHODS.map(method => {
                    const meta = PAYMENT_METHOD_META[method];
                    const Icon = METHOD_ICONS[method];
                    const selected = value === method;
                    return (
                        <button
                            key={method}
                            type="button"
                            onClick={() => onChange(method)}
                            className="flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl text-xs font-semibold border-2 cursor-pointer transition-all"
                            style={
                                selected
                                    ? {
                                        borderColor: meta.color,
                                        background: meta.color + "1a",
                                        color: meta.color,
                                        boxShadow: `0 2px 12px ${meta.color}30`,
                                    }
                                    : {
                                        borderColor: "var(--cf-border)",
                                        background: "transparent",
                                        color: "var(--cf-text2)",
                                    }
                            }
                        >
                            <Icon size={16} />
                            <span className="text-center leading-tight" style={{ fontSize: "10px" }}>
                                {meta.label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Badge de origem para exibição nos cards ──────────────────────────────────

interface PaymentMethodBadgeProps {
    method: PaymentMethod;
    prefix?: string;
    small?: boolean;
}

export function PaymentMethodBadge({ method, prefix, small = false }: PaymentMethodBadgeProps) {
    const meta = PAYMENT_METHOD_META[method];
    const Icon = METHOD_ICONS[method];
    return (
        <span
            className="inline-flex items-center gap-1 rounded-full font-semibold"
            style={{
                background: meta.color + "18",
                color: meta.color,
                border: `1px solid ${meta.color}40`,
                fontSize: small ? "9px" : "10px",
                padding: small ? "2px 6px" : "3px 8px",
            }}
        >
            <Icon size={small ? 9 : 10} />
            {prefix && <span style={{ opacity: 0.7 }}>{prefix}</span>}
            {meta.label}
        </span>
    );
}
