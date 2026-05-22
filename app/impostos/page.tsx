"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
    Plus, X, Check, Trash2, Edit3, AlertTriangle,
    Calendar, Loader2, Search, Filter,
    CheckCircle2, DollarSign, Percent, TrendingUp,
    FileText, Clock, Building2, BarChart3, Download,
    ChevronLeft, ChevronRight, type LucideIcon,
    AlertCircle, Info, Eye, EyeOff, Zap, Target,
} from "lucide-react";
import Navbar from "../components/Navbar";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TaxStatus = "nao_pago" | "pago" | "atraso" | "agendado";
type TaxFrequency = "mensal" | "trimestral" | "semestral" | "anual";
type TaxType = "irpf" | "irpj" | "pis_cofins" | "icms" | "iss" | "impostos_estaduais" | "outro";

interface Tax {
    id: string;
    name: string;
    type: TaxType;
    amount: number;
    dueDate: string;       // "YYYY-MM-DD"
    status: TaxStatus;
    frequency: TaxFrequency;
    notes: string;
    attachments: string[]; // URLs de Storage
    paidAt?: string;
    estimatedAmount?: number; // Para previsões
    createdAt: number;
    userId: string;
    description?: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split("T")[0];

const TAX_TYPES: { id: TaxType; label: string; icon: LucideIcon; color: string; description: string }[] = [
    {
        id: "irpf",
        label: "IRPF",
        icon: DollarSign,
        color: "#ef4444",
        description: "Imposto de Renda Pessoa Física",
    },
    {
        id: "irpj",
        label: "IRPJ",
        icon: Building2,
        color: "#f59e0b",
        description: "Imposto de Renda Pessoa Jurídica",
    },
    {
        id: "pis_cofins",
        label: "PIS/COFINS",
        icon: Percent,
        color: "#3b82f6",
        description: "Contribuição Social e PIS",
    },
    {
        id: "icms",
        label: "ICMS",
        icon: TrendingUp,
        color: "#8b5cf6",
        description: "Imposto sobre Circulação de Mercadorias",
    },
    {
        id: "iss",
        label: "ISS",
        icon: FileText,
        color: "#06b6d4",
        description: "Imposto Sobre Serviços",
    },
    {
        id: "impostos_estaduais",
        label: "Estaduais",
        icon: AlertCircle,
        color: "#14b8a6",
        description: "Impostos Estaduais",
    },
    {
        id: "outro",
        label: "Outro",
        icon: Zap,
        color: "#6366f1",
        description: "Outros impostos",
    },
];

const FREQUENCY_LABEL: Record<TaxFrequency, string> = {
    mensal: "Mensal",
    trimestral: "Trimestral",
    semestral: "Semestral",
    anual: "Anual",
};

const STATUS_META: Record<TaxStatus, { label: string; bg: string; color: string; border: string; icon: LucideIcon }> = {
    nao_pago: { label: "Não Pago", bg: "#fef9c3", color: "#b45309", border: "#fde68a", icon: Clock },
    pago: { label: "Pago", bg: "#dcfce7", color: "#15803d", border: "#bbf7d0", icon: Check },
    atraso: { label: "Em Atraso", bg: "#fee2e2", color: "#b91c1c", border: "#fecaca", icon: AlertTriangle },
    agendado: { label: "Agendado", bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe", icon: Calendar },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const labelDate = (d: string) =>
    new Date(d + "T12:00:00")
        .toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
        .replace(/\./g, "");

const daysUntil = (d: string): number => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(d + "T00:00:00"); due.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - today.getTime()) / 86400000);
};

const computeStatus = (tax: Tax): TaxStatus => {
    if (tax.status === "pago") return "pago";
    const days = daysUntil(tax.dueDate);
    if (days < 0) return "atraso";
    if (days > 14) return "agendado";
    return "nao_pago";
};

const getTaxMeta = (typeId: TaxType) =>
    TAX_TYPES.find(t => t.id === typeId) ?? TAX_TYPES[TAX_TYPES.length - 1];

function parseAmount(raw: string): number {
    const s = raw.trim().replace(/[^\d,.]/g, "");
    if (!s) return 0;
    if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    return parseFloat(s) || 0;
}

function formatAmount(raw: string): string {
    let s = raw.replace(/[^\d,.]/g, "");
    if (!s) return "";
    if (s.includes(",")) {
        const [intPart, decPart] = s.split(",");
        const formatted = intPart.replace(/\./g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return decPart !== undefined ? formatted + "," + decPart : formatted;
    }
    s = s.replace(/\./g, "");
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

if (typeof window !== "undefined") {
    import("../../lib/firebase");
    import("firebase/auth");
    import("firebase/firestore");
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastItem { id: number; msg: string; type: "ok" | "err" | "warn" }

function useToast() {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    let counter = 0;

    const show = useCallback((msg: string, type: ToastItem["type"] = "ok") => {
        const id = Date.now() + counter++;
        setToasts(prev => [...prev, { id, msg, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    }, []);

    return { toasts, show };
}

// ─── Modal de imposto ──────────────────────────────────────────────────────────

interface TaxModalProps {
    open: boolean;
    editing: Tax | null;
    onClose: () => void;
    onSave: (data: Omit<Tax, "id" | "userId" | "createdAt">) => Promise<void>;
}

function TaxModal({ open, editing, onClose, onSave }: TaxModalProps) {
    const [name, setName] = useState("");
    const [type, setType] = useState<TaxType>("irpf");
    const [rawAmt, setRawAmt] = useState("");
    const [estimatedRawAmt, setEstimatedRawAmt] = useState("");
    const [dueDate, setDueDate] = useState(TODAY);
    const [frequency, setFrequency] = useState<TaxFrequency>("anual");
    const [notes, setNotes] = useState("");
    const [status, setStatus] = useState<TaxStatus>("nao_pago");
    const [attachments, setAttachments] = useState<string[]>([]);
    const [uploadingFile, setUploadingFile] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        if (!open) return;
        setName(editing?.name ?? "");
        setType(editing?.type ?? "irpf");
        setRawAmt(editing ? editing.amount.toFixed(2).replace(".", ",") : "");
        setEstimatedRawAmt(editing && editing.estimatedAmount ? editing.estimatedAmount.toFixed(2).replace(".", ",") : "");
        setDueDate(editing?.dueDate ?? TODAY);
        setFrequency(editing?.frequency ?? "anual");
        setNotes(editing?.notes ?? "");
        setStatus(editing?.status ?? "nao_pago");
        setAttachments(editing?.attachments ?? []);
        setSaving(false);
        setErr("");
    }, [open]);

    if (!open) return null;

    const amount = parseAmount(rawAmt);
    const estimatedAmount = parseAmount(estimatedRawAmt);
    const canSave = name.trim().length >= 2 && amount > 0 && dueDate !== "";

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingFile(true);
        try {
            const [{ getFirebase }, { ref, uploadBytes, getDownloadURL }] = await Promise.all([
                import("../../lib/firebase"),
                import("firebase/storage"),
            ]);
            const { storage } = await getFirebase();
            const timestamp = Date.now();
            const filename = `${timestamp}-${file.name}`;
            const storageRef = ref(storage, `taxes/${filename}`);

            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            setAttachments(prev => [...prev, url]);
            setErr("");
        } catch (e: any) {
            setErr(`Erro ao upload: ${e.message}`);
        } finally {
            setUploadingFile(false);
        }
    }

    function removeAttachment(idx: number) {
        setAttachments(prev => prev.filter((_, i) => i !== idx));
    }

    async function submit() {
        if (!canSave || saving) return;
        setSaving(true); setErr("");
        try {
            await onSave({
                name: name.trim(),
                type,
                amount,
                estimatedAmount: estimatedAmount || undefined,
                dueDate,
                frequency,
                notes: notes.trim(),
                status,
                attachments,
                paidAt: editing?.paidAt,
            });
            onClose();
        } catch (e: any) {
            setErr(e?.message ?? "Erro ao salvar");
            setSaving(false);
        }
    }

    const typeMeta = getTaxMeta(type);

    return (
        <div className="fixed inset-0 z-[990] flex items-end sm:items-center justify-center"
            style={{ background: "rgba(13,17,23,0.6)", backdropFilter: "blur(8px)" }}>
            <div className="w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl overflow-hidden"
                style={{ background: "var(--cf-card)", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}>

                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                    <div className="w-10 h-1.5 rounded-full" style={{ background: "var(--cf-border)" }} />
                </div>

                <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>
                    <div className="flex items-center gap-2.5">
                        {editing && <typeMeta.icon size={16} style={{ color: typeMeta.color }} />}
                        <div>
                            <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>
                                {editing ? "Editar imposto" : "Novo imposto"}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--cf-text2)" }}>
                                Acompanhe seus impostos e prazos
                            </p>
                        </div>
                    </div>
                    <button onClick={() => !saving && onClose()}
                        className="p-1.5 rounded-lg cursor-pointer"
                        style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                        <X size={16} />
                    </button>
                </div>

                <div className="px-5 pt-4 pb-6 space-y-4 overflow-y-auto" style={{ maxHeight: "82vh" }}>
                    {err && (
                        <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
                            style={{ background: "#fef2f2", border: "1px solid #fecdd3", color: "#be123c" }}>
                            <span>⚠</span> {err}
                        </div>
                    )}

                    {/* Nome */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Nome/Descrição</label>
                        <input value={name} onChange={e => setName(e.target.value)}
                            placeholder="Ex: IRPF 2024 - Período" autoFocus
                            className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-text"
                            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                    </div>

                    {/* Tipo de imposto */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Tipo de imposto</label>
                        <div className="grid grid-cols-2 gap-2">
                            {TAX_TYPES.map(t => {
                                const sel = type === t.id;
                                return (
                                    <button key={t.id} onClick={() => setType(t.id)}
                                        className="flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl text-xs font-semibold border-2 cursor-pointer transition-all"
                                        style={sel
                                            ? { borderColor: t.color, background: t.color + "18", color: t.color }
                                            : { borderColor: "var(--cf-border)", background: "transparent", color: "var(--cf-text2)" }}>
                                        <span className="flex items-center gap-1">
                                            <t.icon size={12} /> {t.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Valor + Valor estimado */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Valor (R$)</label>
                            <input inputMode="decimal" value={rawAmt} onChange={e => setRawAmt(formatAmount(e.target.value))}
                                placeholder="0,00"
                                className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono cursor-text"
                                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Estimado (opcional)</label>
                            <input inputMode="decimal" value={estimatedRawAmt} onChange={e => setEstimatedRawAmt(formatAmount(e.target.value))}
                                placeholder="0,00"
                                className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono cursor-text"
                                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                        </div>
                    </div>

                    {/* Vencimento + Frequência */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Vencimento</label>
                            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                                className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-pointer"
                                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Frequência</label>
                            <select value={frequency} onChange={e => setFrequency(e.target.value as TaxFrequency)}
                                className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-pointer"
                                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }}>
                                {(["mensal", "trimestral", "semestral", "anual"] as TaxFrequency[]).map(f => (
                                    <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Status inicial</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["nao_pago", "pago", "agendado", "atraso"] as TaxStatus[]).map(s => {
                                const meta = STATUS_META[s];
                                return (
                                    <button key={s} onClick={() => setStatus(s)}
                                        className="py-2.5 rounded-xl text-xs font-bold border-2 cursor-pointer transition-all"
                                        style={status === s
                                            ? { background: meta.bg, borderColor: meta.border, color: meta.color }
                                            : { background: "transparent", borderColor: "var(--cf-border)", color: "var(--cf-text2)" }}>
                                        {meta.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Documentos */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>
                            Documentos (DARF, RPA...) — {attachments.length}
                        </label>

                        {attachments.length > 0 && (
                            <div className="space-y-1 mb-2">
                                {attachments.map((url, idx) => (
                                    <div key={idx} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                                        style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)" }}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <FileText size={14} style={{ color: "var(--cf-text2)", flexShrink: 0 }} />
                                            <a href={url} target="_blank" rel="noopener noreferrer"
                                                className="text-xs truncate"
                                                style={{ color: "#3b82f6", textDecoration: "underline" }}>
                                                Documento {idx + 1}
                                            </a>
                                        </div>
                                        <button onClick={() => removeAttachment(idx)}
                                            className="p-1 rounded-lg cursor-pointer"
                                            style={{ background: "#fee2e2" }}>
                                            <Trash2 size={12} style={{ color: "#dc2626" }} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <label className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold border-2 border-dashed cursor-pointer transition-all"
                            style={{ borderColor: "var(--cf-border)", background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                            <Download size={16} />
                            {uploadingFile ? "Enviando..." : "Adicionar documento"}
                            <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                                onChange={handleFileUpload}
                                disabled={uploadingFile}
                                className="hidden"
                            />
                        </label>
                    </div>

                    {/* Observações */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Observações</label>
                        <input value={notes} onChange={e => setNotes(e.target.value)}
                            placeholder="Código, referência, observações..."
                            className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-text"
                            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                    </div>

                    <button onClick={submit} disabled={!canSave || saving}
                        className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${canSave && !saving ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                        style={canSave && !saving
                            ? { background: `linear-gradient(135deg, ${typeMeta.color}, ${typeMeta.color}cc)`, color: "white" }
                            : { background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                        {saving
                            ? <><Loader2 size={15} className="animate-spin" /> Salvando…</>
                            : <><Check size={15} /> {editing ? "Salvar alterações" : "Criar imposto"}</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Tax Card ──────────────────────────────────────────────────────────────────

function TaxCard({ tax, alertDays, onEdit, onDelete, onPay }: {
    tax: Tax & { _status: TaxStatus };
    alertDays: number;
    onEdit: () => void;
    onDelete: () => void;
    onPay: () => Promise<void>;
}) {
    const [paying, setPaying] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const days = daysUntil(tax.dueDate);
    const status: TaxStatus = tax._status;
    const meta = STATUS_META[status];
    const taxMeta = getTaxMeta(tax.type);
    const TaxIcon = taxMeta.icon;
    const isUrgent = status !== "pago" && days >= 0 && days <= alertDays;
    const isOverdue = status === "atraso";

    const handlePay = async () => {
        setPaying(true);
        try { await onPay(); } finally { setPaying(false); }
    };

    return (
        <div className="cf-card overflow-hidden transition-all hover:shadow-md"
            style={{ borderColor: isOverdue ? "#fecaca" : isUrgent ? "#fde68a" : "var(--cf-border)" }}>
            {/* Barra colorida */}
            <div className="h-2" style={{ background: taxMeta.color }} />

            <div className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                    {/* Ícone */}
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: taxMeta.color + "18" }}>
                        <TaxIcon size={20} style={{ color: taxMeta.color }} />
                    </div>

                    <div className="flex-1 min-w-0">
                        {/* Título + tipo */}
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="font-heading text-sm font-bold truncate" style={{ color: "var(--cf-text)" }}>
                                    {tax.name}
                                </p>
                                <p className="text-xs mt-0.5" style={{ color: "var(--cf-text3)" }}>
                                    {taxMeta.label} · {taxMeta.description}
                                </p>
                            </div>
                            <span className="font-heading font-bold text-base shrink-0 mono"
                                style={{ color: isOverdue ? "#dc2626" : "var(--cf-text)" }}>
                                {toBRL(tax.amount)}
                            </span>
                        </div>

                        {/* Badge status + frequência */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1"
                                style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                                <meta.icon size={11} /> {meta.label}
                            </span>
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                                style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                                {FREQUENCY_LABEL[tax.frequency]}
                            </span>
                            {tax.attachments?.length > 0 && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
                                    style={{ background: "#dbeafe", color: "#1d4ed8" }}>
                                    <FileText size={10} /> {tax.attachments.length}
                                </span>
                            )}
                        </div>

                        {/* Vencimento */}
                        <div className="flex items-center gap-1.5 mt-2.5">
                            <Calendar size={13}
                                style={{ color: isOverdue ? "#dc2626" : isUrgent ? "#b45309" : "var(--cf-text3)" }} />
                            <span className="text-xs font-medium"
                                style={{ color: isOverdue ? "#dc2626" : isUrgent ? "#b45309" : "var(--cf-text2)" }}>
                                {status === "pago"
                                    ? `Pago em ${tax.paidAt ? labelDate(tax.paidAt) : "—"}`
                                    : isOverdue
                                        ? `Atraso de ${Math.abs(days)} dia${Math.abs(days) !== 1 ? "s" : ""}`
                                        : days === 0
                                            ? `⚠️ Vence hoje!`
                                            : `Vence em ${days} dia${days !== 1 ? "s" : ""} · ${labelDate(tax.dueDate)}`}
                            </span>
                            {isUrgent && (
                                <span className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                                    style={{ background: "#fef9c3", color: "#b45309" }}>!</span>
                            )}
                        </div>

                        {/* Estimativa */}
                        {tax.estimatedAmount && (
                            <p className="text-xs mt-1.5" style={{ color: "var(--cf-text3)" }}>
                                💡 Estimado: {toBRL(tax.estimatedAmount)}
                            </p>
                        )}

                        {tax.notes && (
                            <p className="text-xs mt-1.5 truncate" style={{ color: "var(--cf-text3)" }}>📝 {tax.notes}</p>
                        )}
                    </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 mt-4 pt-3" style={{ borderTop: "1px solid var(--cf-border)" }}>
                    {status !== "pago" ? (
                        <button onClick={handlePay} disabled={paying}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all"
                            style={{ background: `linear-gradient(135deg, ${taxMeta.color}, ${taxMeta.color}cc)`, color: "white" }}>
                            {paying
                                ? <Loader2 size={13} className="animate-spin" />
                                : <CheckCircle2 size={13} />}
                            Marcar como pago
                        </button>
                    ) : (
                        <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold"
                            style={{ background: "#dcfce7", color: "#15803d" }}>
                            <Check size={13} /> Imposto pago
                        </div>
                    )}
                    <button onClick={onEdit} className="p-2 rounded-xl cursor-pointer"
                        style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                        <Edit3 size={14} />
                    </button>
                    <button onClick={onDelete} className="p-2 rounded-xl cursor-pointer"
                        style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Toast Stack ──────────────────────────────────────────────────────────────

function ToastStack({ toasts }: { toasts: ToastItem[] }) {
    if (toasts.length === 0) return null;
    const colors: Record<ToastItem["type"], string> = {
        ok: "#10b981",
        err: "#ef4444",
        warn: "#f59e0b",
    };
    return (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
            {toasts.map(t => (
                <div key={t.id} className="px-4 py-3 rounded-xl flex items-center gap-2 shadow-xl text-sm font-semibold text-white pointer-events-auto"
                    style={{ background: colors[t.type], animation: "slideUp .3s ease" }}>
                    {t.type === "ok" && <Check size={15} />}
                    {t.type === "err" && <AlertTriangle size={15} />}
                    {t.type === "warn" && <AlertCircle size={15} />}
                    {t.msg}
                </div>
            ))}
        </div>
    );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ImpostosPage() {
    const [uid, setUid] = useState<string | null>(null);
    const [userName, setUserName] = useState("");
    const [userEmail, setUserEmail] = useState("");
    const [taxes, setTaxes] = useState<Tax[]>([]);
    const [pageState, setPageState] = useState<"loading" | "ready" | "error">("loading");
    const [errMsg, setErrMsg] = useState("");

    const [modal, setModal] = useState(false);
    const [editing, setEditing] = useState<Tax | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [alertDays, setAlertDays] = useState(7);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<"todos" | TaxStatus>("todos");
    const [filterType, setFilterType] = useState("todos");

    const { toasts, show: showToast } = useToast();

    useEffect(() => {
        const saved = localStorage.getItem("nexusfi:taxAlertDays");
        if (saved) setAlertDays(Number(saved));
    }, []);

    const saveAlertDays = (d: number) => {
        setAlertDays(d);
        localStorage.setItem("nexusfi:taxAlertDays", String(d));
        showToast(`Alertas configurados para ${d} dia${d !== 1 ? "s" : ""} antes do vencimento`);
    };

    // Auth + Firestore realtime
    useEffect(() => {
        let snapUnsub: (() => void) | undefined;
        let authUnsub: (() => void) | undefined;
        (async () => {
            try {
                const [{ getFirebase }, { onAuthStateChanged }, { collection, query, orderBy, onSnapshot }] =
                    await Promise.all([
                        import("../../lib/firebase"),
                        import("firebase/auth"),
                        import("firebase/firestore"),
                    ]);
                const { auth, db } = await getFirebase();
                authUnsub = onAuthStateChanged(auth, u => {
                    if (!u) { window.location.href = "/login"; return; }
                    setUid(u.uid);
                    setUserName(u.displayName ?? u.email ?? "Usuário");
                    setUserEmail(u.email ?? "");
                    snapUnsub?.();
                    snapUnsub = onSnapshot(
                        query(collection(db, "users", u.uid, "taxes"), orderBy("createdAt", "desc")),
                        snap => { setTaxes(snap.docs.map(d => ({ id: d.id, ...d.data() } as Tax))); setPageState("ready"); },
                        err => { setErrMsg(`${err.message} (${err.code})`); setPageState("error"); }
                    );
                });
            } catch (e: any) { setErrMsg(e.message); setPageState("error"); }
        })();
        return () => { authUnsub?.(); snapUnsub?.(); };
    }, []);

    // Toast de alerta ao entrar
    const alertsShownRef = useRef(false);
    useEffect(() => {
        if (pageState !== "ready" || alertsShownRef.current) return;
        alertsShownRef.current = true;

        const alertDaysCurrent = Number(localStorage.getItem("nexusfi:taxAlertDays")) || 7;

        const overdue = taxes.filter(t => t.status !== "pago" && daysUntil(t.dueDate) < 0);
        const soon = taxes.filter(t => {
            if (t.status === "pago") return false;
            const d = daysUntil(t.dueDate);
            return d >= 0 && d <= alertDaysCurrent;
        });

        setTimeout(() => {
            if (overdue.length > 0) {
                showToast(
                    `${overdue.length} imposto${overdue.length !== 1 ? "s" : ""} em atraso — regularize!`,
                    "err"
                );
            }
            if (soon.length > 0) {
                setTimeout(() => {
                    showToast(
                        `⏰ ${soon.length} imposto${soon.length !== 1 ? "s" : ""} vence${soon.length !== 1 ? "m" : ""} nos próximos ${alertDaysCurrent} dias`,
                        "warn"
                    );
                }, 600);
            }
        }, 800);
    }, [pageState]);

    async function handleLogout() {
        const { getFirebase } = await import("../../lib/firebase");
        const { signOut } = await import("firebase/auth");
        const { auth } = await getFirebase();
        await signOut(auth);
        window.location.href = "/login";
    }

    async function handleSave(data: Omit<Tax, "id" | "userId" | "createdAt">) {
        if (!uid) throw new Error("Não autenticado");
        const [{ getFirebase }, { doc, updateDoc, collection, addDoc }] = await Promise.all([
            import("../../lib/firebase"),
            import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();
        const clean = Object.fromEntries(
            Object.entries({ ...data, userId: uid }).filter(([, v]) => v !== undefined)
        );
        if (editing) {
            await updateDoc(doc(db, "users", uid, "taxes", editing.id), clean as any);
            showToast("Imposto atualizado!");
        } else {
            await addDoc(collection(db, "users", uid, "taxes"), { ...clean, createdAt: Date.now() });
            showToast("Imposto criado!");
        }
    }

    async function handlePay(tax: Tax) {
        if (!uid) return;
        const [{ getFirebase }, { doc, updateDoc }] = await Promise.all([
            import("../../lib/firebase"),
            import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();
        const paidAt = TODAY;

        await updateDoc(doc(db, "users", uid, "taxes", tax.id), { status: "pago", paidAt });
        showToast("Imposto marcado como pago ✓");
    }

    async function handleDelete() {
        if (!confirmId || !uid || deleting) return;
        setDeleting(true);
        try {
            const [{ getFirebase }, { doc, deleteDoc }] = await Promise.all([
                import("../../lib/firebase"),
                import("firebase/firestore"),
            ]);
            const { db } = await getFirebase();
            await deleteDoc(doc(db, "users", uid, "taxes", confirmId));
            setConfirmId(null);
            showToast("Imposto removido.");
        } catch (e: any) {
            showToast(e.message, "err");
        } finally {
            setDeleting(false);
        }
    }

    // ── Dados derivados ────────────────────────────────────────────────────────

    const enriched = useMemo((): (Tax & { _status: TaxStatus })[] =>
        taxes.map(t => ({ ...t, _status: computeStatus(t) })),
        [taxes]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return enriched.filter(t => {
            if (filterStatus !== "todos" && t._status !== filterStatus) return false;
            if (filterType !== "todos" && t.type !== filterType) return false;
            if (q && !t.name.toLowerCase().includes(q) && !t.notes.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [enriched, filterStatus, filterType, search]);

    const sections = useMemo(() => [
        { key: "atraso", label: "Em Atraso", color: "#dc2626", taxes: filtered.filter(t => t._status === "atraso") },
        { key: "nao_pago", label: "A Pagar", color: "#b45309", taxes: filtered.filter(t => t._status === "nao_pago") },
        { key: "agendado", label: "Agendados", color: "#1d4ed8", taxes: filtered.filter(t => t._status === "agendado") },
        { key: "pago", label: "Pagos", color: "#15803d", taxes: filtered.filter(t => t._status === "pago") },
    ].filter(s => s.taxes.length > 0), [filtered]);

    const kpis = useMemo(() => {
        const notPaid = enriched.filter(t => t._status !== "pago");
        return {
            aPagar: notPaid.reduce((s, t) => s + t.amount, 0),
            atraso: enriched.filter(t => t._status === "atraso").reduce((s, t) => s + t.amount, 0),
            pago: enriched.filter(t => t._status === "pago").reduce((s, t) => s + t.amount, 0),
            estimado: enriched.filter(t => t.estimatedAmount).reduce((s, t) => s + (t.estimatedAmount || 0), 0),
            alert: enriched.filter(t => {
                if (t._status === "pago") return false;
                const d = daysUntil(t.dueDate);
                return d >= 0 && d <= alertDays;
            }).length,
            totalNotPaid: notPaid.length,
            totalOverdue: enriched.filter(t => t._status === "atraso").length,
            totalPaid: enriched.filter(t => t._status === "pago").length,
        };
    }, [enriched, alertDays]);

    if (pageState === "loading") return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: "var(--cf-bg)" }}>
            <div className="w-8 h-8 border-2 border-blue-100 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-sm" style={{ color: "var(--cf-text2)" }}>Carregando…</p>
        </div>
    );

    if (pageState === "error") return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: "var(--cf-bg)" }}>
            <p className="font-heading text-lg font-bold text-rose-500">Erro ao conectar</p>
            <p className="text-xs font-mono text-rose-700 bg-rose-50 rounded-xl p-4 max-w-sm break-all">{errMsg}</p>
            <button onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
                style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>
                Tentar novamente
            </button>
        </div>
    );

    return (
        <div className="flex flex-col min-h-screen" style={{ background: "var(--cf-bg)" }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, *::before, *::after { font-family: 'Sora', sans-serif; box-sizing: border-box; }
        .font-heading { font-family: 'Sora', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        .cf-card { background: var(--cf-card); border: 1px solid var(--cf-border); border-radius: 16px; }
        .cf-kpi  { background: var(--cf-card); border: 1px solid var(--cf-border); border-radius: 16px; transition: all .2s; }
        .cf-kpi:hover { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(0,0,0,0.08); }
        @keyframes slideUp { from { opacity:0; transform:translateY(20px) scale(.95) } to { opacity:1; transform:none } }
        @keyframes kIn     { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:none } }
        .kin { animation: kIn .35s ease both; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: var(--cf-border); border-radius: 3px; }
        .scrollbar-none { scrollbar-width:none; }
        .scrollbar-none::-webkit-scrollbar { display:none; }
        button, a, input, select { transition: all .12s cubic-bezier(.4,0,.2,1) !important; }
        input:focus, select:focus { border-color:#3b82f6 !important; box-shadow:0 0 0 3px rgba(59,130,246,0.1) !important; }
      `}</style>

            <Navbar user={{ displayName: userName, email: userEmail }} activePath="/impostos" onLogout={handleLogout} />

            <TaxModal
                open={modal} editing={editing}
                onClose={() => { setModal(false); setEditing(null); }}
                onSave={handleSave}
            />

            {confirmId && (
                <div className="fixed inset-0 z-[990] flex items-center justify-center p-4"
                    style={{ background: "rgba(13,17,23,0.5)", backdropFilter: "blur(8px)" }}>
                    <div className="cf-card p-6 w-full max-w-xs text-center"
                        style={{ animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}>
                        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                            style={{ background: "#fee2e2" }}>
                            <Trash2 size={20} style={{ color: "#dc2626" }} />
                        </div>
                        <p className="font-heading text-base font-bold mb-1" style={{ color: "var(--cf-text)" }}>
                            Excluir imposto?
                        </p>
                        <p className="text-xs mb-5" style={{ color: "var(--cf-text2)" }}>
                            Esta ação não pode ser desfeita.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setConfirmId(null)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
                                style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text2)" }}>
                                Cancelar
                            </button>
                            <button onClick={handleDelete} disabled={deleting}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60"
                                style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "white" }}>
                                {deleting ? <Loader2 size={14} className="animate-spin" /> : <><Trash2 size={14} /> Excluir</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ToastStack toasts={toasts} />

            <main className="flex-1 p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5 overflow-y-auto overflow-x-hidden pb-24 lg:pb-8">

                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="font-heading text-2xl font-bold leading-tight" style={{ color: "var(--cf-text)" }}>
                            Impostos
                        </h1>
                        <p className="text-xs mt-1 flex items-center gap-2" style={{ color: "var(--cf-text2)" }}>
                            {kpis.alert > 0
                                ? <span className="flex items-center gap-1 font-semibold animate-pulse" style={{ color: "#b45309" }}>
                                    <AlertTriangle size={12} />
                                    {kpis.alert} vence{kpis.alert !== 1 ? "m" : ""} nos próximos {alertDays} dias
                                </span>
                                : kpis.totalOverdue > 0
                                    ? <span className="flex items-center gap-1 font-semibold" style={{ color: "#dc2626" }}>
                                        <AlertTriangle size={12} />
                                        {kpis.totalOverdue} imposto{kpis.totalOverdue !== 1 ? "s" : ""} em atraso
                                    </span>
                                    : <span style={{ color: "#10b981" }}>✓ Tudo em dia!</span>
                            }
                        </p>
                    </div>
                    <button onClick={() => { setEditing(null); setModal(true); }}
                        className="hidden sm:flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer"
                        style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>
                        <Plus size={14} /> Novo imposto
                    </button>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    {[
                        { label: "A Pagar", val: toBRL(kpis.aPagar), color: "#3b82f6", bg: "#eff6ff", sub: `${kpis.totalNotPaid} imposto${kpis.totalNotPaid !== 1 ? "s" : ""}` },
                        { label: "Em Atraso", val: toBRL(kpis.atraso), color: "#dc2626", bg: "#fee2e2", sub: `${kpis.totalOverdue} imposto${kpis.totalOverdue !== 1 ? "s" : ""}` },
                        { label: "Pagos", val: toBRL(kpis.pago), color: "#059669", bg: "#dcfce7", sub: `${kpis.totalPaid} imposto${kpis.totalPaid !== 1 ? "s" : ""}` },
                        { label: "Estimado", val: toBRL(kpis.estimado), color: "#8b5cf6", bg: "#f3e8ff", sub: "planejamento" },
                    ].map(({ label, val, color, bg, sub }, i) => (
                        <div key={label} className="cf-kpi kin p-3 sm:p-4 flex flex-col gap-1.5"
                            style={{ animationDelay: `${i * 60}ms` }}>
                            <p className="text-xs font-semibold" style={{ color: "var(--cf-text2)" }}>{label}</p>
                            <p className="font-heading font-bold text-base sm:text-lg mono" style={{ color }}>{val}</p>
                            <p className="text-xs" style={{ color: "var(--cf-text3)" }}>{sub}</p>
                        </div>
                    ))}
                </div>

                {/* Filtros */}
                <div className="cf-card p-3.5 space-y-3">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                            style={{ color: "var(--cf-text3)" }} />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar imposto ou observação…"
                            className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none cursor-text"
                            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
                        {(["todos", "nao_pago", "atraso", "agendado", "pago"] as const).map(f => {
                            const meta = f !== "todos" ? STATUS_META[f] : null;
                            return (
                                <button key={f} onClick={() => setFilterStatus(f)}
                                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-all"
                                    style={filterStatus === f
                                        ? { background: meta?.bg ?? "var(--cf-text)", color: meta?.color ?? "var(--cf-bg)", borderColor: meta?.border ?? "transparent" }
                                        : { background: "transparent", color: "var(--cf-text2)", borderColor: "var(--cf-border)" }}>
                                    {f === "todos" ? "Todos" : STATUS_META[f].label}
                                </button>
                            );
                        })}
                        <div className="ml-auto flex items-center gap-2 shrink-0">
                            <div className="relative">
                                <Filter size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                                    style={{ color: "var(--cf-text3)" }} />
                                <select value={filterType} onChange={e => setFilterType(e.target.value)}
                                    className="pl-7 pr-6 py-1.5 rounded-full text-xs font-semibold border cursor-pointer appearance-none outline-none"
                                    style={{ background: "var(--cf-input)", borderColor: "var(--cf-border)", color: "var(--cf-text)" }}>
                                    <option value="todos">Todos tipos</option>
                                    {TAX_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </select>
                            </div>
                            <span className="text-xs font-medium" style={{ color: "var(--cf-text3)" }}>
                                {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Lista agrupada */}
                {filtered.length === 0 ? (
                    <div className="cf-card p-12 flex flex-col items-center text-center gap-3">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                            style={{ background: "var(--cf-input)" }}>
                            <Target size={24} style={{ color: "var(--cf-text3)" }} />
                        </div>
                        <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>
                            {search || filterStatus !== "todos" || filterType !== "todos"
                                ? "Nenhum resultado"
                                : "Nenhum imposto cadastrado"}
                        </p>
                        <p className="text-xs max-w-xs" style={{ color: "var(--cf-text2)" }}>
                            {search || filterStatus !== "todos" || filterType !== "todos"
                                ? "Ajuste os filtros para ver outros impostos."
                                : "Comece a rastrear seus impostos e receba alertas antes dos prazos."}
                        </p>
                        {!search && filterStatus === "todos" && filterType === "todos" && (
                            <button onClick={() => { setEditing(null); setModal(true); }}
                                className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl cursor-pointer mt-2"
                                style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>
                                <Plus size={14} /> Adicionar imposto
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {sections.map(section => (
                            <div key={section.key}>
                                <div className="flex items-center gap-2.5 mb-3">
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: section.color }} />
                                    <p className="text-sm font-bold" style={{ color: section.color }}>{section.label}</p>
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                        style={{ background: section.color + "18", color: section.color }}>
                                        {section.taxes.length}
                                    </span>
                                    <div className="flex-1 h-px" style={{ background: section.color + "30" }} />
                                    <span className="text-xs font-bold mono" style={{ color: section.color }}>
                                        {toBRL(section.taxes.reduce((s, t) => s + t.amount, 0))}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {section.taxes.map(tax => (
                                        <TaxCard
                                            key={tax.id}
                                            tax={tax}
                                            alertDays={alertDays}
                                            onEdit={() => { setEditing(tax); setModal(true); }}
                                            onDelete={() => setConfirmId(tax.id)}
                                            onPay={() => handlePay(tax)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* FAB mobile */}
            <button onClick={() => { setEditing(null); setModal(true); }}
                className="lg:hidden fixed z-20 rounded-2xl flex items-center justify-center active:scale-95 transition-transform cursor-pointer"
                style={{
                    bottom: 74, right: 16, width: 52, height: 52,
                    background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                    color: "white",
                    boxShadow: "0 8px 24px rgba(59,130,246,0.4)",
                }}>
                <Plus size={22} />
            </button>
        </div>
    );
}

import React from "react";