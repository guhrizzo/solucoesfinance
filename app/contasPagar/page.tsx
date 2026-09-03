"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    Plus, X, Check, Trash2, Edit3, AlertTriangle,
    CalendarClock, Loader2, Search, Filter,
    CheckCircle2, CircleDollarSign, Repeat, Settings2,
    ArrowDownRight, Tag, Building2, Zap, Receipt,
    Bell, Image as ImageIcon, Trash, ChevronLeft, ChevronRight, type LucideIcon,
    ShieldCheck,
} from "lucide-react";
import Navbar from "../components/Navbar";
import AccessDenied from "../components/AccessDenied";
import { PageLoader } from "../components/ui";
import PaymentMethodSelector, { PaymentMethodBadge } from "../components/PaymentMethodSelector";
import PinModal from "../components/PinModal";
import { CadastroManager, CadastroField, formatDoc, onlyDigits } from "../components/CadastroPanel";
import type { PaymentMethod } from "../types/payment";
import { verifyPin, loadPinHash, getPinLockStatus } from "../hooks/usePin";
import { usePeriod } from "../hooks/usePeriod";
import { syncBillCashflow } from "@/lib/billTaxSync";
import { stampCreate, stampUpdate, stampSettle } from "@/lib/audit";
import { AuditTrail } from "../components/AuditTrail";
import SeriesScopeDialog, { type SeriesScope } from "../components/SeriesScopeDialog";
import { addMonthsClamped, monthLabel } from "@/lib/dateSeries";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type BillStatus = "pendente" | "pago" | "vencido" | "agendado";
// "unica" = 1 lançamento. "numeral" = série de N parcelas mensais (N documentos,
// um por mês, agrupados por seriesId). Valores antigos ("mensal"/"trimestral"/
// "anual") não existem mais na UI — são tratados como "unica".
type Recurrence = "unica" | "numeral";

interface Bill {
    id: string;
    title: string;
    amount: number;
    dueDate: string;       // "YYYY-MM-DD"
    category: string;
    status: BillStatus;
    recurrence: Recurrence;
    // Preenchidos só quando recurrence === "numeral":
    seriesId?: string;          // agrupa as parcelas da mesma série
    installmentIndex?: number;  // 1..N — posição desta parcela
    installmentCount?: number;  // N — tamanho da série
    notes: string;
    photos: string[];      // URLs de Storage
    paidAt?: string;
    createdAt: number;
    userId: string;
    cashflowId?: string;
    paymentMethod?: PaymentMethod;      // origem prevista no lançamento
    paidPaymentMethod?: PaymentMethod;  // origem confirmada na baixa
    partyName?: string;                 // fornecedor vinculado (nome / razão social)
    partyDoc?: string;                  // fornecedor vinculado (CNPJ/CPF, só dígitos)
    createdBy?: string;                 // uid de quem criou (auditoria via PIN)
    createdByName?: string;
    updatedBy?: string;                 // uid de quem editou por último
    updatedByName?: string;
    updatedAt?: number;
    settledBy?: string;                 // uid de quem deu baixa (marcou como pago)
    settledByName?: string;
    settledAt?: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().split("T")[0];

const CATEGORIES: { label: string; icon: LucideIcon; color: string }[] = [
    { label: "Aluguel", icon: Building2, color: "var(--brand)" },
    { label: "Fornecedores", icon: Receipt, color: "var(--warn)" },
    { label: "Folha", icon: CircleDollarSign, color: "var(--pos)" },
    { label: "Impostos", icon: Tag, color: "var(--neg)" },
    { label: "Serviços", icon: Zap, color: "var(--brand)" },
    { label: "Outros", icon: ArrowDownRight, color: "var(--brand)" },
];

const STATUS_META: Record<BillStatus, { label: string; bg: string; color: string; border: string }> = {
    pendente: { label: "Pendente", bg: "var(--warn-weak)", color: "var(--warn)", border: "var(--warn-weak)" },
    pago: { label: "Pago", bg: "var(--pos-weak)", color: "var(--pos)", border: "var(--pos-weak)" },
    vencido: { label: "Vencido", bg: "var(--neg-weak)", color: "var(--neg)", border: "var(--neg-weak)" },
    agendado: { label: "Agendado", bg: "var(--brand-weak)", color: "var(--brand)", border: "var(--brand-weak)" },
};

// Mapeamento de categoria → cashflow vive em lib/billTaxSync.ts (CAT_TO_CASHFLOW),
// compartilhado com a sincronização do Fluxo de Caixa.

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
    import("@/lib/firebase");
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
    uid: string | null;
    onClose: () => void;
    onSave: (data: Omit<Bill, "id" | "userId" | "createdAt">) => Promise<void>;
}

function BillModal({ open, editing, uid, onClose, onSave }: BillModalProps) {
    const [title, setTitle] = useState("");
    const [rawAmt, setRawAmt] = useState("");
    const [dueDate, setDueDate] = useState(TODAY);
    const [category, setCategory] = useState("Outros");
    const [recurrence, setRecurrence] = useState<Recurrence>("unica");
    const [installments, setInstallments] = useState(2);
    const [notes, setNotes] = useState("");
    const [status, setStatus] = useState<BillStatus>("pendente");
    const [photos, setPhotos] = useState<string[]>([]);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
    const [partyName, setPartyName] = useState("");
    const [partyDoc, setPartyDoc] = useState("");
    const [tab, setTab] = useState<"conta" | "cadastro">("conta");
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");
    const [pinOpen, setPinOpen] = useState(false);
    const [pinErr, setPinErr] = useState("");

    useEffect(() => {
        if (!open) return;
        setTitle(editing?.title ?? "");
        setRawAmt(editing ? editing.amount.toFixed(2).replace(".", ",") : "");
        setDueDate(editing?.dueDate ?? TODAY);
        setCategory(editing?.category ?? "Outros");
        setRecurrence(editing?.recurrence === "numeral" ? "numeral" : "unica");
        setInstallments(editing?.installmentCount && editing.installmentCount >= 2 ? editing.installmentCount : 2);
        setNotes(editing?.notes ?? "");
        setStatus(editing?.status ?? "pendente");
        setPhotos(editing?.photos ?? []);
        setPaymentMethod((editing?.paymentMethod as PaymentMethod) ?? null);
        setPartyName(editing?.partyName ?? "");
        setPartyDoc(editing?.partyDoc ?? "");
        setTab("conta");
        setSaving(false);
        setErr("");
        setPinOpen(false);
        setPinErr("");
    }, [open]);

    // Série "numeral" nasce toda pendente — não se pré-quita um parcelamento.
    useEffect(() => {
        if (recurrence === "numeral") setStatus("pendente");
    }, [recurrence]);

    if (!open) return null;

    const amount = parseAmount(rawAmt);
    const isSeries = recurrence === "numeral";
    // "numeral" só na criação, ou ao editar uma parcela que já é de série.
    const numeralAllowed = !editing || !!editing.seriesId;
    const installmentsOk = !isSeries || (Number.isFinite(installments) && installments >= 2 && installments <= 60);
    const canSave =
        title.trim().length >= 2 && amount > 0 && dueDate !== "" && paymentMethod !== null && installmentsOk;

    async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingPhoto(true);
        try {
            const [{ getFirebase }, { ref, uploadBytes, getDownloadURL }] = await Promise.all([
                import("@/lib/firebase"),
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
        if (!uid) { setErr("Não autenticado"); return; }
        // Verifica se PIN está configurado
        const pinHash = await loadPinHash(uid);
        if (!pinHash) {
            setErr("Configure seu PIN de 4 dígitos na página de Perfil antes de continuar.");
            return;
        }
        // Abre modal de PIN
        setPinErr("");
        setPinOpen(true);
    }

    async function handlePinSuccess(pin: string) {
        if (!uid) return;
        const result = await verifyPin(uid, pin);
        if (result === "ok") {
            setPinOpen(false);
            setSaving(true); setErr("");
            try {
                await onSave({
                    title: title.trim(), amount, dueDate, category,
                    recurrence, notes: notes.trim(),
                    status: isSeries ? "pendente" : status,
                    photos,
                    paidAt: editing?.paidAt,
                    paymentMethod: paymentMethod ?? undefined,
                    paidPaymentMethod: editing?.paidPaymentMethod,
                    partyName: partyName.trim() || "",
                    partyDoc: partyDoc ? onlyDigits(partyDoc) : "",
                    // Só na criação de série nova; edição preserva os campos no doc.
                    installmentCount: isSeries && !editing ? installments : undefined,
                });
                onClose();
            } catch (e: any) {
                setErr(e?.message ?? "Erro ao salvar");
                setSaving(false);
            }
        } else if (result === "locked") {
            setPinOpen(false);
            setErr("PIN bloqueado por excesso de tentativas. Aguarde 5 minutos.");
        } else if (result === "wrong") {
            const { locked } = getPinLockStatus();
            if (locked) {
                setPinOpen(false);
                setErr("PIN bloqueado por excesso de tentativas. Aguarde 5 minutos.");
            } else {
                (window as any).__pinModalShake?.("PIN incorreto. Tente novamente.");
            }
        } else if (result === "no_pin") {
            setPinOpen(false);
            setErr("Configure seu PIN de 4 dígitos na página de Perfil antes de continuar.");
        }
    }

    return (
        <div className="fixed inset-0 z-[990] flex items-end sm:items-center justify-center"
            style={{ background: "var(--overlay)", backdropFilter: "blur(8px)" }}>
            <div className="w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl overflow-hidden"
                style={{ background: "var(--cf-card)", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}>

                {/* drag handle mobile */}
                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                    <div className="w-10 h-1.5 rounded-full" style={{ background: "var(--cf-border)" }} />
                </div>

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4">
                    <div>
                        <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>
                            {editing ? "Editar conta" : "Nova conta a pagar"}
                        </p>
                        <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--pos)" }}>
                            <Check size={11} /> Ao pagar, lança automaticamente no Fluxo de Caixa
                        </p>
                    </div>
                    <button onClick={() => !saving && onClose()}
                        className="p-1.5 rounded-lg cursor-pointer"
                        style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                        <X size={16} />
                    </button>
                </div>

                {/* Abas */}
                <div className="flex gap-1 px-5" style={{ borderBottom: "1px solid var(--cf-border)" }}>
                    {([["conta", editing ? "Conta" : "Nova conta"], ["cadastro", "Cadastro"]] as const).map(([t, label]) => (
                        <button key={t} onClick={() => setTab(t)} type="button"
                            className="px-3 py-2.5 text-xs font-bold cursor-pointer -mb-px"
                            style={tab === t
                                ? { color: "var(--brand)", borderBottom: "2px solid var(--brand)" }
                                : { color: "var(--cf-text2)", borderBottom: "2px solid transparent" }}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* Body */}
                <div className="px-5 pt-4 pb-6 space-y-4 overflow-y-auto" style={{ maxHeight: "82vh" }}>
                    {err && (
                        <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
                            style={{ background: "var(--neg-weak)", border: "1px solid var(--neg-weak)", color: "var(--neg)" }}>
                            <span>⚠</span> {err}
                        </div>
                    )}

                    {tab === "cadastro" ? (
                        <CadastroManager
                            uid={uid}
                            kind="fornecedor"
                            accent="var(--brand)"
                            onPick={c => {
                                setTitle(c.name);
                                setPartyName(c.name);
                                setPartyDoc(c.doc);
                                setTab("conta");
                            }}
                        />
                    ) : (
                    <>
                    {/* Título / fornecedor */}
                    <CadastroField
                        uid={uid}
                        kind="fornecedor"
                        accent="var(--brand)"
                        label="Título"
                        placeholder="Ex: Aluguel do escritório"
                        title={title}
                        partyDoc={partyDoc}
                        onChange={v => { setTitle(v.title); setPartyName(v.partyName ?? ""); setPartyDoc(v.partyDoc ?? ""); }}
                        onNewCadastro={() => setTab("cadastro")}
                    />

                    {/* Valor + Vencimento */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>
                                {isSeries ? "Valor por parcela (R$)" : "Valor (R$)"}
                            </label>
                            <input inputMode="decimal" value={rawAmt} onChange={e => setRawAmt(formatAmount(e.target.value))}
                                placeholder="0,00"
                                className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono cursor-text"
                                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>
                                {isSeries ? "1º vencimento" : "Vencimento"}
                            </label>
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
                        <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-xl" style={{ background: "var(--cf-input)" }}>
                            {([["unica", "Única"], ["numeral", "Numeral"]] as [Recurrence, string][]).map(([r, label]) => {
                                const disabled = r === "numeral" && !numeralAllowed;
                                return (
                                    <button key={r} type="button"
                                        onClick={() => !disabled && setRecurrence(r)}
                                        disabled={disabled}
                                        title={disabled ? "Parcelamento só na criação de uma conta nova" : undefined}
                                        className="py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                        style={recurrence === r
                                            ? { background: "var(--cf-card)", color: "var(--cf-text)", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", cursor: "pointer" }
                                            : { background: "transparent", color: "var(--cf-text2)", cursor: disabled ? "not-allowed" : "pointer" }}>
                                        {label}
                                    </button>
                                );
                            })}
                        </div>

                        {isSeries && (
                            <div className="pt-1 space-y-2">
                                <div className="flex items-center gap-3">
                                    <label className="text-xs font-semibold" style={{ color: "var(--cf-text2)" }}>
                                        Parcelas mensais
                                    </label>
                                    <input
                                        type="number" min={2} max={60} value={installments}
                                        onChange={e => setInstallments(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                                        disabled={!!editing}
                                        className="w-20 rounded-lg px-3 py-2 text-sm outline-none font-mono disabled:opacity-50"
                                        style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                                    {editing && (
                                        <span className="text-[11px]" style={{ color: "var(--cf-text3)" }}>
                                            (fixo após criar)
                                        </span>
                                    )}
                                </div>
                                {!installmentsOk ? (
                                    <p className="text-[11px]" style={{ color: "var(--neg)" }}>Informe de 2 a 60 parcelas.</p>
                                ) : amount > 0 ? (
                                    <p className="text-[11px]" style={{ color: "var(--cf-text3)" }}>
                                        {installments} parcelas de {toBRL(amount)} · total {toBRL(amount * installments)}
                                    </p>
                                ) : null}
                            </div>
                        )}
                    </div>

                    {/* Status */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Status inicial</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(["pendente", "pago", "agendado", "vencido"] as BillStatus[]).map(s => {
                                const meta = STATUS_META[s];
                                return (
                                    <button key={s} type="button" onClick={() => !isSeries && setStatus(s)}
                                        disabled={isSeries}
                                        className="py-2.5 rounded-xl text-xs font-bold border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                        style={status === s
                                            ? { background: meta.bg, borderColor: meta.border, color: meta.color, cursor: isSeries ? "not-allowed" : "pointer" }
                                            : { background: "transparent", borderColor: "var(--cf-border)", color: "var(--cf-text2)", cursor: isSeries ? "not-allowed" : "pointer" }}>
                                        {meta.label}
                                    </button>
                                );
                            })}
                        </div>
                        {isSeries && (
                            <p className="text-[11px]" style={{ color: "var(--cf-text3)" }}>
                                Toda série começa pendente. Baixe cada parcela ao pagá-la.
                            </p>
                        )}
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
                                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-[var(--sunken)]">
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

                    {/* Forma de pagamento prevista */}
                    <PaymentMethodSelector
                        value={paymentMethod}
                        onChange={setPaymentMethod}
                        label="Forma de pagamento prevista"
                        required
                    />

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
                            ? { background: "var(--brand)", color: "white" }
                            : { background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                        {saving
                            ? <><Loader2 size={15} className="animate-spin" /> Salvando…</>
                            : <><ShieldCheck size={15} /> {editing ? "Salvar alterações" : "Criar conta"}</>}
                    </button>
                    </>
                    )}
                </div>
            </div>

            {/* Modal de PIN para confirmar criação/edição */}
            <PinModal
                open={pinOpen}
                title={editing ? "Confirmar edição" : "Confirmar criação"}
                subtitle="Digite seu PIN de 4 dígitos para salvar"
                onClose={() => setPinOpen(false)}
                onSuccess={handlePinSuccess}
            />
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
            style={{ background: "var(--overlay)", backdropFilter: "blur(8px)" }}>
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
                                    ? { background: "var(--brand)", borderColor: "transparent", color: "white" }
                                    : { background: "var(--cf-input)", borderColor: "var(--cf-border)", color: "var(--cf-text2)" }}>
                                {d}d
                            </button>
                        ))}
                    </div>
                </div>

                {/* Preview do alerta */}
                <div className="rounded-xl px-4 py-3 mb-5 flex items-center gap-2.5"
                    style={{ background: "var(--warn-weak)", border: "1px solid var(--warn-weak)" }}>
                    <Bell size={15} style={{ color: "var(--warn)", flexShrink: 0 }} />
                    <p className="text-xs" style={{ color: "var(--warn)" }}>
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
                        style={{ background: "var(--brand)", color: "white" }}>
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

// ─── Modal de Baixa (Pagamento) ──────────────────────────────────────────────

function PayModal({ open, bill, uid, onClose, onConfirm }: {
    open: boolean;
    bill: Bill | null;
    uid: string | null;
    onClose: () => void;
    onConfirm: (paidAt: string, method: PaymentMethod) => Promise<void>;
}) {
    const [paidAt, setPaidAt] = useState(TODAY);
    const [method, setMethod] = useState<PaymentMethod | null>(null);
    const [pinOpen, setPinOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        if (!open || !bill) return;
        setPaidAt(TODAY);
        setMethod((bill.paymentMethod as PaymentMethod) ?? null);
        setPinOpen(false);
        setSaving(false);
        setErr("");
    }, [open, bill]);

    if (!open || !bill) return null;

    const canConfirm = method !== null && paidAt !== "";

    async function handleOpenPin() {
        if (!canConfirm || !uid) return;
        const pinHash = await loadPinHash(uid);
        if (!pinHash) {
            setErr("Configure seu PIN de 4 dígitos na página de Perfil antes de continuar.");
            return;
        }
        setErr("");
        setPinOpen(true);
    }

    async function handlePinSuccess(pin: string) {
        if (!uid) return;
        const result = await verifyPin(uid, pin);
        if (result === "ok") {
            setPinOpen(false);
            setSaving(true);
            try {
                await onConfirm(paidAt, method!);
                onClose();
            } catch (e: any) {
                setErr(e?.message ?? "Erro ao registrar pagamento");
                setSaving(false);
            }
        } else if (result === "locked") {
            setPinOpen(false);
            setErr("PIN bloqueado por excesso de tentativas. Aguarde 5 minutos.");
        } else if (result === "wrong") {
            const { locked } = getPinLockStatus();
            if (locked) {
                setPinOpen(false);
                setErr("PIN bloqueado por excesso de tentativas. Aguarde 5 minutos.");
            } else {
                (window as any).__pinModalShake?.("PIN incorreto. Tente novamente.");
            }
        } else if (result === "no_pin") {
            setPinOpen(false);
            setErr("Configure seu PIN de 4 dígitos na página de Perfil antes de continuar.");
        }
    }

    return (
        <>
        <div className="fixed inset-0 z-[990] flex items-end sm:items-center justify-center"
            style={{ background: "var(--overlay)", backdropFilter: "blur(8px)" }}>
            <div className="w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl overflow-hidden"
                style={{ background: "var(--cf-card)", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}>

                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                    <div className="w-10 h-1.5 rounded-full" style={{ background: "var(--cf-border)" }} />
                </div>

                <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>
                    <div>
                        <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>Registrar pagamento</p>
                        <p className="text-xs mt-1 font-medium truncate" style={{ color: "var(--cf-text2)" }}>{bill.title} · {toBRL(bill.amount)}</p>
                    </div>
                    <button onClick={() => !saving && onClose()} className="p-1.5 rounded-lg cursor-pointer"
                        style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                        <X size={16} />
                    </button>
                </div>

                <div className="px-5 pt-4 pb-6 space-y-4 overflow-y-auto" style={{ maxHeight: "80vh" }}>
                    {err && (
                        <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
                            style={{ background: "var(--neg-weak)", border: "1px solid var(--neg-weak)", color: "var(--neg)" }}>
                            <AlertTriangle size={13} />{err}
                        </div>
                    )}

                    {/* Data do pagamento */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text2)" }}>Data do pagamento</label>
                        <input type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)}
                            className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-pointer"
                            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                    </div>

                    {/* Forma de pagamento */}
                    <PaymentMethodSelector
                        value={method}
                        onChange={setMethod}
                        label="Forma de pagamento utilizada"
                        required
                    />

                    <button onClick={handleOpenPin} disabled={!canConfirm || saving}
                        className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${canConfirm && !saving ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                        style={canConfirm && !saving
                            ? { background: "var(--pos)", color: "white" }
                            : { background: "var(--cf-input)", color: "var(--cf-text2)" }}>
                        {saving
                            ? <><Loader2 size={15} className="animate-spin" /> Registrando…</>
                            : <><ShieldCheck size={15} /> Confirmar pagamento</>}
                    </button>
                </div>
            </div>
        </div>
        <PinModal
            open={pinOpen}
            title="Confirmar pagamento"
            subtitle="Digite seu PIN de 4 dígitos para confirmar a baixa"
            onClose={() => setPinOpen(false)}
            onSuccess={handlePinSuccess}
        />
        </>
    );
}

// ─── Bill Card ────────────────────────────────────────────────────────────────

function BillCard({ bill, alertDays, onEdit, onDelete, onOpenPayModal }: {
    bill: Bill & { _status: BillStatus };
    alertDays: number;
    onEdit: () => void;
    onDelete: () => void;
    onOpenPayModal: () => void;
}) {
    const [showPhotos, setShowPhotos] = useState(false);
    const days = daysUntil(bill.dueDate);
    const status: BillStatus = bill._status;
    const meta = STATUS_META[status];
    const catMeta = getCatMeta(bill.category);
    const CatIcon = catMeta.icon;
    const isUrgent = status !== ("pago" as const) && days >= 0 && days <= alertDays;
    const isOverdue = status === ("vencido" as const);

    return (
        <div className="cf-card overflow-hidden transition-all hover:shadow-md"
            style={{ borderColor: isOverdue ? "var(--neg-weak)" : isUrgent ? "var(--warn-weak)" : "var(--cf-border)" }}>
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
                                {bill.partyDoc && (
                                    <p className="text-xs font-mono truncate mt-0.5" style={{ color: "var(--cf-text3)" }}>
                                        {formatDoc(bill.partyDoc)}
                                    </p>
                                )}
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                                        style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                                        {meta.label}
                                    </span>
                                    {bill.seriesId && bill.installmentCount && (
                                        <span className="flex items-center gap-1 text-xs" style={{ color: "var(--cf-text3)" }}>
                                            <Repeat size={10} /> Parcela {bill.installmentIndex}/{bill.installmentCount}
                                        </span>
                                    )}
                                    {bill?.photos?.length > 0 && (
                                        <span onClick={() => setShowPhotos(true)}
                                            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full cursor-pointer transition-all hover:opacity-80"
                                            style={{ background: "var(--brand-weak)", color: "var(--brand)" }}>
                                            <ImageIcon size={10} /> {bill?.photos?.length} foto{bill?.photos?.length !== 1 ? "s" : ""}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span className="font-heading font-bold text-base shrink-0 mono"
                                style={{ color: isOverdue ? "var(--neg)" : "var(--cf-text)" }}>
                                {toBRL(bill.amount)}
                            </span>
                        </div>

                        {/* Vencimento */}
                        <div className="flex items-center gap-1.5 mt-2.5">
                            <CalendarClock size={13}
                                style={{ color: isOverdue ? "var(--neg)" : isUrgent ? "var(--warn)" : "var(--cf-text3)" }} />
                            <span className="text-xs font-medium"
                                style={{ color: isOverdue ? "var(--neg)" : isUrgent ? "var(--warn)" : "var(--cf-text2)" }}>
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
                                    style={{ background: "var(--warn-weak)", color: "var(--warn)" }}>!</span>
                            )}
                        </div>

                        {/* Badges de origem de pagamento */}
                        {(bill.paymentMethod || bill.paidPaymentMethod) && (
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                {bill.paidPaymentMethod ? (
                                    <>
                                        {bill.paymentMethod && bill.paymentMethod !== bill.paidPaymentMethod && (
                                            <PaymentMethodBadge method={bill.paymentMethod as PaymentMethod} prefix="Prev:" small />
                                        )}
                                        <PaymentMethodBadge method={bill.paidPaymentMethod as PaymentMethod} prefix="Pago:" small />
                                    </>
                                ) : bill.paymentMethod && (
                                    <PaymentMethodBadge method={bill.paymentMethod as PaymentMethod} prefix="Prev:" small />
                                )}
                            </div>
                        )}

                        {bill.notes && (
                            <p className="text-xs mt-1.5 truncate" style={{ color: "var(--cf-text3)" }}>📝 {bill.notes}</p>
                        )}
                    </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 mt-4 pt-3" style={{ borderTop: "1px solid var(--cf-border)" }}>
                    {status !== ("pago" as const) ? (
                        <button onClick={onOpenPayModal}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all"
                            style={{ background: "var(--pos)", color: "white" }}>
                            <CheckCircle2 size={13} />
                            Marcar como pago
                        </button>
                    ) : (
                        <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold"
                            style={{ background: "var(--pos-weak)", color: "var(--pos)" }}>
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

                <AuditTrail record={bill} settleLabel="Pago" />
            </div>
            <PhotoGalleryModal open={showPhotos} photos={bill?.photos ?? []} onClose={() => setShowPhotos(false)} />
        </div>
    );
}

// ─── Toast Stack ──────────────────────────────────────────────────────────────

function ToastStack({ toasts }: { toasts: ToastItem[] }) {
    if (toasts.length === 0) return null;
    const colors: Record<ToastItem["type"], string> = {
        ok: "var(--pos)",
        err: "var(--neg)",
        warn: "var(--warn)",
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
    // uid do login atual — usado para o PIN (pessoal) e para o selo de autoria,
    // separado de `uid`, que é o dono dos dados (pode ser outra conta).
    const [authUid, setAuthUid] = useState<string | null>(null);
    const [userName, setUserName] = useState("");
    const [userEmail, setUserEmail] = useState("");
    const [bills, setBills] = useState<Bill[]>([]);
    const [pageState, setPageState] = useState<"loading" | "ready" | "error" | "blocked">("loading");
    const [errMsg, setErrMsg] = useState("");

    const [modal, setModal] = useState(false);
    const [editing, setEditing] = useState<Bill | null>(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [deletePinOpen, setDeletePinOpen] = useState(false);
    const [payBill, setPayBill] = useState<Bill | null>(null);

    // ── Séries "numeral" (parcelas) ──
    // Edição: guardado quando uma parcela é salva, pra oferecer propagar.
    const [seriesEdit, setSeriesEdit] = useState<{ base: Bill; data: Omit<Bill, "id" | "userId" | "createdAt"> } | null>(null);
    const [seriesBusy, setSeriesBusy] = useState(false);
    // Exclusão: parcela alvo + escopo escolhido no diálogo.
    const [seriesDelete, setSeriesDelete] = useState<Bill | null>(null);
    const [deleteScope, setDeleteScope] = useState<SeriesScope>("one");

    const [alertDays, setAlertDays] = useState(5);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<"todos" | BillStatus>("todos");
    const [filterCategory, setFilterCategory] = useState("todas");
    // Mês em foco = seletor global da Navbar (usePeriod). A LISTA é filtrada
    // por mês de vencimento; os alertas de "vence em breve / vencidas" seguem
    // globais (ver header e KPIs).
    const { monthKey, label: periodLabel } = usePeriod();

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
                        import("@/lib/firebase"),
                        import("firebase/auth"),
                        import("firebase/firestore"),
                    ]);
                const { auth, db } = await getFirebase();
                authUnsub = onAuthStateChanged(auth, async u => {
                    if (!u) { window.location.href = "/login"; return; }

                    // Resolve de quem são os dados que este login deve ver:
                    // o próprio uid (dono) ou o do dono da conta (membro
                    // convidado) — ver lib/accountScope.ts. Membro sem
                    // "contasPagar" liberado nem chega a assinar a coleção
                    // abaixo.
                    const { resolveAccountScope, hasPermission } = await import("@/lib/accountScope");
                    const scope = await resolveAccountScope(db, u.uid);
                    if (!hasPermission(scope, "contasPagar")) { setPageState("blocked"); return; }
                    const ownerUid = scope.ownerUid;

                    setUid(ownerUid);
                    setAuthUid(u.uid);
                    setUserName(u.displayName ?? u.email ?? "Usuário");
                    setUserEmail(u.email ?? "");
                    snapUnsub?.();
                    snapUnsub = onSnapshot(
                        query(collection(db, "users", ownerUid, "bills"), orderBy("createdAt", "desc")),
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
        const { getFirebase } = await import("@/lib/firebase");
        const { signOut } = await import("firebase/auth");
        const { auth } = await getFirebase();
        await signOut(auth);
        window.location.href = "/login";
    }

    // ── Salvar conta ───────────────────────────────────────────────────────────
    async function handleSave(data: Omit<Bill, "id" | "userId" | "createdAt">) {
        if (!uid) throw new Error("Não autenticado");
        const [{ getFirebase }, { doc, updateDoc, collection, addDoc, writeBatch }] = await Promise.all([
            import("@/lib/firebase"),
            import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();
        const actor = { uid: authUid ?? uid, name: userName };

        // ── Série "numeral" nova: N documentos, um por mês ──────────────────────
        if (!editing && data.recurrence === "numeral") {
            const n = Math.min(60, Math.max(2, Math.round(data.installmentCount || 2)));
            const seriesId = (crypto as Crypto).randomUUID();
            const batch = writeBatch(db);
            for (let i = 0; i < n; i++) {
                const ref = doc(collection(db, "users", uid, "bills"));
                const parcela = Object.fromEntries(
                    Object.entries({
                        ...data,
                        userId: uid,
                        recurrence: "numeral",
                        status: "pendente",
                        seriesId,
                        installmentIndex: i + 1,
                        installmentCount: n,
                        dueDate: addMonthsClamped(data.dueDate, i),
                        paidAt: undefined,
                        paidPaymentMethod: undefined,
                        createdAt: Date.now(),
                        ...stampCreate(actor),
                    }).filter(([, v]) => v !== undefined)
                );
                batch.set(ref, parcela);
            }
            await batch.commit();
            const last = addMonthsClamped(data.dueDate, n - 1);
            showToast(`${n} parcelas criadas (${monthLabel(data.dueDate)} → ${monthLabel(last)})`);
            return;
        }

        // ── Conta única (ou edição de uma parcela) ─────────────────────────────
        const clean = Object.fromEntries(
            Object.entries({ ...data, userId: uid }).filter(([, v]) => v !== undefined)
        );
        // Não deixa o installmentCount do form virar campo solto num doc único.
        if (data.recurrence !== "numeral") delete (clean as Record<string, unknown>).installmentCount;

        let billId: string;
        if (editing) {
            await updateDoc(doc(db, "users", uid, "bills", editing.id), { ...clean, ...stampUpdate(actor) } as any);
            billId = editing.id;
            showToast("Conta atualizada!");
        } else {
            const ref = await addDoc(collection(db, "users", uid, "bills"), { ...clean, createdAt: Date.now(), ...stampCreate(actor) });
            billId = ref.id;
            showToast("Conta criada!");
        }

        // Reflete no Fluxo de Caixa: com status "pago" cria/atualiza a saída
        // espelho; com qualquer outro status, remove se existir.
        await syncBillCashflow(db, uid, {
            id: billId,
            title: data.title,
            amount: data.amount,
            dueDate: data.dueDate,
            category: data.category,
            status: data.status,
            recurrence: data.recurrence,
            installmentIndex: editing?.installmentIndex,
            installmentCount: editing?.installmentCount,
            paidAt: data.paidAt,
            paidPaymentMethod: data.paidPaymentMethod as string | undefined,
        });

        // Editou uma parcela de série → oferece propagar pras próximas não pagas.
        if (editing?.seriesId) {
            setSeriesEdit({ base: editing, data });
        }
    }

    // ── Propaga a edição de uma parcela pras próximas não pagas da série ───────
    async function applySeriesEdit(scope: SeriesScope) {
        if (!seriesEdit || !uid) { setSeriesEdit(null); return; }
        if (scope === "one") { setSeriesEdit(null); return; }
        setSeriesBusy(true);
        try {
            const { base, data } = seriesEdit;
            const [{ getFirebase }, { collection, query, where, getDocs, writeBatch }] = await Promise.all([
                import("@/lib/firebase"),
                import("firebase/firestore"),
            ]);
            const { db } = await getFirebase();
            const snap = await getDocs(
                query(collection(db, "users", uid, "bills"), where("seriesId", "==", base.seriesId))
            );
            const actor = { uid: authUid ?? uid, name: userName };
            const batch = writeBatch(db);
            let count = 0;
            snap.docs.forEach((d) => {
                const b = d.data() as Bill;
                if ((b.installmentIndex ?? 0) <= (base.installmentIndex ?? 0)) return;
                if (b.status === "pago") return;
                batch.update(d.ref, {
                    title: data.title,
                    amount: data.amount,
                    category: data.category,
                    notes: data.notes,
                    paymentMethod: data.paymentMethod ?? null,
                    ...stampUpdate(actor),
                });
                count++;
            });
            if (count) await batch.commit();
            showToast(count ? `${count} parcela(s) futura(s) atualizada(s)` : "Nenhuma parcela futura pendente");
        } catch (e: any) {
            showToast(e?.message ?? "Erro ao atualizar a série", "err");
        } finally {
            setSeriesBusy(false);
            setSeriesEdit(null);
        }
    }

    // ── Marcar como pago + lançar no cashflow ──────────────────────────────────
    async function handlePay(bill: Bill, paidAt: string, method: PaymentMethod) {
        if (!uid) return;
        const [{ getFirebase }, { doc, updateDoc }] = await Promise.all([
            import("@/lib/firebase"),
            import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();

        await updateDoc(doc(db, "users", uid, "bills", bill.id), {
            status: "pago", paidAt, paidPaymentMethod: method,
            ...stampSettle({ uid: authUid ?? uid, name: userName }),
        });

        await syncBillCashflow(db, uid, {
            ...bill,
            status: "pago",
            paidAt,
            paidPaymentMethod: method,
        });

        showToast("Pago! Lançado no Fluxo de Caixa ✓");
    }

    // ── Atualizar categoria e sincronizar cashflow se a conta já está no fluxo ──
    async function handleUpdateCategory(billId: string, oldCategory: string, newCategory: string, bill: Bill) {
        if (!uid || oldCategory === newCategory) return;
        
        const [{ getFirebase }, { doc, updateDoc }] = await Promise.all([
            import("@/lib/firebase"),
            import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();

        // Atualiza a categoria na conta
        await updateDoc(doc(db, "users", uid, "bills", billId), { category: newCategory });

        // Reflete a nova categoria no Fluxo de Caixa (só age se a conta está paga).
        await syncBillCashflow(db, uid, { ...bill, category: newCategory });
        showToast(bill.status === "pago"
            ? "Categoria atualizada em contas e fluxo de caixa"
            : "Categoria atualizada!");
    }

    // ── Excluir conta ──────────────────────────────────────────────────────────
    // Clique na lixeira: parcela de série abre o diálogo de escopo; o resto vai
    // direto pro modal de confirmação.
    function onDeleteRequested(bill: Bill) {
        if (bill.seriesId) setSeriesDelete(bill);
        else { setDeleteScope("one"); setConfirmId(bill.id); }
    }

    async function startSeriesDelete(bill: Bill, scope: SeriesScope) {
        if (!uid) return;
        const pinHash = await loadPinHash(authUid ?? uid);
        if (!pinHash) {
            showToast("Configure seu PIN de 4 dígitos na página de Perfil antes de continuar.", "err");
            return;
        }
        setDeleteScope(scope);
        setConfirmId(bill.id);
        setSeriesDelete(null);
        setDeletePinOpen(true);
    }

    async function handleDeleteClick() {
        if (!confirmId || !uid || deleting) return;
        const pinHash = await loadPinHash(authUid ?? uid);
        if (!pinHash) {
            showToast("Configure seu PIN de 4 dígitos na página de Perfil antes de continuar.", "err");
            return;
        }
        setDeletePinOpen(true);
    }

    async function handleDeleteConfirm(pin: string) {
        if (!confirmId || !uid) return;
        const result = await verifyPin(authUid ?? uid, pin);
        if (result === "ok") {
            setDeletePinOpen(false);
            setDeleting(true);
            try {
                const [{ getFirebase }, { doc, deleteDoc, collection, query, where, getDocs, writeBatch }] = await Promise.all([
                    import("@/lib/firebase"),
                    import("firebase/firestore"),
                ]);
                const { db } = await getFirebase();

                const target = bills.find((b) => b.id === confirmId);

                // ── Série: "esta e as próximas não pagas" ──
                if (deleteScope === "forward" && target?.seriesId) {
                    const snap = await getDocs(
                        query(collection(db, "users", uid, "bills"), where("seriesId", "==", target.seriesId))
                    );
                    const alvo = snap.docs.filter((d) => {
                        const b = d.data() as Bill;
                        return (b.installmentIndex ?? 0) >= (target.installmentIndex ?? 0) && b.status !== "pago";
                    });
                    const batch = writeBatch(db);
                    alvo.forEach((d) => batch.delete(d.ref));
                    await batch.commit();
                    await Promise.all(
                        alvo.map((d) =>
                            syncBillCashflow(db, uid, { id: d.id, title: "", amount: 0, dueDate: "", category: "", status: "removido" })
                        )
                    );
                    showToast(`${alvo.length} parcela(s) removida(s).`);
                } else {
                    // ── Conta única ou "só esta parcela" ──
                    await syncBillCashflow(db, uid, { id: confirmId, title: "", amount: 0, dueDate: "", category: "", status: "removido" });
                    await deleteDoc(doc(db, "users", uid, "bills", confirmId));
                    showToast("Conta removida.");
                }

                setConfirmId(null);
                setDeleteScope("one");
            } catch (e: any) {
                showToast(e.message, "err");
            } finally {
                setDeleting(false);
            }
        } else if (result === "locked") {
            setDeletePinOpen(false);
            showToast("PIN bloqueado por excesso de tentativas. Aguarde 5 minutos.", "err");
        } else if (result === "wrong") {
            const { locked } = getPinLockStatus();
            if (locked) {
                setDeletePinOpen(false);
                showToast("PIN bloqueado por excesso de tentativas. Aguarde 5 minutos.", "err");
            } else {
                (window as any).__pinModalShake?.("PIN incorreto. Tente novamente.");
            }
        } else if (result === "no_pin") {
            setDeletePinOpen(false);
            showToast("Configure seu PIN de 4 dígitos na página de Perfil antes de continuar.", "err");
        }
    }

    // ── Dados derivados ────────────────────────────────────────────────────────

    const enriched = useMemo((): (Bill & { _status: BillStatus })[] =>
        bills.map(b => ({ ...b, _status: computeStatus(b) })),
        [bills]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return enriched.filter(b => {
            if ((b.dueDate ?? "").slice(0, 7) !== monthKey) return false;
            if (filterStatus !== "todos" && b._status !== filterStatus) return false;
            if (filterCategory !== "todas" && b.category !== filterCategory) return false;
            if (q && !b.title.toLowerCase().includes(q) && !b.notes.toLowerCase().includes(q)
                && !(b.partyName ?? "").toLowerCase().includes(q)) return false;
            return true;
        });
    }, [enriched, filterStatus, filterCategory, search, monthKey]);

    // Agrupa em seções ordenadas por prioridade
    const sections = useMemo(() => [
        { key: "vencido", label: "Vencidas", color: "var(--neg)", bills: filtered.filter(b => b._status === ("vencido" as const)) },
        { key: "pendente", label: "Pendentes", color: "var(--warn)", bills: filtered.filter(b => b._status === ("pendente" as const)) },
        { key: "agendado", label: "Agendadas", color: "var(--brand)", bills: filtered.filter(b => b._status === ("agendado" as const)) },
        { key: "pago", label: "Pagas", color: "var(--pos)", bills: filtered.filter(b => b._status === ("pago" as const)) },
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

    if (pageState === "blocked") return <AccessDenied category="Contas a Pagar" />;

    if (pageState === "loading") return <PageLoader background="var(--cf-bg)" />;

    if (pageState === "error") return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: "var(--cf-bg)" }}>
            <p className="font-heading text-lg font-bold" style={{ color: "var(--neg)" }}>Erro ao conectar</p>
            <p className="text-xs font-mono rounded-xl p-4 max-w-sm break-all" style={{ color: "var(--neg)", background: "var(--neg-weak)" }}>{errMsg}</p>
            <button onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
                style={{ background: "var(--brand)", color: "white" }}>
                Tentar novamente
            </button>
        </div>
    );

    return (
        <div className="flex flex-col min-h-screen" style={{ background: "var(--cf-bg)" }}>

            <Navbar user={{ displayName: userName, email: userEmail }} activePath="/contas-pagar" onLogout={handleLogout} />

            {/* Modais */}
            <BillModal
                open={modal} editing={editing} uid={authUid}
                onClose={() => { setModal(false); setEditing(null); }}
                onSave={handleSave}
            />
            <AlertSettingsModal
                open={settingsOpen} alertDays={alertDays}
                onClose={() => setSettingsOpen(false)}
                onSave={saveAlertDays}
            />
            <PayModal
                open={!!payBill} bill={payBill} uid={authUid}
                onClose={() => setPayBill(null)}
                onConfirm={(paidAt, method) => handlePay(payBill!, paidAt, method)}
            />

            {/* Escopo de exclusão de série (parcela) */}
            <SeriesScopeDialog
                open={!!seriesDelete}
                title="Excluir parcela"
                message={
                    seriesDelete
                        ? `"${seriesDelete.title}" — parcela ${seriesDelete.installmentIndex}/${seriesDelete.installmentCount}. Parcelas já pagas nunca são removidas.`
                        : ""
                }
                actionLabel="Excluir"
                onPick={(scope) => seriesDelete && startSeriesDelete(seriesDelete, scope)}
                onCancel={() => setSeriesDelete(null)}
            />

            {/* Escopo de edição de série (parcela) */}
            <SeriesScopeDialog
                open={!!seriesEdit}
                title="Aplicar em quais parcelas?"
                message={
                    seriesEdit
                        ? `Você editou a parcela ${seriesEdit.base.installmentIndex}/${seriesEdit.base.installmentCount} de "${seriesEdit.base.title}".`
                        : ""
                }
                actionLabel="Salvando"
                loading={seriesBusy}
                onPick={applySeriesEdit}
                onCancel={() => setSeriesEdit(null)}
            />

            {/* Confirm delete (conta única — série já confirmou no diálogo de escopo) */}
            {confirmId && !deletePinOpen && (
                <div className="fixed inset-0 z-[990] flex items-center justify-center p-4"
                    style={{ background: "var(--overlay)", backdropFilter: "blur(8px)" }}>
                    <div className="cf-card p-6 w-full max-w-xs text-center"
                        style={{ animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}>
                        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                            style={{ background: "var(--neg-weak)" }}>
                            <Trash2 size={20} style={{ color: "var(--neg)" }} />
                        </div>
                        <p className="font-heading text-base font-bold mb-1" style={{ color: "var(--cf-text)" }}>
                            Excluir conta?
                        </p>
                        <p className="text-xs mb-5" style={{ color: "var(--cf-text2)" }}>
                            Esta ação não pode ser desfeita. Será solicitado o seu PIN.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setConfirmId(null)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
                                style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text2)" }}>
                                Cancelar
                            </button>
                            <button onClick={handleDeleteClick} disabled={deleting}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60"
                                style={{ background: "var(--neg)", color: "white" }}>
                                {deleting ? <Loader2 size={14} className="animate-spin" /> : <><Trash2 size={14} /> Excluir</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <PinModal
                open={deletePinOpen}
                title="Confirmar exclusão"
                subtitle="Digite seu PIN de 4 dígitos para excluir"
                onClose={() => { setDeletePinOpen(false); setConfirmId(null); setDeleteScope("one"); }}
                onSuccess={handleDeleteConfirm}
            />

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
                                ? <span className="flex items-center gap-1 font-semibold animate-pulse" style={{ color: "var(--warn)" }}>
                                    <AlertTriangle size={12} />
                                    {kpis.alert} vence{kpis.alert !== 1 ? "m" : ""} nos próximos {alertDays} dias
                                </span>
                                : kpis.totalOverdue > 0
                                    ? <span className="flex items-center gap-1 font-semibold" style={{ color: "var(--neg)" }}>
                                        <AlertTriangle size={12} />
                                        {kpis.totalOverdue} conta{kpis.totalOverdue !== 1 ? "s" : ""} vencida{kpis.totalOverdue !== 1 ? "s" : ""}
                                    </span>
                                    : <span style={{ color: "var(--pos)" }}>✓ Tudo em dia!</span>
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
                                style={{ background: "var(--brand)", color: "white" }}>
                                {alertDays}
                            </span>
                        </button>
                        <button onClick={() => { setEditing(null); setModal(true); }}
                            className="hidden sm:flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer"
                            style={{ background: "var(--brand)", color: "white" }}>
                            <Plus size={14} /> Nova conta
                        </button>
                    </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    {[
                        { label: "A pagar", val: toBRL(kpis.aPagar), color: "var(--brand)", bg: "var(--brand-weak)", sub: `${kpis.totalNotPaid} conta${kpis.totalNotPaid !== 1 ? "s" : ""}` },
                        { label: "Vencidas", val: toBRL(kpis.vencido), color: "var(--neg)", bg: "var(--neg-weak)", sub: `${kpis.totalOverdue} conta${kpis.totalOverdue !== 1 ? "s" : ""}` },
                        { label: "Pagas", val: toBRL(kpis.pago), color: "var(--pos)", bg: "var(--pos-weak)", sub: `${kpis.totalPaid} conta${kpis.totalPaid !== 1 ? "s" : ""}` },
                        { label: `Alerta (${alertDays}d)`, val: String(kpis.alert), color: "var(--warn)", bg: "var(--warn-weak)", sub: "vence em breve" },
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
                            <span className="text-xs font-semibold px-2 py-1 rounded-full shrink-0" style={{ background: "var(--cf-input)", color: "var(--cf-text2)" }}
                                title="Vencimentos deste mês — troque o mês no seletor da Navbar">
                                {periodLabel}
                            </span>
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
                                : `Nada em ${periodLabel}`}
                        </p>
                        <p className="text-xs max-w-xs" style={{ color: "var(--cf-text2)" }}>
                            {search || filterStatus !== "todos" || filterCategory !== "todas"
                                ? "Ajuste os filtros para ver outras contas."
                                : "Nenhuma conta vence neste mês. Troque o mês no seletor da Navbar ou adicione uma conta."}
                        </p>
                        {!search && filterStatus === "todos" && filterCategory === "todas" && (
                            <button onClick={() => { setEditing(null); setModal(true); }}
                                className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl cursor-pointer mt-2"
                                style={{ background: "var(--brand)", color: "white" }}>
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
                                            onDelete={() => onDeleteRequested(bill)}
                                            onOpenPayModal={() => setPayBill(bill)}
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
                    background: "var(--brand)",
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