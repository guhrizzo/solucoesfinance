"use client";

// ─── Selo de autoria no card ────────────────────────────────────────────────
// Rodapé discreto que mostra quem criou / editou / deu baixa no registro e
// quando. Registros antigos (sem os campos) simplesmente não renderizam nada.

import { UserRound, PencilLine, BadgeCheck, type LucideIcon } from "lucide-react";
import { fmtDateTime } from "@/lib/audit";

export interface AuditFields {
    createdByName?: string;
    createdAt?: number;
    updatedByName?: string;
    updatedAt?: number;
    settledByName?: string;
    settledAt?: number;
}

export function AuditTrail({ record, settleLabel = "Baixa" }: {
    record: AuditFields;
    /** Rótulo da baixa: "Pago", "Recebido"… */
    settleLabel?: string;
}) {
    const rows: { icon: LucideIcon; text: string }[] = [];

    if (record.createdByName) {
        rows.push({
            icon: UserRound,
            text: `Criado por ${record.createdByName}${record.createdAt ? ` · ${fmtDateTime(record.createdAt)}` : ""}`,
        });
    }
    if (record.updatedByName && record.updatedAt) {
        rows.push({
            icon: PencilLine,
            text: `Editado por ${record.updatedByName} · ${fmtDateTime(record.updatedAt)}`,
        });
    }
    if (record.settledByName && record.settledAt) {
        rows.push({
            icon: BadgeCheck,
            text: `${settleLabel} por ${record.settledByName} · ${fmtDateTime(record.settledAt)}`,
        });
    }

    if (rows.length === 0) return null;

    return (
        <div className="mt-3 pt-2.5 space-y-1" style={{ borderTop: "1px dashed var(--cf-border)" }}>
            {rows.map((r, i) => {
                const Icon = r.icon;
                return (
                    <p key={i} className="flex items-center gap-1.5 text-[11px] leading-tight" style={{ color: "var(--cf-text-3)" }}>
                        <Icon size={11} className="shrink-0" /> {r.text}
                    </p>
                );
            })}
        </div>
    );
}
