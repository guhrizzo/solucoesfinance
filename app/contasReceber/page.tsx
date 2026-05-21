"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    Plus, X, Check, Trash2, Edit3, AlertTriangle,
    CalendarClock, Loader2, Search, Filter,
    CheckCircle2, CircleDollarSign, Repeat, Settings2,
    ArrowUpRight, Tag, Building2, Zap, Receipt,
    Bell, Image as ImageIcon, Trash, ChevronLeft, ChevronRight, type LucideIcon,
} from "lucide-react";
import Navbar from "../components/Navbar";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ReceivableStatus = "pendente" | "recebido" | "atrasado" | "agendado";
type Recurrence = "unica" | "mensal" | "trimestral" | "anual";

interface Receivable {
    id: string;
    title: string;
    amount: number;
    dueDate: string;       // "YYYY-MM-DD"
    category: string;
    status: ReceivableStatus;
    recurrence: Recurrence;
    notes: string;
    photos: string[];      // URLs de Storage
    receivedAt?: string;
    createdAt: number;
    userId: string;
    cashflowId?: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split("T")[0];

const CATEGORIES: { label: string; icon: LucideIcon; color: string }[] = [
    { label: "Clientes", icon: Building2, color: "#10b981" },
    { label: "Serviços", icon: Zap, color: "#3b82f6" },
    { label: "Produtos", icon: Receipt, color: "#f59e0b" },
    { label: "Devoluções", icon: ArrowUpRight, color: "#8b5cf6" },
    { label: "Empréstimos", icon: CircleDollarSign, color: "#06b6d4" },
    { label: "Outros", icon: Tag, color: "#6b7280" },
];

const RECURRENCE_LABEL: Record<Recurrence, string> = {
    unica: "Única",
    mensal: "Mensal",
    trimestral: "Trimestral",
    anual: "Anual",
};

const STATUS_META: Record<ReceivableStatus, { label: string; bg: string; color: string; border: string }> = {
    pendente: { label: "Pendente", bg: "#fef9c3", color: "#b45309", border: "#fde68a" },
    recebido: { label: "Recebido", bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
    atrasado: { label: "Atrasado", bg: "#fee2e2", color: "#b91c1c", border: "#fecaca" },
    agendado: { label: "Agendado", bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" },
};

// Mapeamento de categoria → cashflow
const CAT_TO_CASHFLOW: Record<string, string> = {
    "Clientes": "Vendas",
    "Serviços": "Serviços",
    "Produtos": "Vendas",
    "Devoluções": "Devoluções",
    "Empréstimos": "Empréstimos",
    "Outros": "Outros ganhos",
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

const computeStatus = (receivable: Receivable): ReceivableStatus => {
    if (receivable.status === ("recebido" as const)) return "recebido" as const;
    const days = daysUntil(receivable.dueDate);
    if (days < 0) return "atrasado" as const;
    if (days > 7) return "agendado" as const;
    return "pendente" as const;
};

const getCatMeta = (label: string) =>
    CATEGORIES.find(c => c.label === label) ?? CATEGORIES[CATEGORIES.length - 1];

function parseAmount(raw: string): number {
    const s = raw.trim().replace(/[^\d,.]/g, "");
    if (!s) return 0;
    if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    return parseFloat(s) || 0;
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

// ─── Modal de conta a receber ─────────────────────────────────────────────────

interface ReceivableModalProps {
    open: boolean;
    editing: Receivable | null;
    onClose: () => void;
    onSave: (data: Omit<Receivable, "id" | "userId" | "createdAt">) => Promise<void>;
}

function ReceivableModal({ open, editing, onClose, onSave }: ReceivableModalProps) {
    const [title, setTitle] = useState("");
    const [rawAmt, setRawAmt] = useState("");
    const [dueDate, setDueDate] = useState(TODAY);
    const [category, setCategory] = useState("Clientes");
    const [recurrence, setRecurrence] = useState<Recurrence>("unica");
    const [notes, setNotes] = useState("");
    const [status, setStatus] = useState<ReceivableStatus>("pendente");
    const [photos, setPhotos] = useState<string[]>([]);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        if (!open) return;
        setTitle(editing?.title ?? "");
        setRawAmt(editing ? editing.amount.toFixed(2).replace(".", ",") : "");
        setDueDate(editing?.dueDate ?? TODAY);
        setCategory(editing?.category ?? "Clientes");
        setRecurrence(editing?.recurrence ?? "unica");
        setNotes(editing?.notes ?? "");
        setStatus(editing?.status ?? "pendente");
        setPhotos(editing?.photos ?? []);
        setSaving(false);
        setErr("");
    }, [open]);

    if (!open) return null;

    const amount = parseAmount(rawAmt);
    const canSave = title.trim().length >= 2 && amount > 0 && dueDate !== "";

    async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingPhoto(true);
        try {
            const [{ getFirebase }, { ref, uploadBytes, getDownloadURL }] = await Promise.all([
                import("../../lib/firebase"),
                import("firebase/storage"),
            ]);
            const { storage } = await getFirebase();
            const timestamp = Date.now();
            const filename = `${timestamp}-${file.name}`;
            const storageRef = ref(storage, `receivables/${filename}`);
            
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            
            setPhotos(prev => [...prev, url]);
            setErr("");
        } catch (e: any) {
            setErr(`Erro ao upload: ${e.message}`);
        } finally {
            setUploadingPhoto(false);
        }
    }

    function removePhoto(idx: number) {
        setPhotos(prev => prev.filter((_, i) => i !== idx));
    }

    async function submit() {
        if (!canSave || saving) return;
        setSaving(true); setErr("");
        try {
            await onSave({
                title: title.trim(), amount, dueDate, category,
                recurrence, notes: notes.trim(), status,
                photos,
                receivedAt: editing?.receivedAt,
            });
            onClose();
        } catch (e: any) {
            setErr(e?.message ?? "Erro ao salvar");
            setSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[990] flex items-end sm:items-center justify-center"
            style={{ background: "rgba(13,17,23,0.6)", backdropFilter: "blur(8px)" }}>
            <div className="w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl overflow-hidden"
                style={{ background: "var(--cf-card)", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}>

                {/* drag handle mobile */}
                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                    <div className="w-10 h-1.5 rounded-full" style={{ background: "var(--cf-border)" }} />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>
                    <div>
                        <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>
                            {editing ? "Editar cobrança" : "Nova cobrança"}
                        </p>
                        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "#10b981" }}>
                            <Check size={11} /> Ao receber, lança automaticamente no Fluxo de Caixa
                        </p>
                    </div>
                    <button onClick={() => !saving && onClose()}
                        className="p-1.5 rounded-lg cursor-pointer"
                        style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                        <X size={16} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 pt-4 pb-6 space-y-4 overflow-y-auto" style={{ maxHeight: "82vh" }}>
                    {err && (
                        <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
                            style={{ background: "#fef2f2", border: "1px solid #fecdd3", color: "#be123c" }}>
                            <span>⚠</span> {err}
                        </div>
                    )}

                    {/* Título */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Descrição</label>
                        <input value={title} onChange={e => setTitle(e.target.value)}
                            placeholder="Ex: Venda para Empresa X" autoFocus
                            className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-text"
                            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                    </div>

                    {/* Valor + Vencimento */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Valor (R$)</label>
                            <input inputMode="decimal" value={rawAmt} onChange={e => setRawAmt(e.target.value)}
                                placeholder="0,00"
                                className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono cursor-text"
                                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Prazo</label>
                            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                                className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-pointer"
                                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                        </div>
                    </div>

                    {/* Categoria */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Categoria</label>
                        <div className="grid grid-cols-3 gap-2">
                            {CATEGORIES.map(cat => {
                                const sel = category === cat.label;
                                return (
                                    <button key={cat.label} onClick={() => setCategory(cat.label)}
                                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border-2 cursor-pointer transition-all"
                                        style={sel
                                            ? { borderColor: cat.color, background: cat.color + "18", color: cat.color }
                                            : { borderColor: "var(--cf-border)", background: "transparent", color: "var(--cf-text2)" }}>
                                        <cat.icon size={13} />
                                        {cat.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Recorrência */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Recorrência</label>
                        <div className="grid grid-cols-4 gap-1.5 p-1.5 rounded-xl" style={{ background: "var(--cf-input)" }}>
                            {(["unica", "mensal", "trimestral", "anual"] as Recurrence[]).map(r => (
                                <button key={r} onClick={() => setRecurrence(r)}
                                    className="py-2 rounded-lg text-xs font-bold cursor-pointer transition-all"
                                    style={recurrence === r
                                        ? { background: "var(--cf-card)", color: "var(--cf-text)", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }
                                        : { background: "transparent", color: "var(--cf-text2)" }}>
                                    {RECURRENCE_LABEL[r]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Status inicial</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["pendente", "recebido", "agendado", "atrasado"] as ReceivableStatus[]).map(s => {
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

                    {/* Fotos */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>
                            Fotos (invoice, recibo...) — {photos.length}
                        </label>
                        
                        {/* Gallery de fotos */}
                        {photos.length > 0 && (
                            <div className="grid grid-cols-3 gap-2 mb-2">
                                {photos.map((url, idx) => (
                                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                                        <img src={url} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                                        <button
                                            onClick={() => removePhoto(idx)}
                                            className="absolute top-1 right-1 p-1 rounded-lg cursor-pointer"
                                            style={{ background: "rgba(0,0,0,0.6)" }}>
                                            <Trash size={12} style={{ color: "white" }} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Input de upload */}
                        <label className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold border-2 border-dashed cursor-pointer transition-all"
                            style={{ borderColor: "var(--cf-border)", background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                            <ImageIcon size={16} />
                            {uploadingPhoto ? "Enviando..." : "Adicionar foto"}
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoUpload}
                                disabled={uploadingPhoto}
                                className="hidden"
                            />
                        </label>
                    </div>

                    {/* Observação */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Observação (opcional)</label>
                        <input value={notes} onChange={e => setNotes(e.target.value)}
                            placeholder="Nome do cliente, referência…"
                            className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-text"
                            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                    </div>

                    <button onClick={submit} disabled={!canSave || saving}
                        className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${canSave && !saving ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                        style={canSave && !saving
                            ? { background: "linear-gradient(135deg, #10b981, #059669)", color: "white" }
                            : { background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                        {saving
                            ? <><Loader2 size={15} className="animate-spin" /> Salvando…</>
                            : <><Check size={15} /> {editing ? "Salvar alterações" : "Criar cobrança"}</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Modal de configuração de alerta ─────────────────────────────────────────

function AlertSettingsModal({ open, alertDays, onClose, onSave }: {
    open: boolean; alertDays: number; onClose: () => void; onSave: (d: number) => void;
}) {
    const [val, setVal] = useState(alertDays);
    useEffect(() => { if (open) setVal(alertDays); }, [open, alertDays]);
    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[990] flex items-center justify-center p-4"
            style={{ background: "rgba(13,17,23,0.5)", backdropFilter: "blur(8px)" }}>
            <div className="cf-card p-6 w-full max-w-sm" style={{ animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}>
                <div className="flex items-start justify-between mb-5">
                    <div>
                        <h3 className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>
                            Alertas de cobrança
                        </h3>
                        <p className="text-xs mt-1" style={{ color: "var(--cf-text2)" }}>
                            Quantos dias antes do prazo alertar?
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg cursor-pointer"
                        style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                        <X size={16} />
                    </button>
                </div>

                {/* Slider visual */}
                <div className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-medium" style={{ color: "var(--cf-text2)" }}>1 dia</span>
                        <span className="font-heading text-2xl font-bold" style={{ color: "var(--cf-text)" }}>{val}d</span>
                        <span className="text-xs font-medium" style={{ color: "var(--cf-text2)" }}>30 dias</span>
                    </div>
                    <input type="range" min={1} max={30} value={val} onChange={e => setVal(Number(e.target.value))}
                        className="w-full cursor-pointer accent-green-500" />
                    <div className="grid grid-cols-5 gap-1.5 mt-3">
                        {[1, 3, 5, 7, 14].map(d => (
                            <button key={d} onClick={() => setVal(d)}
                                className="py-2 rounded-xl text-xs font-bold border-2 cursor-pointer transition-all"
                                style={val === d
                                    ? { background: "linear-gradient(135deg, #10b981, #059669)", borderColor: "transparent", color: "white" }
                                    : { background: "var(--cf-input)", borderColor: "var(--cf-border)", color: "var(--cf-text2)" }}>
                                {d}d
                            </button>
                        ))}
                    </div>
                </div>

                {/* Preview do alerta */}
                <div className="rounded-xl px-4 py-3 mb-5 flex items-center gap-2.5"
                    style={{ background: "#ecfdf5", border: "1px solid #d1fae5" }}>
                    <Bell size={15} style={{ color: "#059669", flexShrink: 0 }} />
                    <p className="text-xs" style={{ color: "#065f46" }}>
                        Você verá um badge no menu e um toast ao entrar na página quando uma cobrança vencer em até <strong>{val} dia{val !== 1 ? "s" : ""}</strong>.
                    </p>
                </div>

                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer"
                        style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text2)" }}>
                        Cancelar
                    </button>
                    <button onClick={() => { onSave(val); onClose(); }}
                        className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer"
                        style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white" }}>
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Photo Gallery Modal ──────────────────────────────────────────────────────

function PhotoGalleryModal({ open, photos, onClose }: {
    open: boolean;
    photos: string[];
    onClose: () => void;
}) {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (open) setCurrentIndex(0);
    }, [open]);

    if (!open || photos.length === 0) return null;

    const current = photos[currentIndex];
    const handlePrev = () => setCurrentIndex((prev) => (prev - 1 + photos.length) % photos.length);
    const handleNext = () => setCurrentIndex((prev) => (prev + 1) % photos.length);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
            onClick={onClose}>
            <div className="relative w-full h-full flex items-center justify-center p-4"
                onClick={(e) => e.stopPropagation()}>
                {/* Imagem principal */}
                <div className="relative max-w-4xl max-h-[80vh] w-full h-full flex items-center justify-center">
                    <img src={current} alt={`Foto ${currentIndex + 1}`}
                        className="max-w-full max-h-full object-contain rounded-xl" />
                </div>

                {/* Navegação */}
                {photos.length > 1 && (
                    <>
                        <button onClick={handlePrev}
                            className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full cursor-pointer transition-all hover:scale-110"
                            style={{ background: "rgba(255,255,255,0.1)", color: "white" }}>
                            <ChevronLeft size={24} />
                        </button>
                        <button onClick={handleNext}
                            className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full cursor-pointer transition-all hover:scale-110"
                            style={{ background: "rgba(255,255,255,0.1)", color: "white" }}>
                            <ChevronRight size={24} />
                        </button>
                    </>
                )}

                {/* Indicador de página */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 px-3 py-2 rounded-full"
                    style={{ background: "rgba(255,255,255,0.15)" }}>
                    <span className="text-sm text-white font-medium">
                        {currentIndex + 1} / {photos.length}
                    </span>
                </div>

                {/* Botão fechar */}
                <button onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-lg cursor-pointer transition-all hover:scale-110"
                    style={{ background: "rgba(255,255,255,0.1)", color: "white" }}>
                    <X size={20} />
                </button>
            </div>
        </div>
    );
}

// ─── Receivable Card ──────────────────────────────────────────────────────────

function ReceivableCard({ receivable, alertDays, onEdit, onDelete, onReceive }: {
    receivable: Receivable & { _status: ReceivableStatus };
    alertDays: number;
    onEdit: () => void;
    onDelete: () => void;
    onReceive: () => Promise<void>;
}) {
    const [receiving, setReceiving] = useState(false);
    const [showPhotos, setShowPhotos] = useState(false);
    const days = daysUntil(receivable.dueDate);
    const status: ReceivableStatus = receivable._status;
    const meta = STATUS_META[status];
    const catMeta = getCatMeta(receivable.category);
    const CatIcon = catMeta.icon;
    const isUrgent = status !== ("recebido" as const) && days >= 0 && days <= alertDays;
    const isOverdue = status === ("atrasado" as const);

    const handleReceive = async () => {
        setReceiving(true);
        try { await onReceive(); } finally { setReceiving(false); }
    };

    return (
        <div className="cf-card overflow-hidden transition-all hover:shadow-md"
            style={{ borderColor: isOverdue ? "#fecaca" : isUrgent ? "#fde68a" : "var(--cf-border)" }}>
            {/* Barra colorida por categoria */}
            <div className="h-1" style={{ background: catMeta.color }} />

            <div className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                    {/* Ícone */}
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: catMeta.color + "18" }}>
                        <CatIcon size={18} style={{ color: catMeta.color }} />
                    </div>

                    <div className="flex-1 min-w-0">
                        {/* Título + valor */}
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="font-heading text-sm font-bold truncate" style={{ color: "var(--cf-text)" }}>
                                    {receivable.title}
                                </p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                                        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                                        {meta.label}
                                    </span>
                                    {receivable.recurrence !== "unica" && (
                                        <span className="flex items-center gap-1 text-xs" style={{ color: "var(--cf-text3)" }}>
                                            <Repeat size={10} /> {RECURRENCE_LABEL[receivable.recurrence]}
                                        </span>
                                    )}
                                    {receivable?.photos?.length > 0 && (
                                        <span onClick={() => setShowPhotos(true)}
                                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full cursor-pointer transition-all hover:opacity-80"
                                            style={{ background: "#10b981" + "20", color: "#10b981" }}>
                                            <ImageIcon size={10} /> {receivable?.photos?.length} foto{receivable?.photos?.length !== 1 ? "s" : ""}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span className="font-heading font-bold text-base shrink-0 mono"
                                style={{ color: isOverdue ? "#dc2626" : "var(--cf-text)" }}>
                                {toBRL(receivable.amount)}
                            </span>
                        </div>

                        {/* Prazo */}
                        <div className="flex items-center gap-1.5 mt-2.5">
                            <CalendarClock size={13}
                                style={{ color: isOverdue ? "#dc2626" : isUrgent ? "#b45309" : "var(--cf-text3)" }} />
                            <span className="text-xs font-medium"
                                style={{ color: isOverdue ? "#dc2626" : isUrgent ? "#b45309" : "var(--cf-text2)" }}>
                                {status === ("recebido" as const)
                                    ? `Recebido em ${receivable.receivedAt ? labelDate(receivable.receivedAt) : "—"}`
                                    : isOverdue
                                        ? `Atrasado há ${Math.abs(days)} dia${Math.abs(days) !== 1 ? "s" : ""} · ${labelDate(receivable.dueDate)}`
                                        : days === 0
                                            ? `⚠️ Vence hoje! · ${labelDate(receivable.dueDate)}`
                                            : `Vence em ${days} dia${days !== 1 ? "s" : ""} · ${labelDate(receivable.dueDate)}`}
                            </span>
                            {isUrgent && (
                                <span className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                                    style={{ background: "#fef9c3", color: "#b45309" }}>!</span>
                            )}
                        </div>

                        {receivable.notes && (
                            <p className="text-xs mt-1.5 truncate" style={{ color: "var(--cf-text3)" }}>📝 {receivable.notes}</p>
                        )}
                    </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 mt-4 pt-3" style={{ borderTop: "1px solid var(--cf-border)" }}>
                    {status !== ("recebido" as const) ? (
                        <button onClick={handleReceive} disabled={receiving}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all"
                            style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white" }}>
                            {receiving
                                ? <Loader2 size={13} className="animate-spin" />
                                : <CheckCircle2 size={13} />}
                            Marcar como recebido
                        </button>
                    ) : (
                        <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold"
                            style={{ background: "#dcfce7", color: "#15803d" }}>
                            <Check size={13} /> Recebido
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
            <PhotoGalleryModal open={showPhotos} photos={receivable?.photos ?? []} onClose={() => setShowPhotos(false)} />
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
                    {t.type === "warn" && <Bell size={15} />}
                    {t.msg}
                </div>
            ))}
        </div>
    );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function ContasReceberPage() {
    const [uid, setUid] = useState<string | null>(null);
    const [userName, setUserName] = useState("");
    const [userEmail, setUserEmail] = useState("");
    const [receivables, setReceivables] = useState<Receivable[]>([]);
    const [pageState, setPageState] = useState<"loading" | "ready" | "error">("loading");
    const [errMsg, setErrMsg] = useState("");

    const [modal, setModal] = useState(false);
    const [editing, setEditing] = useState<Receivable | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [alertDays, setAlertDays] = useState(5);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<"todos" | ReceivableStatus>("todos");
    const [filterCategory, setFilterCategory] = useState("todas");

    // Toast com suporte a múltiplos simultâneos
    const { toasts, show: showToast } = useToast();

    // Carrega alertDays do localStorage
    useEffect(() => {
        const saved = localStorage.getItem("nexusfi:alertDaysReceivable");
        if (saved) setAlertDays(Number(saved));
    }, []);

    const saveAlertDays = (d: number) => {
        setAlertDays(d);
        localStorage.setItem("nexusfi:alertDaysReceivable", String(d));
        showToast(`Alertas configurados para ${d} dia${d !== 1 ? "s" : ""} antes do prazo`);
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
                        query(collection(db, "users", u.uid, "receivables"), orderBy("createdAt", "desc")),
                        snap => { setReceivables(snap.docs.map(d => ({ id: d.id, ...d.data() } as Receivable))); setPageState("ready"); },
                        err => { setErrMsg(`${err.message} (${err.code})`); setPageState("error"); }
                    );
                });
            } catch (e: any) { setErrMsg(e.message); setPageState("error"); }
        })();
        return () => { authUnsub?.(); snapUnsub?.(); };
    }, []);

    // ── Toast de alerta ao entrar na página ───────────────────────────────────
    // Dispara uma única vez quando os dados carregam
    const alertsShownRef = React.useRef(false);
    useEffect(() => {
        if (pageState !== "ready" || alertsShownRef.current) return;
        alertsShownRef.current = true;

        const alertDaysCurrent = Number(localStorage.getItem("nexusfi:alertDaysReceivable")) || 5;

        const overdue = receivables.filter(r => r.status !== ("recebido" as const) && daysUntil(r.dueDate) < 0);
        const soon = receivables.filter(r => {
            if (r.status === ("recebido" as const)) return false;
            const d = daysUntil(r.dueDate);
            return d >= 0 && d <= alertDaysCurrent;
        });

        setTimeout(() => {
            if (overdue.length > 0) {
                showToast(
                    `${overdue.length} cobrança${overdue.length !== 1 ? "s" : ""} atrasada${overdue.length !== 1 ? "s" : ""} — procure receber!`,
                    "err"
                );
            }
            if (soon.length > 0) {
                setTimeout(() => {
                    showToast(
                        `⏰ ${soon.length} cobrança${soon.length !== 1 ? "s" : ""} vence${soon.length !== 1 ? "m" : ""} nos próximos ${alertDaysCurrent} dias`,
                        "warn"
                    );
                }, 600);
            }
        }, 800);
    }, [pageState]);

    // ── Logout ─────────────────────────────────────────────────────────────────
    async function handleLogout() {
        const { getFirebase } = await import("../../lib/firebase");
        const { signOut } = await import("firebase/auth");
        const { auth } = await getFirebase();
        await signOut(auth);
        window.location.href = "/login";
    }

    // ── Salvar cobrança ────────────────────────────────────────────────────────
    async function handleSave(data: Omit<Receivable, "id" | "userId" | "createdAt">) {
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
            await updateDoc(doc(db, "users", uid, "receivables", editing.id), clean as any);
            showToast("Cobrança atualizada!");
        } else {
            await addDoc(collection(db, "users", uid, "receivables"), { ...clean, createdAt: Date.now() });
            showToast("Cobrança criada!");
        }
    }

    // ── Marcar como recebido + lançar no cashflow ──────────────────────────────
    async function handleReceive(receivable: Receivable) {
        if (!uid) return;
        const [{ getFirebase }, { doc, updateDoc, collection, addDoc }] = await Promise.all([
            import("../../lib/firebase"),
            import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();
        const receivedAt = TODAY;

        await updateDoc(doc(db, "users", uid, "receivables", receivable.id), { status: "recebido", receivedAt });

        await addDoc(collection(db, "users", uid, "cashflow"), {
            type: "entrada",
            description: receivable.title,
            category: CAT_TO_CASHFLOW[receivable.category] ?? "Outros ganhos",
            amount: receivable.amount,
            date: receivedAt,
            note: `Cobrança · ${RECURRENCE_LABEL[receivable.recurrence]}`,
            sourceReceivableId: receivable.id,
            createdAt: Date.now(),
        });

        showToast("Recebido! Lançado no Fluxo de Caixa ✓");
    }

    // ── Excluir cobrança ───────────────────────────────────────────────────────
    async function handleDelete() {
        if (!confirmId || !uid || deleting) return;
        setDeleting(true);
        try {
            const [{ getFirebase }, { doc, deleteDoc }] = await Promise.all([
                import("../../lib/firebase"),
                import("firebase/firestore"),
            ]);
            const { db } = await getFirebase();
            await deleteDoc(doc(db, "users", uid, "receivables", confirmId));
            setConfirmId(null);
            showToast("Cobrança removida.");
        } catch (e: any) {
            showToast(e.message, "err");
        } finally {
            setDeleting(false);
        }
    }

    // ── Dados derivados ────────────────────────────────────────────────────────

    const enriched = useMemo((): (Receivable & { _status: ReceivableStatus })[] =>
        receivables.map(r => ({ ...r, _status: computeStatus(r) })),
        [receivables]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return enriched.filter(r => {
            if (filterStatus !== "todos" && r._status !== filterStatus) return false;
            if (filterCategory !== "todas" && r.category !== filterCategory) return false;
            if (q && !r.title.toLowerCase().includes(q) && !r.notes.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [enriched, filterStatus, filterCategory, search]);

    // Agrupa em seções ordenadas por prioridade
    const sections = useMemo(() => [
        { key: "atrasado", label: "Atrasadas", color: "#dc2626", receivables: filtered.filter(r => r._status === ("atrasado" as const)) },
        { key: "pendente", label: "Pendentes", color: "#b45309", receivables: filtered.filter(r => r._status === ("pendente" as const)) },
        { key: "agendado", label: "Agendadas", color: "#1d4ed8", receivables: filtered.filter(r => r._status === ("agendado" as const)) },
        { key: "recebido", label: "Recebidas", color: "#15803d", receivables: filtered.filter(r => r._status === ("recebido" as const)) },
    ].filter(s => s.receivables.length > 0), [filtered]);

    // KPIs
    const kpis = useMemo(() => {
        const notReceived = enriched.filter(r => r._status !== ("recebido" as const));
        return {
            aReceber: notReceived.reduce((s, r) => s + r.amount, 0),
            atrasado: enriched.filter(r => r._status === ("atrasado" as const)).reduce((s, r) => s + r.amount, 0),
            recebido: enriched.filter(r => r._status === ("recebido" as const)).reduce((s, r) => s + r.amount, 0),
            alert: enriched.filter(r => {
                if (r._status === ("recebido" as const)) return false;
                const d = daysUntil(r.dueDate);
                return d >= 0 && d <= alertDays;
            }).length,
            totalNotReceived: notReceived.length,
            totalOverdue: enriched.filter(r => r._status === ("atrasado" as const)).length,
            totalReceived: enriched.filter(r => r._status === ("recebido" as const)).length,
        };
    }, [enriched, alertDays]);

    // ── Loading / Error ────────────────────────────────────────────────────────

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
                style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white" }}>
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
        input:focus, select:focus { border-color:#10b981 !important; box-shadow:0 0 0 3px rgba(16,185,129,0.1) !important; }
      `}</style>

            <Navbar user={{ displayName: userName, email: userEmail }} activePath="/contas-receber" onLogout={handleLogout} />

            {/* Modais */}
            <ReceivableModal
                open={modal} editing={editing}
                onClose={() => { setModal(false); setEditing(null); }}
                onSave={handleSave}
            />
            <AlertSettingsModal
                open={settingsOpen} alertDays={alertDays}
                onClose={() => setSettingsOpen(false)}
                onSave={saveAlertDays}
            />

            {/* Confirm delete */}
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
                            Excluir cobrança?
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

            {/* Toast stack */}
            <ToastStack toasts={toasts} />

            <main className="flex-1 p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-5 overflow-y-auto overflow-x-hidden pb-24 lg:pb-8">

                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="font-heading text-2xl font-bold leading-tight" style={{ color: "var(--cf-text)" }}>
                            Contas a receber
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
                                        {kpis.totalOverdue} cobrança{kpis.totalOverdue !== 1 ? "s" : ""} atrasada{kpis.totalOverdue !== 1 ? "s" : ""}
                                    </span>
                                    : <span style={{ color: "#10b981" }}>✓ Tudo em dia!</span>
                            }
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setSettingsOpen(true)}
                            className="relative p-2 rounded-xl cursor-pointer"
                            style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}
                            title={`Alertas: ${alertDays} dias`}>
                            <Settings2 size={16} />
                            {/* Indicador do prazo configurado */}
                            <span className="absolute -top-1 -right-1 text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center"
                                style={{ background: "#10b981", color: "white" }}>
                                {alertDays}
                            </span>
                        </button>
                        <button onClick={() => { setEditing(null); setModal(true); }}
                            className="hidden sm:flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer"
                            style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white" }}>
                            <Plus size={14} /> Nova cobrança
                        </button>
                    </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    {[
                        { label: "A receber", val: toBRL(kpis.aReceber), color: "#10b981", bg: "#ecfdf5", sub: `${kpis.totalNotReceived} cobrança${kpis.totalNotReceived !== 1 ? "s" : ""}` },
                        { label: "Atrasadas", val: toBRL(kpis.atrasado), color: "#dc2626", bg: "#fee2e2", sub: `${kpis.totalOverdue} cobrança${kpis.totalOverdue !== 1 ? "s" : ""}` },
                        { label: "Recebidas", val: toBRL(kpis.recebido), color: "#059669", bg: "#dcfce7", sub: `${kpis.totalReceived} cobrança${kpis.totalReceived !== 1 ? "s" : ""}` },
                        { label: `Alerta (${alertDays}d)`, val: String(kpis.alert), color: "#b45309", bg: "#fef9c3", sub: "vence em breve" },
                    ].map(({ label, val, color, bg, sub }, i) => (
                        <div key={label} className="cf-kpi kin p-3 sm:p-4 flex flex-col gap-1.5"
                            style={{ animationDelay: `${i * 60}ms` }}>
                            <p className="text-xs font-semibold" style={{ color: "var(--cf-text2)" }}>{label}</p>
                            <p className="font-heading font-bold text-base sm:text-lg mono" style={{ color }}>{val}</p>
                            <p className="text-xs" style={{ color: "var(--cf-text3)" }}>{sub}</p>
                        </div>
                    ))}
                </div>

                {/* Toolbar de filtros */}
                <div className="cf-card p-3.5 space-y-3">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                            style={{ color: "var(--cf-text3)" }} />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar descrição ou observação…"
                            className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none cursor-text"
                            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
                        {(["todos", "pendente", "atrasado", "agendado", "recebido"] as const).map(f => {
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
                                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
                                    className="pl-7 pr-6 py-1.5 rounded-full text-xs font-semibold border cursor-pointer appearance-none outline-none"
                                    style={{ background: "var(--cf-input)", borderColor: "var(--cf-border)", color: "var(--cf-text)" }}>
                                    <option value="todas">Todas</option>
                                    {CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                                </select>
                            </div>
                            <span className="text-xs font-medium" style={{ color: "var(--cf-text3)" }}>
                                {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Lista agrupada por status */}
                {filtered.length === 0 ? (
                    <div className="cf-card p-12 flex flex-col items-center text-center gap-3">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                            style={{ background: "var(--cf-input)" }}>
                            <CalendarClock size={24} style={{ color: "var(--cf-text3)" }} />
                        </div>
                        <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>
                            {search || filterStatus !== "todos" || filterCategory !== "todas"
                                ? "Nenhum resultado"
                                : "Nenhuma cobrança cadastrada"}
                        </p>
                        <p className="text-xs max-w-xs" style={{ color: "var(--cf-text2)" }}>
                            {search || filterStatus !== "todos" || filterCategory !== "todas"
                                ? "Ajuste os filtros para ver outras cobranças."
                                : "Adicione suas cobranças e receba alertas antes do prazo."}
                        </p>
                        {!search && filterStatus === "todos" && filterCategory === "todas" && (
                            <button onClick={() => { setEditing(null); setModal(true); }}
                                className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl cursor-pointer mt-2"
                                style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white" }}>
                                <Plus size={14} /> Adicionar cobrança
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {sections.map(section => (
                            <div key={section.key}>
                                {/* Separador de seção */}
                                <div className="flex items-center gap-2.5 mb-3">
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: section.color }} />
                                    <p className="text-sm font-bold" style={{ color: section.color }}>{section.label}</p>
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                        style={{ background: section.color + "18", color: section.color }}>
                                        {section.receivables.length}
                                    </span>
                                    <div className="flex-1 h-px" style={{ background: section.color + "30" }} />
                                    <span className="text-xs font-bold mono" style={{ color: section.color }}>
                                        {toBRL(section.receivables.reduce((s, r) => s + r.amount, 0))}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {section.receivables.map(receivable => (
                                        <ReceivableCard
                                            key={receivable.id}
                                            receivable={receivable}
                                            alertDays={alertDays}
                                            onEdit={() => { setEditing(receivable); setModal(true); }}
                                            onDelete={() => setConfirmId(receivable.id)}
                                            onReceive={() => handleReceive(receivable)}
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
                    background: "linear-gradient(135deg, #10b981, #059669)",
                    color: "white",
                    boxShadow: "0 8px 24px rgba(16,185,129,0.4)",
                }}>
                <Plus size={22} />
            </button>
        </div>
    );
}

// Necessário para o useRef dentro do useEffect sem import
import React from "react";