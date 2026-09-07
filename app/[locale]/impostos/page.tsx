"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo, useCallback, useRef, useId } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
    Plus, X, Check, Trash2, Edit3, AlertTriangle,
    Calendar, Loader2, Search, Filter,
    CheckCircle2, DollarSign, Percent, TrendingUp,
    FileText, Clock, Building2, BarChart3, Download,
    ChevronLeft, ChevronRight, type LucideIcon,
    AlertCircle, Info, Eye, EyeOff, Zap, Target,
    Home, Car, Shield, Briefcase, Package, HelpCircle, Globe, ShieldCheck,
} from "lucide-react";
import Navbar from "@/app/components/Navbar";
import AccessDenied from "@/app/components/AccessDenied";
import { PageLoader } from "@/app/components/ui";
import PinModal from "@/app/components/PinModal";
import { loadPinHash, verifyPin, getPinLockStatus } from "@/app/hooks/usePin";
import { usePeriod } from "@/app/hooks/usePeriod";
import PaymentMethodSelector, { PaymentMethodBadge } from "@/app/components/PaymentMethodSelector";
import type { PaymentMethod } from "@/app/types/payment";
import { syncTaxCashflow } from "@/lib/billTaxSync";
import { stampCreate, stampUpdate, stampSettle } from "@/lib/audit";
import { AuditTrail } from "@/app/components/AuditTrail";
import { formatMoney } from "@/lib/format";

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TaxStatus = "nao_pago" | "pago" | "atraso" | "agendado";
type TaxFrequency = "mensal" | "trimestral" | "semestral" | "anual";
type TaxSphere = "federal" | "estadual" | "municipal" | "outro";

type TaxType =
    | "simples_nacional" | "irpf" | "irpj" | "pis" | "cofins" | "csll" | "ipi" | "iof" | "itr" | "inss" | "fgts" // Federais
    | "icms" | "ipva" | "itcmd" // Estaduais
    | "iss" | "iptu" | "itbi" // Municipais
    | "outro";

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
    paymentMethod?: string;
    paidPaymentMethod?: string;
    createdAt: number;
    userId: string;
    description?: string;
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

// `id` é o VALOR gravado no Firestore (`tax.type`), casado por string em
// TAX_TYPE_TO_CATEGORY e nos filtros — NÃO traduzir. `label`/`description`
// abaixo são só fallback; a exibição usa impostos.taxTypes.<id> /
// impostos.taxTypeDesc.<id>. `esfera` é lógica de agrupamento, não texto.
interface TaxTypeMeta {
    id: TaxType;
    icon: LucideIcon;
    color: string;
    esfera: TaxSphere;
}

const TAX_TYPES: TaxTypeMeta[] = [
    // Federais
    { id: "simples_nacional", icon: Zap, color: "var(--cat-1)", esfera: "federal" },
    { id: "irpf", icon: DollarSign, color: "var(--cat-2)", esfera: "federal" },
    { id: "irpj", icon: Building2, color: "var(--brand)", esfera: "federal" },
    { id: "pis", icon: Percent, color: "var(--cat-3)", esfera: "federal" },
    { id: "cofins", icon: BarChart3, color: "var(--cat-4)", esfera: "federal" },
    { id: "csll", icon: TrendingUp, color: "var(--cat-5)", esfera: "federal" },
    { id: "ipi", icon: Package, color: "var(--cat-6)", esfera: "federal" },
    { id: "iof", icon: DollarSign, color: "var(--cat-7)", esfera: "federal" },
    { id: "itr", icon: Globe, color: "var(--cat-8)", esfera: "federal" },
    { id: "inss", icon: Shield, color: "var(--cat-1)", esfera: "federal" },
    { id: "fgts", icon: Briefcase, color: "var(--cat-2)", esfera: "federal" },
    // Estaduais
    { id: "icms", icon: TrendingUp, color: "var(--cat-3)", esfera: "estadual" },
    { id: "ipva", icon: Car, color: "var(--cat-4)", esfera: "estadual" },
    { id: "itcmd", icon: FileText, color: "var(--cat-5)", esfera: "estadual" },
    // Municipais
    { id: "iss", icon: FileText, color: "var(--pos)", esfera: "municipal" },
    { id: "iptu", icon: Home, color: "var(--pos)", esfera: "municipal" },
    { id: "itbi", icon: Building2, color: "var(--cat-6)", esfera: "municipal" },
    // Outros
    { id: "outro", icon: HelpCircle, color: "var(--cat-7)", esfera: "outro" },
];

// Só tokens de cor/ícone por status — o rótulo vem de impostos.status.<key>.
const STATUS_META: Record<TaxStatus, { bg: string; color: string; border: string; icon: LucideIcon }> = {
    nao_pago: { bg: "var(--warn-weak)", color: "var(--warn)", border: "var(--warn-weak)", icon: Clock },
    pago: { bg: "var(--pos-weak)", color: "var(--pos)", border: "var(--pos-weak)", icon: Check },
    atraso: { bg: "var(--neg-weak)", color: "var(--neg)", border: "var(--neg-weak)", icon: AlertTriangle },
    agendado: { bg: "var(--brand-weak)", color: "var(--brand)", border: "var(--brand-weak)", icon: Calendar },
};

// Mapeamento de tipo de imposto → categoria do cashflow (valor gravado — não traduzir).
const TAX_TYPE_TO_CATEGORY: Record<TaxType, string> = {
    simples_nacional: "Impostos", irpf: "Impostos", irpj: "Impostos", pis: "Impostos",
    cofins: "Impostos", csll: "Impostos", ipi: "Impostos", iof: "Impostos", itr: "Impostos",
    inss: "Impostos", fgts: "Impostos", icms: "Impostos", ipva: "Impostos", itcmd: "Impostos",
    iss: "Impostos", iptu: "Impostos", itbi: "Impostos", outro: "Impostos",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toBRL = (n: number, locale: string) => formatMoney(n, locale);

const labelDate = (d: string, locale: string) =>
    new Date(d + "T12:00:00")
        .toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })
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

// ─── Modal de imposto ──────────────────────────────────────────────────────────

interface TaxModalProps {
    open: boolean;
    editing: Tax | null;
    uid: string | null;
    onClose: () => void;
    onSave: (data: Omit<Tax, "id" | "userId" | "createdAt">) => Promise<void>;
}

function TaxModal({ open, editing, uid, onClose, onSave }: TaxModalProps) {
    const t = useTranslations("impostos.modal");
    const tType = useTranslations("impostos.taxTypes");
    const tDesc = useTranslations("impostos.taxTypeDesc");
    const tFreq = useTranslations("impostos.frequency");
    const tStatus = useTranslations("impostos.status");
    const tSphere = useTranslations("impostos.spheres");
    const tPin = useTranslations("common.pin");
    const [name, setName] = useState("");
    const [type, setType] = useState<TaxType>("simples_nacional");
    const [activeSphere, setActiveSphere] = useState<TaxSphere>("federal");
    const [rawAmt, setRawAmt] = useState("");
    const [estimatedRawAmt, setEstimatedRawAmt] = useState("");
    const [dueDate, setDueDate] = useState(TODAY);
    const [frequency, setFrequency] = useState<TaxFrequency>("anual");
    const [notes, setNotes] = useState("");
    const [status, setStatus] = useState<TaxStatus>("nao_pago");
    const [attachments, setAttachments] = useState<string[]>([]);
    const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
    const [pinOpen, setPinOpen] = useState(false);
    const [uploadingFile, setUploadingFile] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");
    const nameId = useId();
    const amtId = useId();
    const estimatedAmtId = useId();
    const dueDateId = useId();
    const taxTitleId = useId();
    const taxDialogRef = useRef<HTMLDivElement>(null);
    const taxPreviouslyFocused = useRef<HTMLElement | null>(null);
    const taxPrevOpen = useRef(open);
    // Captura quem tinha foco ANTES de abrir durante a própria renderização
    // (não num efeito) — o autoFocus nativo do campo "Nome/Descrição"
    // dispara antes de qualquer useEffect deste componente rodar.
    if (open && !taxPrevOpen.current) {
        taxPreviouslyFocused.current = document.activeElement as HTMLElement | null;
    }
    taxPrevOpen.current = open;
    const frequencyId = useId();
    const notesId = useId();

    useEffect(() => {
        if (!open) return;
        setName(editing?.name ?? "");
        const initialType = editing?.type ?? "simples_nacional";
        setType(initialType);
        const meta = getTaxMeta(initialType);
        setActiveSphere(meta?.esfera ?? "federal");
        setRawAmt(editing ? editing.amount.toFixed(2).replace(".", ",") : "");
        setEstimatedRawAmt(editing && editing.estimatedAmount ? editing.estimatedAmount.toFixed(2).replace(".", ",") : "");
        setDueDate(editing?.dueDate ?? TODAY);
        setFrequency(editing?.frequency ?? "anual");
        setNotes(editing?.notes ?? "");
        setStatus(editing?.status ?? "nao_pago");
        setAttachments(editing?.attachments ?? []);
        setPaymentMethod((editing?.paymentMethod as PaymentMethod) ?? null);
        setPinOpen(false);
        setSaving(false);
        setErr("");
    }, [open, editing]);

    // Esc fecha e devolve o foco; Tab fica preso no modal enquanto aberto.
    useEffect(() => {
        if (!open) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (!saving) onClose();
                return;
            }
            if (e.key !== "Tab") return;
            const node = taxDialogRef.current;
            if (!node) return;
            const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
                (el) => el.offsetParent !== null
            );
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("keydown", onKeyDown);
            taxPreviouslyFocused.current?.focus?.();
        };
    }, [open, onClose, saving]);

    if (!open) return null;

    const amount = parseAmount(rawAmt);
    const estimatedAmount = parseAmount(estimatedRawAmt);
    const canSave = name.trim().length >= 2 && amount > 0 && dueDate !== "" && paymentMethod !== null;

    async function handleOpenPin() {
        if (!canSave || saving || !uid) return;
        const pinHash = await loadPinHash(uid);
        if (!pinHash) {
            setErr(tPin("notConfigured"));
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
            submit();
        } else if (result === "locked") {
            setPinOpen(false);
            setErr(tPin("lockedRetry"));
        } else if (result === "wrong") {
            const { locked } = getPinLockStatus();
            if (locked) {
                setPinOpen(false);
                setErr(tPin("lockedRetry"));
            } else {
                (window as any).__pinModalShake?.(tPin("wrong"));
            }
        } else if (result === "no_pin") {
            setPinOpen(false);
            setErr(tPin("notConfigured"));
        }
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingFile(true);
        try {
            const [{ getFirebase }, { ref, uploadBytes, getDownloadURL }] = await Promise.all([
                import("@/lib/firebase"),
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
            setErr(t("uploadError", { message: e.message }));
        } finally {
            setUploadingFile(false);
        }
    }

    function removeAttachment(idx: number) {
        setAttachments(prev => prev.filter((_, i) => i !== idx));
    }

    async function submit() {
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
                paymentMethod: paymentMethod ?? undefined,
                paidAt: editing?.paidAt,
                paidPaymentMethod: editing?.paidPaymentMethod,
            });
            onClose();
        } catch (e: any) {
            setErr(e?.message ?? t("saveError"));
            setSaving(false);
        }
    }

    const typeMeta = getTaxMeta(type);
    const TypeIcon = typeMeta.icon;

    return (
        <div className="fixed inset-0 z-990 flex items-end sm:items-center justify-center"
            style={{ background: "rgba(13,17,23,0.6)", backdropFilter: "blur(8px)" }}>
            <div
                ref={taxDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={taxTitleId}
                tabIndex={-1}
                className="w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl overflow-hidden"
                style={{ background: "var(--cf-card)", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}>

                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                    <div className="w-10 h-1.5 rounded-full" style={{ background: "var(--cf-border)" }} />
                </div>

                <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>
                    <div className="flex items-center gap-2.5">
                        {editing && <TypeIcon size={16} style={{ color: typeMeta.color }} />}
                        <div>
                            <p id={taxTitleId} className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>
                                {editing ? t("editTitle") : t("newTitle")}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-2)" }}>
                                {t("subtitle")}
                            </p>
                        </div>
                    </div>
                    <button onClick={() => !saving && onClose()}
                        aria-label={tPin("close")}
                        className="p-1.5 rounded-lg cursor-pointer"
                        style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
                        <X size={16} />
                    </button>
                </div>

                <div className="px-5 pt-4 pb-6 space-y-4 overflow-y-auto" style={{ maxHeight: "82vh" }}>
                    {err && (
                        <div className="rounded-xl px-4 py-3 text-xs flex items-start gap-2"
                            style={{ background: "var(--neg-weak)", border: "1px solid var(--neg-weak)", color: "var(--neg)" }}>
                            <span>⚠</span> {err}
                        </div>
                    )}

                    {/* Nome */}
                    <div className="space-y-2">
                        <label htmlFor={nameId} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{t("name")}</label>
                        <input id={nameId} value={name} onChange={e => setName(e.target.value)}
                            placeholder={t("namePlaceholder")}
                            // Primeiro campo do modal — focar automaticamente ao abrir
                            // é o padrão esperado ao abrir um formulário de criação.
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                            className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-text"
                            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                    </div>

                    {/* Tipo de imposto */}
                    <fieldset className="space-y-2.5 border-0 p-0 m-0 min-w-0">
                        <legend className="text-xs font-semibold uppercase tracking-wider p-0" style={{ color: "var(--cf-text-2)" }}>{t("taxType")}</legend>

                        {/* Abas por Esfera Tributária */}
                        <div className="flex gap-1 p-1 rounded-xl" style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)" }}>
                            {(["federal", "estadual", "municipal", "outro"] as const).map(s => {
                                const active = activeSphere === s;
                                return (
                                    <button key={s} type="button" onClick={() => setActiveSphere(s)}
                                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold cursor-pointer text-center transition-all border-none"
                                        style={active
                                            ? { background: "var(--cf-card)", color: "var(--cf-text)", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }
                                            : { color: "var(--cf-text-2)", background: "transparent" }}>
                                        {tSphere(s)}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Grid de Seleção de Tipo de Imposto */}
                        <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1">
                            {TAX_TYPES.filter(tt => tt.esfera === activeSphere).map(tt => {
                                const sel = type === tt.id;
                                const TtIcon = tt.icon;
                                return (
                                    <button key={tt.id} type="button" onClick={() => setType(tt.id)}
                                        className="flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl text-xs font-semibold border-2 cursor-pointer transition-all text-left w-full"
                                        style={sel
                                            ? { borderColor: tt.color, background: tt.color + "18", color: tt.color }
                                            : { borderColor: "var(--cf-border)", background: "transparent", color: "var(--cf-text-2)" }}>
                                        <span className="flex items-center gap-1 font-bold">
                                            <TtIcon size={12} /> {tType(tt.id)}
                                        </span>
                                        <span className="text-[9px] opacity-80 font-normal leading-tight">
                                            {tDesc(tt.id)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>

                    {/* Valor + Valor estimado */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <label htmlFor={amtId} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{t("amount")}</label>
                            <input id={amtId} inputMode="decimal" value={rawAmt} onChange={e => setRawAmt(formatAmount(e.target.value))}
                                placeholder="0,00"
                                className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono cursor-text"
                                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor={estimatedAmtId} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{t("estimatedLabel")}</label>
                            <input id={estimatedAmtId} inputMode="decimal" value={estimatedRawAmt} onChange={e => setEstimatedRawAmt(formatAmount(e.target.value))}
                                placeholder="0,00"
                                className="w-full rounded-xl px-4 py-3 text-sm outline-none font-mono cursor-text"
                                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                        </div>
                    </div>

                    {/* Vencimento + Frequência */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <label htmlFor={dueDateId} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{t("dueDate")}</label>
                            <input id={dueDateId} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                                className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-pointer"
                                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor={frequencyId} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{t("frequency")}</label>
                            <select id={frequencyId} value={frequency} onChange={e => setFrequency(e.target.value as TaxFrequency)}
                                className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-pointer"
                                style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }}>
                                {(["mensal", "trimestral", "semestral", "anual"] as TaxFrequency[]).map(f => (
                                    <option key={f} value={f}>{tFreq(f)}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Status */}
                    <fieldset className="space-y-2 border-0 p-0 m-0 min-w-0">
                        <legend className="text-xs font-semibold uppercase tracking-wider p-0" style={{ color: "var(--cf-text-2)" }}>{t("initialStatus")}</legend>
                        <div className="grid grid-cols-2 gap-2">
                            {(["nao_pago", "pago", "agendado", "atraso"] as TaxStatus[]).map(s => {
                                const meta = STATUS_META[s];
                                return (
                                    <button key={s} type="button" onClick={() => setStatus(s)}
                                        className="py-2.5 rounded-xl text-xs font-bold border-2 cursor-pointer transition-all"
                                        style={status === s
                                            ? { background: meta.bg, borderColor: meta.border, color: meta.color }
                                            : { background: "transparent", borderColor: "var(--cf-border)", color: "var(--cf-text-2)" }}>
                                        {tStatus(s)}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>

                    {/* Forma de Pagamento */}
                    <PaymentMethodSelector
                        value={paymentMethod}
                        onChange={setPaymentMethod}
                        label={t("paymentMethodLabel")}
                        required
                    />

                    {/* Documentos */}
                    <div className="space-y-2">
                        {/* Não é <label> — não há um único campo associado (lista +
                            botão de upload logo abaixo). */}
                        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>
                            {t("documents", { count: attachments.length })}
                        </p>

                        {attachments.length > 0 && (
                            <div className="space-y-1 mb-2">
                                {attachments.map((url, idx) => (
                                    <div key={idx} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                                        style={{ background: "var(--cf-input)", border: "1px solid var(--cf-border)" }}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <FileText size={14} style={{ color: "var(--cf-text-2)", flexShrink: 0 }} />
                                            <a href={url} target="_blank" rel="noopener noreferrer"
                                                className="text-xs truncate"
                                                style={{ color: "var(--brand)", textDecoration: "underline" }}>
                                                {t("documentN", { index: idx + 1 })}
                                            </a>
                                        </div>
                                        <button onClick={() => removeAttachment(idx)}
                                            aria-label={t("removeDocument", { index: idx + 1 })}
                                            className="p-1 rounded-lg cursor-pointer"
                                            style={{ background: "var(--neg-weak)" }}>
                                            <Trash2 size={12} style={{ color: "var(--neg)" }} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <label className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold border-2 border-dashed cursor-pointer transition-all"
                            style={{ borderColor: "var(--cf-border)", background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
                            <Download size={16} />
                            {uploadingFile ? t("uploading") : t("addDocument")}
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
                        <label htmlFor={notesId} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{t("notes")}</label>
                        <input id={notesId} value={notes} onChange={e => setNotes(e.target.value)}
                            placeholder={t("notesPlaceholder")}
                            className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-text"
                            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                    </div>

                    <button onClick={handleOpenPin} disabled={!canSave || saving}
                        className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${canSave && !saving ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                        style={canSave && !saving
                            ? { background: `linear-gradient(135deg, ${typeMeta.color}, ${typeMeta.color}cc)`, color: "white" }
                            : { background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
                        {saving
                            ? <><Loader2 size={15} className="animate-spin" /> {t("saving")}</>
                            : <><Check size={15} /> {editing ? t("saveChanges") : t("createTax")}</>}
                    </button>
                </div>
            </div>

            <PinModal
                open={pinOpen}
                title={editing ? t("saveChanges") : t("createTax")}
                subtitle={t("pinConfirmSubtitle")}
                onClose={() => setPinOpen(false)}
                onSuccess={handlePinSuccess}
            />
        </div>
    );
}

// ─── Modal de Baixa de Imposto ────────────────────────────────────────────────
function TaxPayModal({ open, tax, uid, onClose, onConfirm }: {
    open: boolean;
    tax: Tax | null;
    uid: string | null;
    onClose: () => void;
    onConfirm: (paidAt: string, method: PaymentMethod) => Promise<void>;
}) {
    const t = useTranslations("impostos.payModal");
    const tPin = useTranslations("common.pin");
    const locale = useLocale();
    const [paidAt, setPaidAt] = useState(TODAY);
    const [method, setMethod] = useState<PaymentMethod | null>(null);
    const [pinOpen, setPinOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");
    const paidAtId = useId();

    useEffect(() => {
        if (!open || !tax) return;
        setPaidAt(TODAY);
        setMethod((tax.paymentMethod as PaymentMethod) ?? null);
        setPinOpen(false);
        setSaving(false);
        setErr("");
    }, [open, tax]);

    if (!open || !tax) return null;

    const canConfirm = method !== null && paidAt !== "";

    async function handleOpenPin() {
        if (!canConfirm || !uid) return;
        const pinHash = await loadPinHash(uid);
        if (!pinHash) {
            setErr(tPin("notConfigured"));
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
                setErr(e?.message ?? t("registerError"));
                setSaving(false);
            }
        } else if (result === "locked") {
            setPinOpen(false);
            setErr(tPin("lockedRetry"));
        } else if (result === "wrong") {
            const { locked } = getPinLockStatus();
            if (locked) {
                setPinOpen(false);
                setErr(tPin("lockedRetry"));
            } else {
                (window as any).__pinModalShake?.(tPin("wrong"));
            }
        } else if (result === "no_pin") {
            setPinOpen(false);
            setErr(tPin("notConfigured"));
        }
    }

    return (
        <>
        <div className="fixed inset-0 z-[990] flex items-end sm:items-center justify-center"
            style={{ background: "rgba(13,17,23,0.6)", backdropFilter: "blur(8px)" }}>
            <div className="w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl overflow-hidden"
                style={{ background: "var(--cf-card)", boxShadow: "0 25px 50px rgba(0,0,0,0.25)", animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}>

                <div className="flex justify-center pt-3 pb-1 sm:hidden">
                    <div className="w-10 h-1.5 rounded-full" style={{ background: "var(--cf-border)" }} />
                </div>

                <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--cf-border)" }}>
                    <div>
                        <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>{t("title")}</p>
                        <p className="text-xs mt-1 font-medium truncate" style={{ color: "var(--cf-text-2)" }}>{t("summary", { name: tax.name, amount: toBRL(tax.amount, locale) })}</p>
                    </div>
                    <button onClick={() => !saving && onClose()} aria-label={tPin("close")} className="p-1.5 rounded-lg cursor-pointer"
                        style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
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

                    <div className="space-y-2">
                        <label htmlFor={paidAtId} className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>{t("paidDate")}</label>
                        <input id={paidAtId} type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)}
                            className="w-full rounded-xl px-4 py-3 text-sm outline-none cursor-pointer"
                            style={{ background: "var(--cf-input)", border: "2px solid var(--cf-border)", color: "var(--cf-text)" }} />
                    </div>

                    <PaymentMethodSelector
                        value={method}
                        onChange={setMethod}
                        label={t("paymentMethodLabel")}
                        required
                    />

                    <button onClick={handleOpenPin} disabled={!canConfirm || saving}
                        className={`w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all ${canConfirm && !saving ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
                        style={canConfirm && !saving
                            ? { background: "linear-gradient(135deg, var(--pos), var(--pos))", color: "white" }
                            : { background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
                        {saving
                            ? <><Loader2 size={15} className="animate-spin" /> {t("registering")}</>
                            : <><ShieldCheck size={15} /> {t("confirm")}</>}
                    </button>
                </div>
            </div>
        </div>
        <PinModal
            open={pinOpen}
            title={t("pinTitle")}
            subtitle={t("pinSubtitle")}
            onClose={() => setPinOpen(false)}
            onSuccess={handlePinSuccess}
        />
        </>
    );
}

// ─── Tax Card ──────────────────────────────────────────────────────────────────

function TaxCard({ tax, alertDays, onEdit, onDelete, onOpenPayModal }: {
    tax: Tax & { _status: TaxStatus };
    alertDays: number;
    onEdit: () => void;
    onDelete: () => void;
    onOpenPayModal: () => void;
}) {
    const t = useTranslations("impostos.card");
    const tType = useTranslations("impostos.taxTypes");
    const tDesc = useTranslations("impostos.taxTypeDesc");
    const tFreq = useTranslations("impostos.frequency");
    const tStatus = useTranslations("impostos.status");
    const locale = useLocale();
    const days = daysUntil(tax.dueDate);
    const status: TaxStatus = tax._status;
    const meta = STATUS_META[status];
    const MetaIcon = meta.icon;
    const taxMeta = getTaxMeta(tax.type);
    const TaxIcon = taxMeta.icon;
    const isUrgent = status !== "pago" && days >= 0 && days <= alertDays;
    const isOverdue = status === "atraso";

    return (
        <div className="cf-card overflow-hidden transition-all hover:shadow-md"
            style={{ borderColor: isOverdue ? "var(--neg-weak)" : isUrgent ? "var(--warn-weak)" : "var(--cf-border)" }}>
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
                                <p className="text-xs mt-0.5" style={{ color: "var(--cf-text-3)" }}>
                                    {tType(tax.type)} · {tDesc(tax.type)}
                                </p>
                            </div>
                            <span className="font-heading font-bold text-base shrink-0 mono"
                                style={{ color: isOverdue ? "var(--neg)" : "var(--cf-text)" }}>
                                {toBRL(tax.amount, locale)}
                            </span>
                        </div>

                        {/* Badge status + frequência + forma de pagamento */}
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full flex items-center gap-1"
                                style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                                <MetaIcon size={11} /> {tStatus(status)}
                            </span>
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                                style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
                                {tFreq(tax.frequency)}
                            </span>
                            {tax.attachments?.length > 0 && (
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1"
                                    style={{ background: "var(--brand-weak)", color: "var(--brand)" }}>
                                    <FileText size={10} /> {tax.attachments.length}
                                </span>
                            )}
                            {(tax.paymentMethod || tax.paidPaymentMethod) && (
                                <span className="flex items-center gap-1 flex-wrap">
                                    {tax.paidPaymentMethod && (
                                        <PaymentMethodBadge method={tax.paidPaymentMethod as PaymentMethod} prefix={t("paidMethod")} small />
                                    )}
                                    {tax.paymentMethod && tax.paymentMethod !== tax.paidPaymentMethod && (
                                        <PaymentMethodBadge method={tax.paymentMethod as PaymentMethod} prefix={t("prevMethod")} small />
                                    )}
                                </span>
                            )}
                        </div>

                        {/* Vencimento */}
                        <div className="flex items-center gap-1.5 mt-2.5">
                            <Calendar size={13}
                                style={{ color: isOverdue ? "var(--neg)" : isUrgent ? "var(--warn)" : "var(--cf-text-3)" }} />
                            <span className="text-xs font-medium"
                                style={{ color: isOverdue ? "var(--neg)" : isUrgent ? "var(--warn)" : "var(--cf-text-2)" }}>
                                {status === "pago"
                                    ? t("paidOn", { date: tax.paidAt ? labelDate(tax.paidAt, locale) : "—" })
                                    : isOverdue
                                        ? t("overdueBy", { count: Math.abs(days) })
                                        : days === 0
                                            ? t("dueToday")
                                            : t("dueIn", { count: days, date: labelDate(tax.dueDate, locale) })}
                            </span>
                            {isUrgent && (
                                <span className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                                    style={{ background: "var(--warn-weak)", color: "var(--warn)" }}>!</span>
                            )}
                        </div>

                        {/* Estimativa */}
                        {tax.estimatedAmount && (
                            <p className="text-xs mt-1.5" style={{ color: "var(--cf-text-3)" }}>
                                {t("estimated", { value: toBRL(tax.estimatedAmount, locale) })}
                            </p>
                        )}

                        {tax.notes && (
                            <p className="text-xs mt-1.5 truncate" style={{ color: "var(--cf-text-3)" }}>📝 {tax.notes}</p>
                        )}
                    </div>
                </div>

                {/* Ações */}
                <div className="flex items-center gap-2 mt-4 pt-3" style={{ borderTop: "1px solid var(--cf-border)" }}>
                    {status !== "pago" ? (
                        <button onClick={onOpenPayModal}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all"
                            style={{ background: `linear-gradient(135deg, ${taxMeta.color}, ${taxMeta.color}cc)`, color: "white" }}>
                            <CheckCircle2 size={13} />
                            {t("markPaid")}
                        </button>
                    ) : (
                        <div className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold"
                            style={{ background: "var(--pos-weak)", color: "var(--pos)" }}>
                            <Check size={13} /> {t("taxPaid")}
                        </div>
                    )}
                    <button onClick={onEdit} className="p-2 rounded-xl cursor-pointer" aria-label={t("edit")}
                        style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
                        <Edit3 size={14} />
                    </button>
                    <button onClick={onDelete} className="p-2 rounded-xl cursor-pointer" aria-label={t("delete")}
                        style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}>
                        <Trash2 size={14} />
                    </button>
                </div>

                <AuditTrail record={tax} settleLabel={t("settleLabel")} />
            </div>
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
        <div className="fixed top-4 right-4 z-9999 flex flex-col gap-2 pointer-events-none">
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
    const t = useTranslations("impostos");
    const tStatus = useTranslations("impostos.status");
    const tType = useTranslations("impostos.taxTypes");
    const tSphere = useTranslations("impostos.spheres");
    const tGroups = useTranslations("impostos.sphereGroups");
    const tPin = useTranslations("common.pin");
    const tNav = useTranslations("nav");
    const locale = useLocale();

    const [uid, setUid] = useState<string | null>(null);
    // uid do login atual — usado para o PIN (pessoal) e para o selo de autoria,
    // separado de `uid`, que é o dono dos dados (pode ser outra conta).
    const [authUid, setAuthUid] = useState<string | null>(null);
    const [userName, setUserName] = useState("");
    const [userEmail, setUserEmail] = useState("");
    const [taxes, setTaxes] = useState<Tax[]>([]);
    const [pageState, setPageState] = useState<"loading" | "ready" | "error" | "blocked">("loading");
    const [errMsg, setErrMsg] = useState("");

    const [modal, setModal] = useState(false);
    const [editing, setEditing] = useState<Tax | null>(null);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [taxPayModal, setTaxPayModal] = useState<Tax | null>(null);
    const [deletePinOpen, setDeletePinOpen] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    const [alertDays, setAlertDays] = useState(7);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<"todos" | TaxStatus>("todos");
    const [filterSphere, setFilterSphere] = useState<"todos" | TaxSphere>("todos");
    const [filterType, setFilterType] = useState("todos");
    // Mês em foco = seletor global da Navbar (usePeriod). A lista é filtrada
    // por mês de vencimento; alertas/KPIs seguem globais.
    const { monthKey, label: periodLabel } = usePeriod();

    const { toasts, show: showToast } = useToast();

    useEffect(() => {
        const saved = localStorage.getItem("nexusfi:taxAlertDays");
        if (saved) setAlertDays(Number(saved));
    }, []);

    const saveAlertDays = (d: number) => {
        setAlertDays(d);
        localStorage.setItem("nexusfi:taxAlertDays", String(d));
        showToast(t("toast.alertsConfigured", { count: d }));
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
                    // "impostos" liberado nem chega a assinar a coleção
                    // abaixo.
                    const { resolveAccountScope, hasPermission } = await import("@/lib/accountScope");
                    const scope = await resolveAccountScope(db, u.uid);
                    if (!hasPermission(scope, "impostos")) { setPageState("blocked"); return; }
                    const ownerUid = scope.ownerUid;

                    setUid(ownerUid);
                    setAuthUid(u.uid);
                    setUserName(u.displayName ?? u.email ?? "");
                    setUserEmail(u.email ?? "");
                    snapUnsub?.();
                    snapUnsub = onSnapshot(
                        query(collection(db, "users", ownerUid, "taxes"), orderBy("createdAt", "desc")),
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
                showToast(t("toast.overdueOnLoad", { count: overdue.length }), "err");
            }
            if (soon.length > 0) {
                setTimeout(() => {
                    showToast(t("toast.dueSoonOnLoad", { count: soon.length, days: alertDaysCurrent }), "warn");
                }, 600);
            }
        }, 800);
    }, [pageState]);

    async function handleLogout() {
        const { getFirebase } = await import("@/lib/firebase");
        const { signOut } = await import("firebase/auth");
        const { auth } = await getFirebase();
        await signOut(auth);
        window.location.href = "/login";
    }

    async function handleSave(data: Omit<Tax, "id" | "userId" | "createdAt">) {
        if (!uid) throw new Error(tPin("notConfigured"));
        const [{ getFirebase }, { doc, updateDoc, collection, addDoc }] = await Promise.all([
            import("@/lib/firebase"),
            import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();
        const clean = Object.fromEntries(
            Object.entries({ ...data, userId: uid }).filter(([, v]) => v !== undefined)
        );
        const actor = { uid: authUid ?? uid, name: userName };
        let taxId: string;
        if (editing) {
            await updateDoc(doc(db, "users", uid, "taxes", editing.id), { ...clean, ...stampUpdate(actor) } as any);
            taxId = editing.id;
            showToast(t("toast.taxUpdated"));
        } else {
            const ref = await addDoc(collection(db, "users", uid, "taxes"), { ...clean, createdAt: Date.now(), ...stampCreate(actor) });
            taxId = ref.id;
            showToast(t("toast.taxCreated"));
        }

        // Reflete no Fluxo de Caixa: com status "pago" cria/atualiza a saída
        // espelho; com qualquer outro status, remove se existir.
        await syncTaxCashflow(db, uid, {
            id: taxId,
            name: data.name,
            amount: data.amount,
            dueDate: data.dueDate,
            status: data.status,
            frequency: data.frequency,
            paidAt: data.paidAt,
            paidPaymentMethod: data.paidPaymentMethod as string | undefined,
        });
    }

    async function handlePay(tax: Tax, paidAt: string, method: PaymentMethod) {
        if (!uid) return;
        const [{ getFirebase }, { doc, updateDoc }] = await Promise.all([
            import("@/lib/firebase"),
            import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();

        await updateDoc(doc(db, "users", uid, "taxes", tax.id), {
            status: "pago",
            paidAt,
            paidPaymentMethod: method,
            ...stampSettle({ uid: authUid ?? uid, name: userName }),
        });

        // Registrar no Fluxo de Caixa (saída espelho linkada por sourceTaxId).
        await syncTaxCashflow(db, uid, {
            ...tax,
            status: "pago",
            paidAt,
            paidPaymentMethod: method,
        });

        showToast(t("toast.markedPaid"));
    }

    async function handleDelete() {
        if (!confirmId || !uid || deleting) return;
        setDeleting(true);
        try {
            const [{ getFirebase }, { doc, deleteDoc }] = await Promise.all([
                import("@/lib/firebase"),
                import("firebase/firestore"),
            ]);
            const { db } = await getFirebase();
            // Remove a saída espelho no Fluxo de Caixa (se o imposto estava pago).
            await syncTaxCashflow(db, uid, { id: confirmId, name: "", amount: 0, dueDate: "", status: "removido" });
            await deleteDoc(doc(db, "users", uid, "taxes", confirmId));
            setConfirmId(null);
            showToast(t("toast.taxRemoved"));
        } catch (e: any) {
            showToast(e.message, "err");
        } finally {
            setDeleting(false);
        }
    }

    async function handleDeleteWithPin(taxId: string) {
        if (!uid) return;
        const pinHash = await loadPinHash(authUid ?? uid);
        if (!pinHash) {
            showToast(tPin("notConfigured"), "err");
            return;
        }
        setPendingDeleteId(taxId);
        setDeletePinOpen(true);
    }

    async function handleDeletePinSuccess(pin: string) {
        if (!uid) return;
        const result = await verifyPin(authUid ?? uid, pin);
        if (result === "ok") {
            setDeletePinOpen(false);
            if (pendingDeleteId) {
                setConfirmId(pendingDeleteId);
                setPendingDeleteId(null);
            }
        } else if (result === "locked") {
            setDeletePinOpen(false);
            showToast(tPin("lockedRetry"), "err");
        } else if (result === "wrong") {
            const { locked } = getPinLockStatus();
            if (locked) {
                setDeletePinOpen(false);
                showToast(tPin("lockedRetry"), "err");
            } else {
                (window as any).__pinModalShake?.(tPin("wrong"));
            }
        } else if (result === "no_pin") {
            setDeletePinOpen(false);
            showToast(tPin("notConfigured"), "err");
        }
    }

    // ── Dados derivados ────────────────────────────────────────────────────────

    const enriched = useMemo((): (Tax & { _status: TaxStatus })[] =>
        taxes.map(t => ({ ...t, _status: computeStatus(t) })),
        [taxes]);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return enriched.filter(t => {
            if ((t.dueDate ?? "").slice(0, 7) !== monthKey) return false;
            if (filterStatus !== "todos" && t._status !== filterStatus) return false;
            if (filterSphere !== "todos") {
                const meta = getTaxMeta(t.type);
                if (meta?.esfera !== filterSphere) return false;
            }
            if (filterType !== "todos" && t.type !== filterType) return false;
            if (q && !t.name.toLowerCase().includes(q) && !t.notes.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [enriched, filterStatus, filterSphere, filterType, search, monthKey]);

    const sections = useMemo(() => [
        { key: "atraso", color: "var(--neg)", taxes: filtered.filter(t => t._status === "atraso") },
        { key: "nao_pago", color: "var(--warn)", taxes: filtered.filter(t => t._status === "nao_pago") },
        { key: "agendado", color: "var(--brand)", taxes: filtered.filter(t => t._status === "agendado") },
        { key: "pago", color: "var(--pos)", taxes: filtered.filter(t => t._status === "pago") },
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

    if (pageState === "blocked") return <AccessDenied category={tNav("items.impostos")} />;

    if (pageState === "loading") return <PageLoader background="var(--cf-bg)" />;

    if (pageState === "error") return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" style={{ background: "var(--cf-bg)" }}>
            <p className="font-heading text-lg font-bold text-rose-500">{t("error.connect")}</p>
            <p className="text-xs font-mono text-rose-700 bg-rose-50 rounded-xl p-4 max-w-sm break-all">{errMsg}</p>
            <button onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
                style={{ background: "var(--brand)", color: "white" }}>
                {t("error.tryAgain")}
            </button>
        </div>
    );

    return (
        <div className="flex flex-col min-h-screen" style={{ background: "var(--cf-bg)" }}>

            <Navbar user={{ displayName: userName || null, email: userEmail }} activePath="/impostos" onLogout={handleLogout} />

            <TaxModal
                open={modal} editing={editing} uid={authUid}
                onClose={() => { setModal(false); setEditing(null); }}
                onSave={handleSave}
            />

            <TaxPayModal
                open={taxPayModal !== null}
                tax={taxPayModal}
                uid={authUid}
                onClose={() => setTaxPayModal(null)}
                onConfirm={async (paidAt, method) => {
                    if (!taxPayModal) return;
                    await handlePay(taxPayModal, paidAt, method);
                    setTaxPayModal(null);
                }}
            />

            <PinModal
                open={deletePinOpen}
                title={t("confirmDelete.pinTitle")}
                subtitle={t("confirmDelete.pinSubtitle")}
                onClose={() => { setDeletePinOpen(false); setPendingDeleteId(null); }}
                onSuccess={handleDeletePinSuccess}
            />

            {confirmId && (
                <div className="fixed inset-0 z-990 flex items-center justify-center p-4"
                    style={{ background: "rgba(13,17,23,0.5)", backdropFilter: "blur(8px)" }}>
                    <div className="cf-card p-6 w-full max-w-xs text-center"
                        style={{ animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}>
                        <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3"
                            style={{ background: "var(--neg-weak)" }}>
                            <Trash2 size={20} style={{ color: "var(--neg)" }} />
                        </div>
                        <p className="font-heading text-base font-bold mb-1" style={{ color: "var(--cf-text)" }}>
                            {t("confirmDelete.title")}
                        </p>
                        <p className="text-xs mb-5" style={{ color: "var(--cf-text-2)" }}>
                            {t("confirmDelete.body")}
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setConfirmId(null)}
                                className="flex-1 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
                                style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text-2)" }}>
                                {t("confirmDelete.cancel")}
                            </button>
                            <button onClick={handleDelete} disabled={deleting}
                                className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1 cursor-pointer disabled:opacity-60"
                                style={{ background: "linear-gradient(135deg, var(--neg), var(--neg))", color: "white" }}>
                                {deleting ? <Loader2 size={14} className="animate-spin" /> : <><Trash2 size={14} /> {t("confirmDelete.delete")}</>}
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
                            {t("meta.title")}
                        </h1>
                        <p className="text-xs mt-1 flex items-center gap-2" style={{ color: "var(--cf-text-2)" }}>
                            {kpis.alert > 0
                                ? <span className="flex items-center gap-1 font-semibold animate-pulse" style={{ color: "var(--warn)" }}>
                                    <AlertTriangle size={12} />
                                    {t("header.dueSoon", { count: kpis.alert, days: alertDays })}
                                </span>
                                : kpis.totalOverdue > 0
                                    ? <span className="flex items-center gap-1 font-semibold" style={{ color: "var(--neg)" }}>
                                        <AlertTriangle size={12} />
                                        {t("header.overdue", { count: kpis.totalOverdue })}
                                    </span>
                                    : <span style={{ color: "var(--pos)" }}>{t("header.allClear")}</span>
                            }
                        </p>
                    </div>
                    <button onClick={() => { setEditing(null); setModal(true); }}
                        className="hidden sm:flex items-center gap-2 text-xs font-bold px-3 py-2 rounded-xl cursor-pointer"
                        style={{ background: "var(--brand)", color: "white" }}>
                        <Plus size={14} /> {t("meta.newTax")}
                    </button>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                    {[
                        { label: t("kpi.toPay"), val: toBRL(kpis.aPagar, locale), color: "var(--brand)", bg: "var(--brand-weak)", sub: t("kpi.taxCount", { count: kpis.totalNotPaid }) },
                        { label: t("kpi.overdue"), val: toBRL(kpis.atraso, locale), color: "var(--neg)", bg: "var(--neg-weak)", sub: t("kpi.taxCount", { count: kpis.totalOverdue }) },
                        { label: t("kpi.paid"), val: toBRL(kpis.pago, locale), color: "var(--pos)", bg: "var(--pos-weak)", sub: t("kpi.taxCount", { count: kpis.totalPaid }) },
                        { label: t("kpi.estimated"), val: toBRL(kpis.estimado, locale), color: "var(--brand)", bg: "var(--brand-weak)", sub: t("kpi.planning") },
                    ].map(({ label, val, color, bg, sub }, i) => (
                        <div key={label} className="cf-kpi kin p-3 sm:p-4 flex flex-col gap-1.5"
                            style={{ animationDelay: `${i * 60}ms` }}>
                            <p className="text-xs font-semibold" style={{ color: "var(--cf-text-2)" }}>{label}</p>
                            <p className="font-heading font-bold text-base sm:text-lg mono" style={{ color }}>{val}</p>
                            <p className="text-xs" style={{ color: "var(--cf-text-3)" }}>{sub}</p>
                        </div>
                    ))}
                </div>

                {/* Filtros */}
                <div className="cf-card p-3.5 space-y-3">
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                            style={{ color: "var(--cf-text-3)" }} />
                        <input value={search} onChange={e => setSearch(e.target.value)}
                            placeholder={t("toolbar.searchPlaceholder")} aria-label={t("toolbar.searchAria")}
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
                                        : { background: "transparent", color: "var(--cf-text-2)", borderColor: "var(--cf-border)" }}>
                                    {f === "todos" ? t("toolbar.filterAll") : tStatus(f)}
                                </button>
                            );
                        })}
                        <div className="ml-auto flex items-center gap-2 shrink-0">
                            {/* Filtro por Esfera */}
                            <div className="relative">
                                <Filter size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                                    style={{ color: "var(--cf-text-3)" }} />
                                <select value={filterSphere} onChange={e => {
                                    setFilterSphere(e.target.value as "todos" | TaxSphere);
                                    setFilterType("todos"); // Reseta o tipo de imposto
                                }}
                                    className="pl-7 pr-6 py-1.5 rounded-full text-xs font-semibold border cursor-pointer appearance-none outline-none"
                                    style={{ background: "var(--cf-input)", borderColor: "var(--cf-border)", color: "var(--cf-text)" }}>
                                    <option value="todos">{tSphere("all")}</option>
                                    <option value="federal">{tSphere("federal")}</option>
                                    <option value="estadual">{tSphere("estadual")}</option>
                                    <option value="municipal">{tSphere("municipal")}</option>
                                    <option value="outro">{tSphere("outro")}</option>
                                </select>
                            </div>

                            {/* Filtro por Tipo */}
                            <div className="relative">
                                <Filter size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
                                    style={{ color: "var(--cf-text-3)" }} />
                                <select value={filterType} onChange={e => setFilterType(e.target.value)}
                                    className="pl-7 pr-6 py-1.5 rounded-full text-xs font-semibold border cursor-pointer appearance-none outline-none"
                                    style={{ background: "var(--cf-input)", borderColor: "var(--cf-border)", color: "var(--cf-text)" }}>
                                    <option value="todos">{t("toolbar.allTypes")}</option>
                                    {(["federal", "estadual", "municipal", "outro"] as TaxSphere[]).map(sph => (
                                        (filterSphere === "todos" || filterSphere === sph) && (
                                            <optgroup key={sph} label={tGroups(sph)}>
                                                {TAX_TYPES.filter(tt => tt.esfera === sph).map(tt => (
                                                    <option key={tt.id} value={tt.id}>{tType(tt.id)}</option>
                                                ))}
                                            </optgroup>
                                        )
                                    ))}
                                </select>
                            </div>
                            <span className="text-xs font-semibold px-2 py-1 rounded-full shrink-0" style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
                                title={t("toolbar.monthHint")}>
                                {periodLabel}
                            </span>
                            <span className="text-xs font-medium" style={{ color: "var(--cf-text-3)" }}>
                                {t("toolbar.resultCount", { count: filtered.length })}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Lista agrupada */}
                {filtered.length === 0 ? (
                    <div className="cf-card p-12 flex flex-col items-center text-center gap-3">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                            style={{ background: "var(--cf-input)" }}>
                            <Target size={24} style={{ color: "var(--cf-text-3)" }} />
                        </div>
                        <p className="font-heading text-base font-bold" style={{ color: "var(--cf-text)" }}>
                            {search || filterStatus !== "todos" || filterType !== "todos" || filterSphere !== "todos"
                                ? t("empty.noResults")
                                : t("empty.nothingIn", { period: periodLabel })}
                        </p>
                        <p className="text-xs max-w-xs" style={{ color: "var(--cf-text-2)" }}>
                            {search || filterStatus !== "todos" || filterType !== "todos" || filterSphere !== "todos"
                                ? t("empty.adjustFilters")
                                : t("empty.noneThisMonth")}
                        </p>
                        {!search && filterStatus === "todos" && filterType === "todos" && filterSphere === "todos" && (
                            <button onClick={() => { setEditing(null); setModal(true); }}
                                className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl cursor-pointer mt-2"
                                style={{ background: "var(--brand)", color: "white" }}>
                                <Plus size={14} /> {t("meta.addTax")}
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        {sections.map(section => (
                            <div key={section.key}>
                                <div className="flex items-center gap-2.5 mb-3">
                                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: section.color }} />
                                    <p className="text-sm font-bold" style={{ color: section.color }}>{t(`sections.${section.key}`)}</p>
                                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                        style={{ background: section.color + "18", color: section.color }}>
                                        {section.taxes.length}
                                    </span>
                                    <div className="flex-1 h-px" style={{ background: section.color + "30" }} />
                                    <span className="text-xs font-bold mono" style={{ color: section.color }}>
                                        {toBRL(section.taxes.reduce((s, t) => s + t.amount, 0), locale)}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {section.taxes.map(tax => (
                                        <TaxCard
                                            key={tax.id}
                                            tax={tax}
                                            alertDays={alertDays}
                                            onEdit={() => { setEditing(tax); setModal(true); }}
                                            onDelete={() => handleDeleteWithPin(tax.id)}
                                            onOpenPayModal={() => setTaxPayModal(tax)}
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
                aria-label={t("meta.newTax")}
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
