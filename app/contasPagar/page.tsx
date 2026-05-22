"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    Plus, X, Check, Trash2, Edit3, AlertTriangle,
    CalendarClock, Loader2, Search, Filter,
    CheckCircle2, CircleDollarSign, Repeat, Settings2,
    ArrowDownRight, Tag, Building2, Zap, Receipt,
    Bell, Image as ImageIcon, Trash, ChevronLeft, ChevronRight, type LucideIcon,
} from "lucide-react";
import Navbar from "../components/Navbar";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type BillStatus = "pendente" | "pago" | "vencido" | "agendado";
type Recurrence = "unica" | "mensal" | "trimestral" | "anual";

interface Bill {
    id: string;
    title: string;
    amount: number;
    dueDate: string;       // "YYYY-MM-DD"
    category: string;
    status: BillStatus;
    recurrence: Recurrence;
    notes: string;
    photos: string[];      // URLs de Storage
    paidAt?: string;
    createdAt: number;
    userId: string;
    cashflowId?: string;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split("T")[0];

const CATEGORIES: { label: string; icon: LucideIcon; color: string }[] = [
    { label: "Aluguel", icon: Building2, color: "#6366f1" },
    { label: "Fornecedores", icon: Receipt, color: "#f59e0b" },
    { label: "Folha", icon: CircleDollarSign, color: "#10b981" },
    { label: "Impostos", icon: Tag, color: "#ef4444" },
    { label: "Serviços", icon: Zap, color: "#3b82f6" },
    { label: "Outros", icon: ArrowDownRight, color: "#8b5cf6" },
];

const RECURRENCE_LABEL: Record<Recurrence, string> = {
    unica: "Única",
    mensal: "Mensal",
    trimestral: "Trimestral",
    anual: "Anual",
};

const STATUS_META: Record<BillStatus, { label: string; bg: string; color: string; border: string }> = {
    pendente: { label: "Pendente", bg: "#fef9c3", color: "#b45309", border: "#fde68a" },
    pago: { label: "Pago", bg: "#dcfce7", color: "#15803d", border: "#bbf7d0" },
    vencido: { label: "Vencido", bg: "#fee2e2", color: "#b91c1c", border: "#fecaca" },
    agendado: { label: "Agendado", bg: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" },
};

// Mapeamento de categoria → cashflow
const CAT_TO_CASHFLOW: Record<string, string> = {
    "Aluguel": "Aluguel",
    "Fornecedores": "Fornecedores",
    "Folha": "Folha de pagamento",
    "Impostos": "Impostos",
    "Serviços": "TI / Software",
    "Outros": "Outros gastos",
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

const computeStatus = (bill: Bill): BillStatus => {
     if (bill.status === ("pago" as const)) return "pago" as const;
     const days = daysUntil(bill.dueDate);
     if (days < 0) return "vencido" as const;
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

// Formata número com separador de mil (.)
function formatAmount(raw: string): string {
    // Remove tudo que não é número, vírgula ou ponto
    let s = raw.replace(/[^\d,.]/g, "");
    
    // Se estiver vazio, retorna vazio
    if (!s) return "";
    
    // Se tem vírgula (formato brasileiro), separa inteiros e decimais
    if (s.includes(",")) {
        const [intPart, decPart] = s.split(",");
        const formatted = intPart.replace(/\./g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        return decPart !== undefined ? formatted + "," + decPart : formatted;
    }
    
    // Se não tem vírgula, retorna apenas os dígitos sem formatação de milhares
    // Isso permite o usuário digitar valores sem separadores
    return s;
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

// ─── Modal de conta ───────────────────────────────────────────────────────────

interface BillModalProps {
    open: boolean;
    editing: Bill | null;
    onClose: () => void;
    onSave: (data: Omit<Bill, "id" | "userId" | "createdAt">) => Promise<void>;
}

function BillModal({ open, editing, onClose, onSave }: BillModalProps) {
    const [title, setTitle] = useState("");
    const [rawAmt, setRawAmt] = useState("");
    const [dueDate, setDueDate] = useState(TODAY);
    const [category, setCategory] = useState("Outros");
    const [recurrence, setRecurrence] = useState<Recurrence>("unica");
    const [notes, setNotes] = useState("");
    const [status, setStatus] = useState<BillStatus>("pendente");
    const [photos, setPhotos] = useState<string[]>([]);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        if (!open) return;
        setTitle(editing?.title ?? "");
        setRawAmt(editing ? editing.amount.toFixed(2).replace(".", ",") : "");
        setDueDate(editing?.dueDate ?? TODAY);
        setCategory(editing?.category ?? "Outros");
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
            const storageRef = ref(storage, `bills/${filename}`);
            
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
                paidAt: editing?.paidAt,
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
                            {editing ? "Editar conta" : "Nova conta a pagar"}
                        </p>
                        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "#10b981" }}>
                            <Check size={11} /> Ao pagar, lança automaticamente no Fluxo de Caixa
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
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Título</label>
                        <input value={title} onChange={e => setTitle(e.target.value)}
                            placeholder="Ex: Aluguel do escritório" autoFocus
                            className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-text"
                            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                    </div>

                    {/* Valor + Vencimento */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Valor (R$)</label>
                            <input inputMode="decimal" value={rawAmt} onChange={e => setRawAmt(formatAmount(e.target.value))}
                                placeholder="0,00"
                                className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono cursor-text"
                                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Vencimento</label>
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
                            {(["pendente", "pago", "agendado", "vencido"] as BillStatus[]).map(s => {
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
                            Fotos (boleto, nota fiscal...) — {photos.length}
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
                            placeholder="Número do boleto, fornecedor..."
                            className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-text"
                            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                    </div>

                    <button onClick={submit} disabled={!canSave || saving}
                        className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${canSave && !saving ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                        style={canSave && !saving
                            ? { background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }
                            : { background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                        {saving
                            ? <><Loader2 size={15} className="animate-spin" /> Salvando…</>
                            : <><Check size={15} /> {editing ? "Salvar alterações" : "Criar conta"}</>}
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
                            Alertas de vencimento
                        </h3>
                        <p className="text-xs mt-1" style={{ color: "var(--cf-text2)" }}>
                            Quantos dias antes do vencimento alertar?
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
                        className="w-full cursor-pointer accent-blue-500" />
                    <div className="grid grid-cols-5 gap-1.5 mt-3">
                        {[1, 3, 5, 7, 14].map(d => (
                            <button key={d} onClick={() => setVal(d)}
                                className="py-2 rounded-xl text-xs font-bold border-2 cursor-pointer transition-all"
                                style={val === d
                                    ? { background: "linear-gradient(135deg, #3b82f6, #2563eb)", borderColor: "transparent", color: "white" }
                                    : { background: "var(--cf-input)", borderColor: "var(--cf-border)", color: "var(--cf-text2)" }}>
                                {d}d
                            </button>
                        ))}
                    </div>
                </div>

                {/* Preview do alerta */}
                <div className="rounded-xl px-4 py-3 mb-5 flex items-center gap-2.5"
                    style={{ background: "#fffbeb", border: "1px solid #fde68a" }}>
                    <Bell size={15} style={{ color: "#b45309", flexShrink: 0 }} />
                    <p className="text-xs" style={{ color: "#78350f" }}>
                        Você verá um badge no menu e um toast ao entrar na página quando uma conta vencer em até <strong>{val} dia{val !== 1 ? "s" : ""}</strong>.
                    </p>
                </div>

                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-semibold cursor-pointer"
                        style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text2)" }}>
                        Cancelar
                    </button>
                    <button onClick={() => { onSave(val); onClose(); }}
                        className="flex-1 py-3 rounded-xl text-sm font-bold cursor-pointer"
                        style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>
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

// ─── Bill Card ────────────────────────────────────────────────────────────────

function BillCard({ bill, alertDays, onEdit, onDelete, onPay }: {
    bill: Bill & { _status: BillStatus };
    alertDays: number;
    onEdit: () => void;
    onDelete: () => void;
    onPay: () => Promise<void>;
}) {
    const [paying, setPaying] = useState(false);
    const [showPhotos, setShowPhotos] = useState(false);
    const days = daysUntil(bill.dueDate);
    const status: BillStatus = bill._status;
    const meta = STATUS_META[status];
    const catMeta = getCatMeta(bill.category);
    const CatIcon = catMeta.icon;
    const isUrgent = status !== ("pago" as const) && days >= 0 && days <= alertDays;
    const isOverdue = status === ("vencido" as const);

    const handlePay = async () => {
        setPaying(true);
        try { await onPay(); } finally { setPaying(false); }
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
                                    {bill.title}
                                </p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                                        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                                        {meta.label}
                                    </span>
                                    {bill.recurrence !== "unica" && (
                                        <span className="flex items-center gap-1 text-xs" style={{ color: "var(--cf-text3)" }}>
                                            <Repeat size={10} /> {RECURRENCE_LABEL[bill.recurrence]}
                                        </span>
                                    )}
                                    {bill?.photos?.length > 0 && (
                                        <span onClick={() => setShowPhotos(true)}
                                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full cursor-pointer transition-all hover:opacity-80"
                                            style={{ background: "#3b82f6" + "20", color: "#3b82f6" }}>
                                            <ImageIcon size={10} /> {bill?.photos?.length} foto{bill?.photos?.length !== 1 ? "s" : ""}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span className="font-heading font-bold text-base shrink-0 mono"
                                style={{ color: isOverdue ? "#dc2626" : "var(--cf-text)" }}>
                                {toBRL(bill.amount)}
                            </span>
                        </div>

                        {/* Vencimento */}
                        <div className="flex items-center gap-1.5 mt-2.5">
                            <CalendarClock size={13}
                                style={{ color: isOverdue ? "#dc2626" : isUrgent ? "#b45309" : "var(--cf-text3)" }} />
                            <span className="text-xs font-medium"
                                style={{ color: isOverdue ? "#dc2626" : isUrgent ? "#b45309" : "var(--cf-text2)" }}>
                                {status === ("pago" as const)
                                    ? `Pago em ${bill.paidAt ? labelDate(bill.paidAt) : "—"}`
                                    : isOverdue
                                        ? `Venceu há ${Math.abs(days)} dia${Math.abs(days) !== 1 ? "s" : ""} · ${labelDate(bill.dueDate)}`
                                        : days === 0
                                            ? `⚠️ Vence hoje! · ${labelDate(bill.dueDate)}`
                                            : `Vence em ${days} dia${days !== 1 ? "s" : ""} · ${labelDate(bill.dueDate)}`}
                            </span>
                            {isUrgent && (
                                <span className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                                    style={{ background: "#fef9c3", color: "#b45309" }}>!</span>
                            )}
                        </div>

                        {bill.notes && (
                            <p className="text-xs mt-1.5 truncate" style={{ color: "var(--cf-text3)" }}>📝 {bill.notes}</p>
                        )}
                    </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 mt-4 pt-3" style={{ borderTop: "1px solid var(--cf-border)" }}>
                    {status !== ("pago" as const) ? (
                        <button onClick={handlePay} disabled={paying}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all"
                            style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "white" }}>
                            {paying
                                ? <Loader2 size={13} className="animate-spin" />
                                : <CheckCircle2 size={13} />}
                            Marcar como pago
                        </button>
                    ) : (
                        <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold"
                            style={{ background: "#dcfce7", color: "#15803d" }}>
                            <Check size={13} /> Conta paga
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
            <PhotoGalleryModal open={showPhotos} photos={bill?.photos ?? []} onClose={() => setShowPhotos(false)} />
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

export default function ContasPagarPage() {
    const [uid, setUid] = useState<string | null>(null);
    const [userName, setUserName] = useState("");
    const [userEmail, setUserEmail] = useState("");
    const [bills, setBills] = useState<Bill[]>([]);
    const [pageState, setPageState] = useState<"loading" | "ready" | "error">("loading");
    const [errMsg, setErrMsg] = useState("");

    const [modal, setModal] = useState(false);
    const [editing, setEditing] = useState<Bill | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const [alertDays, setAlertDays] = useState(5);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<"todos" | BillStatus>("todos");
    const [filterCategory, setFilterCategory] = useState("todas");

    // Toast com suporte a múltiplos simultâneos
    const { toasts, show: showToast } = useToast();

    // Carrega alertDays do localStorage
    useEffect(() => {
        const saved = localStorage.getItem("nexusfi:alertDays");
        if (saved) setAlertDays(Number(saved));
    }, []);

    const saveAlertDays = (d: number) => {
        setAlertDays(d);
        localStorage.setItem("nexusfi:alertDays", String(d));
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
                        query(collection(db, "users", u.uid, "bills"), orderBy("createdAt", "desc")),
                        snap => { setBills(snap.docs.map(d => ({ id: d.id, ...d.data() } as Bill))); setPageState("ready"); },
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

        const alertDaysCurrent = Number(localStorage.getItem("nexusfi:alertDays")) || 5;

        const overdue = bills.filter(b => b.status !== ("pago" as const) && daysUntil(b.dueDate) < 0);
        const soon = bills.filter(b => {
            if (b.status === ("pago" as const)) return false;
            const d = daysUntil(b.dueDate);
            return d >= 0 && d <= alertDaysCurrent;
        });

        setTimeout(() => {
            if (overdue.length > 0) {
                showToast(
                    `${overdue.length} conta${overdue.length !== 1 ? "s" : ""} vencida${overdue.length !== 1 ? "s" : ""} — regularize o quanto antes!`,
                    "err"
                );
            }
            if (soon.length > 0) {
                setTimeout(() => {
                    showToast(
                        `⏰ ${soon.length} conta${soon.length !== 1 ? "s" : ""} vence${soon.length !== 1 ? "m" : ""} nos próximos ${alertDaysCurrent} dias`,
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

    // ── Salvar conta ───────────────────────────────────────────────────────────
    async function handleSave(data: Omit<Bill, "id" | "userId" | "createdAt">) {
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
            await updateDoc(doc(db, "users", uid, "bills", editing.id), clean as any);
            showToast("Conta atualizada!");
        } else {
            await addDoc(collection(db, "users", uid, "bills"), { ...clean, createdAt: Date.now() });
            showToast("Conta criada!");
        }
    }

    // ── Marcar como pago + lançar no cashflow ──────────────────────────────────
    async function handlePay(bill: Bill) {
        if (!uid) return;
        const [{ getFirebase }, { doc, updateDoc, collection, addDoc }] = await Promise.all([
            import("../../lib/firebase"),
            import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();
        const paidAt = TODAY;

        await updateDoc(doc(db, "users", uid, "bills", bill.id), { status: "pago", paidAt });

        await addDoc(collection(db, "users", uid, "cashflow"), {
            type: "saida",
            description: bill.title,
            category: CAT_TO_CASHFLOW[bill.category] ?? "Outros gastos",
            amount: bill.amount,
            date: paidAt,
            note: `Conta a pagar · ${RECURRENCE_LABEL[bill.recurrence]}`,
            sourceBillId: bill.id,
            createdAt: Date.now(),
        });

        showToast("Pago! Lançado no Fluxo de Caixa ✓");
    }

    // ── Atualizar categoria e sincronizar cashflow se a conta já está no fluxo ──
    async function handleUpdateCategory(billId: string, oldCategory: string, newCategory: string, bill: Bill) {
        if (!uid || oldCategory === newCategory) return;
        
        const [{ getFirebase }, { doc, updateDoc, collection, query, where, getDocs }] = await Promise.all([
            import("../../lib/firebase"),
            import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();

        // Atualiza a categoria na conta
        await updateDoc(doc(db, "users", uid, "bills", billId), { category: newCategory });

        // Se a conta já tem um registro no cashflow (status pago), atualiza lá também
        if (bill.status === "pago" && bill.cashflowId) {
            await updateDoc(doc(db, "users", uid, "cashflow", bill.cashflowId), {
                category: CAT_TO_CASHFLOW[newCategory] ?? "Outros gastos",
            });
            showToast("Categoria atualizada em contas e fluxo de caixa");
        } else {
            showToast("Categoria atualizada!");
        }
    }

    // ── Excluir conta ──────────────────────────────────────────────────────────
    async function handleDelete() {
        if (!confirmId || !uid || deleting) return;
        setDeleting(true);
        try {
            const [{ getFirebase }, { doc, deleteDoc }] = await Promise.all([
                import("../../lib/firebase"),
                import("firebase/firestore"),
            ]);
            const { db } = await getFirebase();
            await deleteDoc(doc(db, "users", uid, "bills", confirmId));
            setConfirmId(null);
            showToast("Conta removida.");
        } catch (e: any) {
            showToast(e.message, "err");
        } finally {
            setDeleting(false);
        }
    }

    // ── Dados derivados ────────────────────────────────────────────────────────

    const enriched = useMemo((): (Bill & { _status: BillStatus })[] =>
        bills.map(b => ({ ...b, _status: computeStatus(b) })),
        [bills]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return enriched.filter(b => {
            if (filterStatus !== "todos" && b._status !== filterStatus) return false;
            if (filterCategory !== "todas" && b.category !== filterCategory) return false;
            if (q && !b.title.toLowerCase().includes(q) && !b.notes.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [enriched, filterStatus, filterCategory, search]);

    // Agrupa em seções ordenadas por prioridade
    const sections = useMemo(() => [
        { key: "vencido", label: "Vencidas", color: "#dc2626", bills: filtered.filter(b => b._status === ("vencido" as const)) },
        { key: "pendente", label: "Pendentes", color: "#b45309", bills: filtered.filter(b => b._status === ("pendente" as const)) },
        { key: "agendado", label: "Agendadas", color: "#1d4ed8", bills: filtered.filter(b => b._status === ("agendado" as const)) },
        { key: "pago", label: "Pagas", color: "#15803d", bills: filtered.filter(b => b._status === ("pago" as const)) },
    ].filter(s => s.bills.length > 0), [filtered]);

    // KPIs
    const kpis = useMemo(() => {
        const notPaid = enriched.filter(b => b._status !== ("pago" as const));
        return {
            aPagar: notPaid.reduce((s, b) => s + b.amount, 0),
            vencido: enriched.filter(b => b._status === ("vencido" as const)).reduce((s, b) => s + b.amount, 0),
            pago: enriched.filter(b => b._status === ("pago" as const)).reduce((s, b) => s + b.amount, 0),
            alert: enriched.filter(b => {
                if (b._status === ("pago" as const)) return false;
                const d = daysUntil(b.dueDate);
                return d >= 0 && d <= alertDays;
            }).length,
            totalNotPaid: notPaid.length,
            totalOverdue: enriched.filter(b => b._status === ("vencido" as const)).length,
            totalPaid: enriched.filter(b => b._status === ("pago" as const)).length,
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

            <Navbar user={{ displayName: userName, email: userEmail }} activePath="/contas-pagar" onLogout={handleLogout} />

            {/* Modais */}
            <BillModal
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
                            Excluir conta?
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
                            Contas a pagar
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
                                        {kpis.totalOverdue} conta{kpis.totalOverdue !== 1 ? "s" : ""} vencida{kpis.totalOverdue !== 1 ? "s" : ""}
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
                                style={{ background: "#3b82f6", color: "white" }}>
                                {alertDays}
                            </span>
                        </button>
                        <button onClick={() => { setEditing(null); setModal(true); }}
                            className="hidden sm:flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer"
                            style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>
                            <Plus size={14} /> Nova conta
                        </button>
                    </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    {[
                        { label: "A pagar", val: toBRL(kpis.aPagar), color: "#3b82f6", bg: "#eff6ff", sub: `${kpis.totalNotPaid} conta${kpis.totalNotPaid !== 1 ? "s" : ""}` },
                        { label: "Vencidas", val: toBRL(kpis.vencido), color: "#dc2626", bg: "#fee2e2", sub: `${kpis.totalOverdue} conta${kpis.totalOverdue !== 1 ? "s" : ""}` },
                        { label: "Pagas", val: toBRL(kpis.pago), color: "#059669", bg: "#dcfce7", sub: `${kpis.totalPaid} conta${kpis.totalPaid !== 1 ? "s" : ""}` },
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
                            placeholder="Buscar título ou observação…"
                            className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none cursor-text"
                            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-0.5 scrollbar-none">
                        {(["todos", "pendente", "vencido", "agendado", "pago"] as const).map(f => {
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
                                : "Nenhuma conta cadastrada"}
                        </p>
                        <p className="text-xs max-w-xs" style={{ color: "var(--cf-text2)" }}>
                            {search || filterStatus !== "todos" || filterCategory !== "todas"
                                ? "Ajuste os filtros para ver outras contas."
                                : "Adicione suas contas a pagar e receba alertas antes do vencimento."}
                        </p>
                        {!search && filterStatus === "todos" && filterCategory === "todas" && (
                            <button onClick={() => { setEditing(null); setModal(true); }}
                                className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl cursor-pointer mt-2"
                                style={{ background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white" }}>
                                <Plus size={14} /> Adicionar conta
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
                                        {section.bills.length}
                                    </span>
                                    <div className="flex-1 h-px" style={{ background: section.color + "30" }} />
                                    <span className="text-xs font-bold mono" style={{ color: section.color }}>
                                        {toBRL(section.bills.reduce((s, b) => s + b.amount, 0))}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {section.bills.map(bill => (
                                        <BillCard
                                            key={bill.id}
                                            bill={bill}
                                            alertDays={alertDays}
                                            onEdit={() => { setEditing(bill); setModal(true); }}
                                            onDelete={() => setConfirmId(bill.id)}
                                            onPay={() => handlePay(bill)}
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

// Necessário para o useRef dentro do useEffect sem import
import React from "react";