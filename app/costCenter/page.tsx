"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useId } from "react";
import {
  TrendingUp,
  CreditCard,
  Wallet,
  BarChart2,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Loader,
  Search,
  ChevronDown,
} from "lucide-react";
import Navbar from "../components/Navbar";
import { useTheme } from "../hooks/useTheme";
import { usePeriod } from "../hooks/usePeriod";
import { syncExpenseCashflow } from "@/lib/costCenterSync";
import { resolveAccountScope, hasPermission } from "@/lib/accountScope";
import AccessDenied from "../components/AccessDenied";
import { PageLoader } from "../components/ui";
import "./costCenter.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CostCenter {
  id: string;
  name: string;
  /** @deprecated legado — usado só como fallback de leitura pro mês atual, ver getBudgetForMonth() */
  budget?: number;
  /** Orçamento por mês, chave "YYYY-MM". Fonte da verdade a partir desta versão. */
  budgetsByMonth?: Record<string, number>;
  /** @deprecated legado — gasto passou a ser sempre derivado das despesas reais, ver centerSpentForMonth() */
  spent?: number;
  color: string;
  userId: string;
  createdAt: any;
  categories?: Array<{ id: string; name: string; color: string }>;
}

interface Expense {
  id: string;
  category: string;
  center: string;
  amount: number;
  date: string;
  status: "pago" | "pendente" | "agendado";
  description?: string;
  userId: string;
  createdAt: any;
  paidAt?: string;
}

// ─── Período (mês/ano) ────────────────────────────────────────────────────────

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Data completa por extenso curto, ex: "21 de mai de 2026" — aceita Timestamp do Firestore, Date ou string/número. */
function formatFullDate(value: unknown): string {
  const hasToDate = (v: unknown): v is { toDate: () => Date } =>
    typeof v === "object" && v !== null && typeof (v as { toDate?: unknown }).toDate === "function";
  const d = hasToDate(value) ? value.toDate() : value instanceof Date ? value : new Date(value as string | number);
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate()} de ${MONTH_LABELS[d.getMonth()].toLowerCase()} de ${d.getFullYear()}`;
}

/** Converte Timestamp do Firestore, Date ou string/número pro formato "YYYY-MM-DD" que o <input type="date"> espera. */
function toDateInputValue(value: unknown): string {
  const hasToDate = (v: unknown): v is { toDate: () => Date } =>
    typeof v === "object" && v !== null && typeof (v as { toDate?: unknown }).toDate === "function";
  const d = hasToDate(value) ? value.toDate() : value instanceof Date ? value : new Date(value as string | number);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Orçamento do centro para um mês específico. Centros já migrados usam
 * `budgetsByMonth` diretamente; centros antigos (sem `budgetsByMonth`) usam
 * o campo legado `budget`, mas SÓ para o mês atual — nunca retroage para
 * meses passados nem projeta pros futuros silenciosamente.
 */
function getBudgetForMonth(center: CostCenter, monthKey: string, currentMonthKey: string): number {
  if (center.budgetsByMonth && monthKey in center.budgetsByMonth) return center.budgetsByMonth[monthKey];
  if (!center.budgetsByMonth && typeof center.budget === "number" && monthKey === currentMonthKey) return center.budget;
  return 0;
}

/** Despesas pagas de um centro, dentro de um mês específico. */
function expensesForCenterMonth(expenses: Expense[], centerName: string, monthKey: string): Expense[] {
  return expenses.filter(e => e.center === centerName && e.status === "pago" && e.date.startsWith(monthKey));
}

function centerSpentForMonth(expenses: Expense[], centerName: string, monthKey: string): number {
  return expensesForCenterMonth(expenses, centerName, monthKey).reduce((s, e) => s + e.amount, 0);
}

// ─── Constantes e Helpers ─────────────────────────────────────────────────────

const fmt = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const COLORS = [
  "var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)",
  "var(--cat-5)", "var(--cat-6)", "var(--cat-7)", "var(--cat-8)",
];

// Lista genérica — usada só como fallback pra quem ainda não respondeu o
// "ramo de atuação" no onboarding (ou cujo ramo não bate com nenhum dos
// 4 segmentos abaixo).
const DEFAULT_CATEGORIES = [
  "Alimentação",
  "Transporte",
  "Hospedagem",
  "Comunicação",
  "Equipamentos",
  "Consultoria",
  "Treinamento",
  "Marketing",
  "Utilities",
  "Manutenção",
  "Outros",
];

// Nomenclatura de categorias por segmento — mesmo "ramo" já coletado no
// onboarding (answers.ramo, cacheado em onboarding_ramo_${uid}) e usado
// hoje pelo Navbar pra esconder "Estoque" de quem é Serviço.
const CATEGORY_SETS: Record<string, string[]> = {
  "Comércio": [
    "Fornecedores", "Frete e logística", "Aluguel do ponto", "Folha de pagamento",
    "Marketing", "Embalagens", "Manutenção", "Impostos", "TI / Software", "Outros",
  ],
  "E-commerce": [
    "Fornecedores", "Frete e logística", "Plataforma / Marketplace", "Marketing digital",
    "Embalagens", "Folha de pagamento", "TI / Software", "Impostos", "Devoluções", "Outros",
  ],
  "Indústria": [
    "Matéria-prima", "Mão de obra", "Manutenção de máquinas", "Energia", "Logística",
    "Folha de pagamento", "Segurança do trabalho", "Impostos", "TI / Software", "Outros",
  ],
  "Serviço": [
    "Mão de obra", "Ferramentas e equipamentos", "Deslocamento", "Marketing", "Consultoria",
    "Folha de pagamento", "TI / Software", "Impostos", "Treinamento", "Outros",
  ],
};

/** Categorias do segmento do usuário (1º ramo respondido no onboarding), com fallback pra lista genérica. */
function categoriesForSegment(ramo: string | null): string[] {
  if (ramo && CATEGORY_SETS[ramo]) return CATEGORY_SETS[ramo];
  return DEFAULT_CATEGORIES;
}

const CATEGORY_COLORS: Record<string, string> = {
  // Genéricas
  "Alimentação": "var(--cat-1)",
  "Transporte": "var(--cat-2)",
  "Hospedagem": "var(--cat-3)",
  "Comunicação": "var(--cat-4)",
  "Equipamentos": "var(--pos)",
  "Consultoria": "var(--cat-5)",
  "Treinamento": "var(--warn)",
  "Marketing": "var(--neg)",
  "Utilities": "var(--cat-6)",
  "Manutenção": "var(--cat-7)",
  "Outros": "var(--cat-8)",
  // Comércio / E-commerce
  "Fornecedores": "var(--cat-1)",
  "Frete e logística": "var(--cat-2)",
  "Aluguel do ponto": "var(--cat-3)",
  "Folha de pagamento": "var(--cat-4)",
  "Embalagens": "var(--cat-5)",
  "Impostos": "var(--neg)",
  "TI / Software": "var(--cat-6)",
  "Plataforma / Marketplace": "var(--cat-7)",
  "Marketing digital": "var(--neg)",
  "Devoluções": "var(--cat-8)",
  // Indústria
  "Matéria-prima": "var(--cat-1)",
  "Mão de obra": "var(--cat-2)",
  "Manutenção de máquinas": "var(--cat-3)",
  "Energia": "var(--cat-4)",
  "Logística": "var(--cat-5)",
  "Segurança do trabalho": "var(--cat-6)",
  // Serviço
  "Ferramentas e equipamentos": "var(--pos)",
  "Deslocamento": "var(--cat-7)",
};

const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
  blue: { bg: "rgba(59, 130, 246, 0.1)", text: "var(--brand)", icon: "rgba(59, 130, 246, 0.15)" },
  rose: { bg: "rgba(244, 63, 94, 0.08)", text: "var(--neg)", icon: "rgba(244, 63, 94, 0.12)" },
  emerald: { bg: "rgba(16, 185, 129, 0.08)", text: "var(--pos)", icon: "rgba(16, 185, 129, 0.12)" },
  amber: { bg: "rgba(245, 158, 11, 0.08)", text: "var(--warn)", icon: "rgba(245, 158, 11, 0.12)" },
};

// (mapCategoryToCashflow e syncExpenseCashflow viraram lib/costCenterSync.ts
// — compartilhadas com a direção inversa da sincronização em CashFlow.tsx.)

// ─── SVG Bar Chart ─────────────────────────────────────────────────────────────

interface ChartCenter { id: string; name: string; budget: number; spent: number }

function BarChart({ centers }: { centers: ChartCenter[] }) {
  if (centers.length === 0) return null;
  const maxVal = Math.max(...centers.map(c => Math.max(c.budget, c.spent, 1)));
  const W = Math.max(centers.length * 90 + 60, 320);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${W} 180`} style={{ width: "100%", minWidth: W, height: 180 }}
        role="img"
        aria-label="Gráfico de barras: orçamento vs. gasto real por centro de custo — detalhamento na lista abaixo"
      >
        {[0, 0.5, 1].map(pct => {
          const y = 20 + (1 - pct) * 120;
          const val = Math.round(maxVal * pct);
          return (
            <g key={pct}>
              <line x1="48" x2={W - 10} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
              <text x="44" y={y + 4} textAnchor="end" fontSize="9" fill="var(--db-text-2)" fillOpacity="0.85">
                {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}
              </text>
            </g>
          );
        })}
        <rect x="52" y="162" width="10" height="8" rx="2" fill="var(--primary-light)" />
        <text x="66" y="170" fontSize="9" fill="var(--db-text-2)" fillOpacity="0.85">Orçamento</text>
        <rect x="138" y="162" width="10" height="8" rx="2" fill="var(--primary)" />
        <text x="152" y="170" fontSize="9" fill="var(--db-text-2)" fillOpacity="0.85">Real</text>
        {centers.map((c, i) => {
          const x = 52 + i * 90;
          const bw = 24;
          const bh = Math.max((c.budget / maxVal) * 120, 2);
          const sh = Math.max((c.spent / maxVal) * 120, 2);
          const over = c.spent > c.budget;
          const label = c.name.length > 10 ? c.name.slice(0, 10) + "…" : c.name;
          return (
            <g key={c.id}>
              <rect x={x} y={20 + 120 - bh} width={bw} height={bh} rx="3" fill="var(--primary-light)" opacity="0.7" />
              <rect x={x + bw + 4} y={20 + 120 - sh} width={bw} height={sh} rx="3" fill={over ? "var(--danger)" : "var(--primary)"} />
              <text x={x + bw + 2} y={154} textAnchor="middle" fontSize="9" fill="var(--db-text-2)" fillOpacity="0.85">{label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Confirmation Modal ────────────────────────────────────────────────────────

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  isDangerous = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-999"
      style={{ background: "var(--db-overlay)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border shadow-2xl"
        style={{ background: "var(--db-card)", borderColor: "var(--db-border)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b" style={{ borderColor: "var(--db-border)" }}>
          <h3 className="font-bold text-base" style={{ color: isDangerous ? "var(--danger)" : "var(--db-text)" }}>
            {title}
          </h3>
          <button
            onClick={onCancel}
            disabled={loading}
            className="p-1.5 rounded-lg hover:opacity-70 transition-opacity cursor-pointer disabled:opacity-50"
            aria-label="Fechar"
          >
            <X size={16} style={{ color: "var(--db-text-2)" }} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-sm" style={{ color: "var(--db-text-2)" }}>
            {message}
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 border-t" style={{ borderColor: "var(--db-border)" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl border cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-50"
            style={{ borderColor: "var(--db-border)", color: "var(--db-text-2)" }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-white flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50`}
            style={{
              background: isDangerous ? "var(--danger)" : "var(--primary)",
            }}
          >
            {loading ? <Loader size={14} className="animate-spin" /> : null}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Expense Modal ─────────────────────────────────────────────────────────────

interface ExpenseModalProps {
  open: boolean;
  editing: Expense | null;
  centers: CostCenter[];
  categories: string[];
  uid: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

function ExpenseModal({ open, editing, centers, categories, uid, onClose, onSaved }: ExpenseModalProps) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [center, setCenter] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"pago" | "pendente" | "agendado">("pago");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const descriptionId = useId();
  const categoryId = useId();
  const centerId = useId();
  const amountId = useId();
  const dateId = useId();

  useEffect(() => {
    if (!open) return;
    setDescription(editing?.description ?? "");
    setCategory(editing?.category ?? "");
    setCenter(editing?.center ?? centers[0]?.name ?? "");
    setAmount(editing ? String(editing.amount) : "");
    setDate(editing?.date ?? new Date().toISOString().split("T")[0]);
    setStatus((editing?.status ?? "pago") as "pago" | "pendente" | "agendado");
    setSaving(false);
    setErr("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  if (!open) return null;

  const parsedAmount = parseFloat(amount.replace(",", ".")) || 0;
  const canSave = category.trim().length > 0 && center.length > 0 && parsedAmount > 0 && date.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave || saving || !uid) return;
    setSaving(true);
    setErr("");

    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { collection, addDoc, updateDoc, doc } = await import("firebase/firestore");

      // Gasto por período agora é sempre derivado das despesas reais (ver
      // centerSpentForMonth) — não há mais acumulador em costCenters pra
      // manter aqui. Só o documento da despesa + o espelho no cashflow.
      if (editing) {
        await updateDoc(doc(db, "expenses", editing.id), {
          description, category, center, amount: parsedAmount, date, status,
        });
        await syncExpenseCashflow(db, uid, editing.id, { description, category, center, amount: parsedAmount, date, status });
        onSaved("Despesa atualizada!");
      } else {
        const expRef = await addDoc(collection(db, "expenses"), {
          description, category, center, amount: parsedAmount, date, status,
          userId: uid, createdAt: new Date(),
        });
        await syncExpenseCashflow(db, uid, expRef.id, { description, category, center, amount: parsedAmount, date, status });
        onSaved(status === "pago" ? "Despesa criada e lançada no fluxo de caixa!" : "Despesa criada!");
      }

      onClose();
    } catch (e: any) {
      console.error("SAVE EXPENSE ERROR:", e.code, e.message, e);
      setErr(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-999"
      style={{ background: "rgba(0,0,0,0.12)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
    >
      <div className="w-full max-w-md rounded-2xl border shadow-2xl" style={{ background: "var(--db-card)", borderColor: "var(--db-border)" }}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b" style={{ borderColor: "var(--db-border)" }}>
          <div>
            <h3 className="font-bold text-base" style={{ color: "var(--db-text)" }}>
              {editing ? "Editar despesa" : "Nova despesa"}
            </h3>
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: "var(--success)" }}>
              <Check size={11} /> Despesas "Pago" sincronizam com fluxo de caixa
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity cursor-pointer" aria-label="Fechar">
            <X size={16} style={{ color: "var(--db-text-2)" }} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
          {err && (
            <div className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-xl"
              style={{ background: "var(--saida-bg)", border: `1px solid var(--saida-border)`, color: "var(--saida-text)" }}>
              <AlertCircle size={13} /> {err}
            </div>
          )}

          {/* Descrição */}
          <div>
            <label htmlFor={descriptionId} className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text-2)" }}>
              Descrição <span style={{ color: "var(--db-text-3)" }}>(opcional)</span>
            </label>
            <input id={descriptionId} type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Almoço com cliente"
              className="w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }} />
          </div>

          {/* Categoria */}
          <div>
            <label htmlFor={categoryId} className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text-2)" }}>
              Categoria <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <select id={categoryId} value={category} onChange={e => setCategory(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
              style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}>
              <option value="">— Selecione uma categoria —</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            {category && (
              <div className="mt-2 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: CATEGORY_COLORS[category] || "var(--cat-8)" }} />
                <span className="text-xs font-semibold" style={{ color: CATEGORY_COLORS[category] || "var(--cat-8)" }}>{category}</span>
              </div>
            )}
          </div>

          {/* Centro de custo */}
          <div>
            <label htmlFor={centerId} className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text-2)" }}>
              Centro de custo <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            {centers.length === 0 ? (
              <p className="text-xs px-3 py-2.5 rounded-xl"
                style={{ background: "var(--db-sub)", border: "1px solid var(--db-border)", color: "var(--db-text-3)" }}>
                Crie um centro de custo primeiro.
              </p>
            ) : (
              <select id={centerId} value={center} onChange={e => setCenter(e.target.value)} required
                className="w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
                style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}>
                <option value="">— Selecione um centro —</option>
                {centers.map(cc => <option key={cc.id} value={cc.name}>{cc.name}</option>)}
              </select>
            )}
          </div>

          {/* Valor + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={amountId} className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text-2)" }}>
                Valor (R$) <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input id={amountId} type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0,00" required min="0.01" step="0.01"
                className="w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }} />
            </div>
            <div>
              <label htmlFor={dateId} className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text-2)" }}>
                Data <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input id={dateId} type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }} />
            </div>
          </div>

          {/* Status */}
          <fieldset className="border-0 p-0 m-0 min-w-0">
            <legend className="text-xs font-semibold block mb-2 p-0" style={{ color: "var(--db-text-2)" }}>
              Status <span style={{ color: "var(--danger)" }}>*</span>
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {(["pago", "pendente", "agendado"] as const).map(s => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className="py-2 rounded-xl text-xs font-semibold border-2 transition-all cursor-pointer"
                  style={status === s
                    ? s === "pago"
                      ? { background: "var(--entrada-bg)", borderColor: "var(--entrada-border)", color: "var(--entrada-text)" }
                      : s === "pendente"
                        ? { background: "var(--warn-weak)", borderColor: "var(--warn)", color: "var(--warn)" }
                        : { background: "var(--brand-weak)", borderColor: "var(--brand-weak)", color: "var(--brand)" }
                    : { background: "transparent", borderColor: "var(--db-border)", color: "var(--db-text-2)" }
                  }>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            {status === "pago" && (
              <p className="text-xs mt-2 flex items-center gap-1" style={{ color: "var(--success)" }}>
                <ArrowDownRight size={11} /> Lançado como saída no fluxo de caixa
              </p>
            )}
          </fieldset>

          {/* Ações */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl border cursor-pointer transition-opacity hover:opacity-70"
              style={{ borderColor: "var(--db-border)", color: "var(--db-text-2)" }}>
              Cancelar
            </button>
            <button type="submit" disabled={!canSave || saving || centers.length === 0}
              className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-white flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: "var(--primary)" }}>
              {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
              {editing ? "Atualizar" : "Criar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
// (O antigo componente CategoryAccordion, nunca usado em nenhuma tela, foi
// removido aqui — a listagem por categoria expandida que a página realmente
// usa vive inline mais abaixo, e agora computa o gasto por categoria a
// partir das despesas reais do mês, não de um acumulador armazenado.)

export default function CostCenterPage() {
  // Mês em foco = mês global compartilhado (usePeriod), o mesmo do stepper
  // na Navbar e das demais telas. `selectedDate` (usada só como data padrão
  // ao cadastrar um novo centro) é o dia de hoje quando o mês em foco é o
  // corrente, senão o dia 1º daquele mês.
  const currentMonthKey = monthKeyOf(new Date());
  const currentDateKey = toDateInputValue(new Date());
  const { monthKey: selectedMonth, label: period, isCurrentMonth } = usePeriod();
  const selectedDate = isCurrentMonth ? currentDateKey : `${selectedMonth}-01`;
  const [payingExpenseId, setPayingExpenseId] = useState<string | null>(null);

  const [uid, setUid] = useState<string>("");
  const [user, setUser] = useState<{ displayName: string | null; email: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  // true quando o usuário logado é um membro de equipe sem a categoria
  // "Centro de Custos" liberada — ver lib/accountScope.ts.
  const [blocked, setBlocked] = useState(false);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  // Ramo de atuação (Comércio/E-commerce/Indústria/Serviço) respondido no
  // onboarding — mesmo dado que o Navbar já usa pra esconder "Estoque" de
  // Serviço. Aqui define quais nomes de categoria a conta enxerga.
  const [ramo, setRamo] = useState<string | null>(null);
  const activeCategories = categoriesForSegment(ramo);

  const [showCenterModal, setShowCenterModal] = useState(false);
  const [editingCenter, setEditingCenter] = useState<CostCenter | null>(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<"todos" | "pago" | "pendente" | "agendado">("todos");
  const [savingCenter, setSavingCenter] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "ok" | "err" } | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Confirmation modals
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    type: "delete-center" | "delete-expense" | null;
    id: string;
    loading: boolean;
  }>({ open: false, type: null, id: "", loading: false });

  const activePath = "/costCenter";

  // ── Logout ─────────────────────────────────────────────────────────────────
  async function handleLogout() {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  const { dark } = useTheme();
  useTheme();

  const showToast = (msg: string, type: "ok" | "err" = "ok") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Firestore listeners ────────────────────────────────────────────────────
  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    let unsubCenters: (() => void) | undefined;
    let unsubExpenses: (() => void) | undefined;

    (async () => {
      try {
        const { getFirebase } = await import("@/lib/firebase");
        const { auth, db } = await getFirebase();
        const { onAuthStateChanged } = await import("firebase/auth");
        const { collection, query, where, onSnapshot, doc, getDoc } = await import("firebase/firestore");

        unsubAuth = onAuthStateChanged(auth, async u => {
          if (!u) { window.location.href = "/login"; return; }

          // Resolve de quem são os dados que este login deve ver: o próprio
          // uid (dono) ou o do dono da conta (membro convidado) — ver
          // lib/accountScope.ts. Membro sem "centroCustos" liberado nem
          // chega a assinar as coleções abaixo.
          const scope = await resolveAccountScope(db, u.uid);
          if (!hasPermission(scope, "centroCustos")) {
            setBlocked(true);
            setLoading(false);
            return;
          }
          const ownerUid = scope.ownerUid;

          setUid(ownerUid);
          setUser({ displayName: u.displayName, email: u.email });

          // Ramo do onboarding: cache local primeiro (evita flash), Firestore confirma.
          const cachedRamo = localStorage.getItem(`onboarding_ramo_${ownerUid}`);
          if (cachedRamo) {
            try { setRamo((JSON.parse(cachedRamo) as string[])[0] ?? null); } catch { /* ignora cache inválido */ }
          }
          getDoc(doc(db, "users", ownerUid, "profile", "onboarding"))
            .then(snap => {
              if (!snap.exists()) return;
              const ramoAnswers: string[] = snap.data()?.answers?.ramo || [];
              setRamo(ramoAnswers[0] ?? null);
              localStorage.setItem(`onboarding_ramo_${ownerUid}`, JSON.stringify(ramoAnswers));
            })
            .catch(err => console.error("Erro ao carregar ramo do onboarding:", err));

          unsubCenters?.();
          unsubCenters = onSnapshot(
            query(collection(db, "costCenters"), where("userId", "==", ownerUid)),
            snap => setCostCenters(snap.docs.map(d => ({ id: d.id, ...d.data() } as CostCenter)))
          );

          unsubExpenses?.();
          unsubExpenses = onSnapshot(
            query(collection(db, "expenses"), where("userId", "==", ownerUid)),
            snap => setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() } as Expense)))
          );

          setLoading(false);
        });
      } catch {
        setLoading(false);
      }
    })();

    return () => { unsubAuth?.(); unsubCenters?.(); unsubExpenses?.(); };
  }, []);

  // ── Save center ────────────────────────────────────────────────────────────
  const handleSaveCenter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!uid) return;
    setSavingCenter(true);
    try {
      const fd = new FormData(e.currentTarget);
      const name = (fd.get("name") as string).trim();
      const budgetStr = (fd.get("budget") as string).trim();
      const createdAtStr = (fd.get("createdAt") as string).trim();

      const budget = budgetStr ? parseFloat(budgetStr.replace(",", ".")) : NaN;

      if (!name || !budgetStr || isNaN(budget) || budget <= 0 || !createdAtStr) {
        showToast("Preencha todos os campos corretamente", "err"); return;
      }

      // Data escolhida no calendário do modal — construída a partir das
      // partes (ano/mês/dia) em vez de `new Date(createdAtStr)` pra não
      // sofrer o shift de fuso horário do parser ISO (que assume UTC).
      const [cy, cm, cd] = createdAtStr.split("-").map(Number);
      const createdAt = new Date(cy, cm - 1, cd);
      if (isNaN(createdAt.getTime())) {
        showToast("Data de cadastro inválida", "err"); return;
      }

      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { collection, addDoc, updateDoc, doc } = await import("firebase/firestore");

      if (editingCenter) {
        // Orçamento é sempre editado para o mês selecionado na página —
        // mescla com os outros meses já definidos, nunca sobrescreve todos.
        const budgetsByMonth = { ...(editingCenter.budgetsByMonth ?? {}), [selectedMonth]: budget };
        await updateDoc(doc(db, "costCenters", editingCenter.id), { name, budgetsByMonth, createdAt });
        showToast("Centro atualizado!");
      } else {
        const initialCategories = activeCategories.map((cat, idx) => ({
          id: `cat_${Date.now()}_${idx}`,
          name: cat,
          color: CATEGORY_COLORS[cat],
        }));
        await addDoc(collection(db, "costCenters"), {
          name, budgetsByMonth: { [selectedMonth]: budget },
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          userId: uid, createdAt,
          categories: initialCategories,
        });
        showToast("Centro criado!");
      }
      setShowCenterModal(false);
      setEditingCenter(null);
    } catch (err: any) {
      showToast(err.message || "Erro ao salvar", "err");
    } finally {
      setSavingCenter(false);
    }
  };

  // ── Delete center ──────────────────────────────────────────────────────────
  const handleDeleteCenter = (id: string) => {
    setConfirmModal({ open: true, type: "delete-center", id, loading: false });
  };

  const confirmDeleteCenter = async () => {
    if (confirmModal.type !== "delete-center") return;
    setConfirmModal(prev => ({ ...prev, loading: true }));
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { deleteDoc, doc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "costCenters", confirmModal.id));
      showToast("Centro removido!");
      setConfirmModal({ open: false, type: null, id: "", loading: false });
    } catch (err: any) {
      showToast(err.message || "Erro", "err");
      setConfirmModal(prev => ({ ...prev, loading: false }));
    }
  };

  // ── Delete expense ─────────────────────────────────────────────────────────
  const handleDeleteExpense = (id: string) => {
    setConfirmModal({ open: true, type: "delete-expense", id, loading: false });
  };

  const confirmDeleteExpense = async () => {
    if (confirmModal.type !== "delete-expense") return;
    setConfirmModal(prev => ({ ...prev, loading: true }));
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { deleteDoc, doc, collection, query, where, getDocs } = await import("firebase/firestore");

      // Gasto é derivado das despesas reais — não há mais acumulador em
      // costCenters pra reverter aqui, só remover a despesa e o espelho no cashflow.
      const cfSnap = await getDocs(
        query(collection(db, "users", uid, "cashflow"), where("sourceExpenseId", "==", confirmModal.id))
      );
      await Promise.all(cfSnap.docs.map(d => deleteDoc(doc(db, "users", uid, "cashflow", d.id))));

      await deleteDoc(doc(db, "expenses", confirmModal.id));
      showToast("Despesa removida!");
      setConfirmModal({ open: false, type: null, id: "", loading: false });
    } catch (err: any) {
      console.error("DELETE EXPENSE ERROR:", err.code, err.message, err);
      showToast(err.message || "Erro", "err");
      setConfirmModal(prev => ({ ...prev, loading: false }));
    }
  };

  // ── Baixa rápida (marcar despesa como paga) ─────────────────────────────────
  const handleMarkExpensePaid = async (exp: Expense) => {
    if (!uid || exp.status === "pago") return;
    setPayingExpenseId(exp.id);
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { doc, updateDoc } = await import("firebase/firestore");
      const paidAt = new Date().toISOString().split("T")[0];

      await updateDoc(doc(db, "expenses", exp.id), { status: "pago", paidAt });
      await syncExpenseCashflow(db, uid, exp.id, {
        description: exp.description, category: exp.category, center: exp.center,
        amount: exp.amount, date: exp.date, status: "pago",
      });
      showToast("Despesa paga! Lançada no fluxo de caixa ✓");
    } catch (err: any) {
      showToast(err.message || "Erro ao marcar como paga", "err");
    } finally {
      setPayingExpenseId(null);
    }
  };

  // ── Computed ───────────────────────────────────────────────────────────────
  // Todas as figuras abaixo (KPIs, gráfico, listas) são relativas ao
  // `selectedMonth` navegável — não mais totais vitalícios.
  const filteredExpenses = expenses.filter(exp => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q ||
      exp.category.toLowerCase().includes(q) ||
      exp.center.toLowerCase().includes(q) ||
      (exp.description || "").toLowerCase().includes(q);
    const matchMonth = exp.date.startsWith(selectedMonth);
    return matchSearch && matchMonth && (filterStatus === "todos" || exp.status === filterStatus);
  });

  const totalBudget = costCenters.reduce((s, c) => s + getBudgetForMonth(c, selectedMonth, currentMonthKey), 0);
  const totalSpent = costCenters.reduce((s, c) => s + centerSpentForMonth(expenses, c.name, selectedMonth), 0);
  const utilizationPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;
  const centersForChart = costCenters.map(c => ({
    ...c,
    budget: getBudgetForMonth(c, selectedMonth, currentMonthKey),
    spent: centerSpentForMonth(expenses, c.name, selectedMonth),
  }));

  const kpis = [
    { label: "Orçamento total", value: fmt(totalBudget), change: `${costCenters.length}`, up: true, sub: `${costCenters.length} centros`, icon: Wallet, color: "blue" },
    { label: "Custo real", value: fmt(totalSpent), change: "+3.1%", up: false, sub: "vs. mês anterior", icon: CreditCard, color: "rose" },
    { label: "Disponível", value: fmt(Math.max(totalBudget - totalSpent, 0)), change: `${100 - utilizationPct}%`, up: true, sub: "de margem", icon: TrendingUp, color: "emerald" },
    { label: "Centros ativos", value: String(costCenters.length), change: "+0", up: true, sub: "ativos agora", icon: BarChart2, color: "amber" },
  ];

  if (blocked) return <AccessDenied category="Centro de Custos" />;

  if (loading) return <PageLoader />;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--db-bg)" }}>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 rounded-xl flex items-center gap-2 shadow-xl text-sm font-semibold text-white"
          style={{ background: toast.type === "ok" ? "var(--success)" : "var(--danger)", animation: "slideUp .3s ease" }}>
          {toast.type === "ok" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        open={confirmModal.open}
        title={
          confirmModal.type === "delete-center"
            ? "Deletar centro de custo?"
            : "Deletar despesa?"
        }
        message={
          confirmModal.type === "delete-center"
            ? "Esta ação não pode ser desfeita. O centro de custo e todos os seus dados serão removidos permanentemente."
            : "Esta ação não pode ser desfeita. A despesa será removida permanentemente."
        }
        confirmText="Deletar"
        cancelText="Cancelar"
        isDangerous={true}
        loading={confirmModal.loading}
        onConfirm={
          confirmModal.type === "delete-center"
            ? confirmDeleteCenter
            : confirmDeleteExpense
        }
        onCancel={() => setConfirmModal({ open: false, type: null, id: "", loading: false })}
      />

      <Navbar user={user} activePath={activePath} onLogout={handleLogout} />

      <ExpenseModal
        open={showExpenseModal}
        editing={editingExpense}
        centers={costCenters}
        categories={activeCategories}
        uid={uid}
        onClose={() => { setShowExpenseModal(false); setEditingExpense(null); }}
        onSaved={msg => showToast(msg)}
      />

      <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 overflow-auto pb-20 lg:pb-8">

        {/* Título da página não aparece visualmente aqui (só via item ativo
            da Navbar) — h1 sr-only pra dar um ponto de partida de navegação
            por heading pra quem usa leitor de tela, sem mudar o layout. */}
        <h1 className="sr-only">Centro de custos</h1>

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          {kpis.map((kpi, i) => {
            const c = colorMap[kpi.color];
            return (
              <div key={kpi.label} className="kpi-card rounded-2xl p-4 md:p-5 flex flex-col gap-3" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="flex items-start justify-between">
                  <p className="text-xs font-medium" style={{ color: "var(--db-text-2)" }}>{kpi.label}</p>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: c.icon }}>
                    <kpi.icon size={16} style={{ color: c.text }} />
                  </div>
                </div>
                <div>
                  <p className="text-xl md:text-2xl font-extrabold leading-tight mb-1" style={{ color: "var(--db-text)" }}>{kpi.value}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>
                      {kpi.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}{kpi.change}
                    </span>
                    <span className="text-xs" style={{ color: "var(--db-text-2)" }}>{kpi.sub}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Cost Centers */}
        <div className="chart-card p-4 md:p-6">
          <div className="flex items-start md:items-center justify-between mb-3 gap-2 flex-wrap">
            <div>
              <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Centros de custo</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--db-text-2)" }}>Com detalhamento por categoria</p>
            </div>
            <div className="flex items-center gap-2">
              {/* O mês em foco vem do seletor global na Navbar (‹ {period} ›). */}
              <span className="text-xs font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: "var(--db-sub)", color: "var(--db-text-2)" }}>
                {period}
              </span>
              <button onClick={() => { setEditingCenter(null); setShowCenterModal(true); }}
                className="text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                style={{ background: "var(--primary)" }}>
                <Plus size={14} /> Novo
              </button>
            </div>
          </div>

          {costCenters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart2 size={32} style={{ color: "var(--db-text-2)", marginBottom: "1rem", opacity: 0.4 }} />
              <p style={{ color: "var(--db-text-2)" }}>Nenhum centro de custo criado</p>
              <button onClick={() => setShowCenterModal(true)} className="mt-3 text-xs font-semibold cursor-pointer transition-colors"
                style={{ color: "var(--primary)" }}>
                Criar primeiro centro
              </button>
            </div>
          ) : (
            <>
              <div className="mb-5 p-3 rounded-xl" style={{ background: "var(--db-sub)" }}>
                <BarChart centers={centersForChart} />
              </div>

              {/* Centers com categorias */}
              <div className="space-y-4">
                {costCenters.map(center => {
                  const budgetThisMonth = getBudgetForMonth(center, selectedMonth, currentMonthKey);
                  const spentThisMonth = centerSpentForMonth(expenses, center.name, selectedMonth);
                  const budgetDefined = budgetThisMonth > 0;
                  const pct = budgetThisMonth > 0 ? Math.round((spentThisMonth / budgetThisMonth) * 100) : 0;
                  const remaining = Math.max(budgetThisMonth - spentThisMonth, 0);
                  const over = pct > 100;
                  const warn = pct >= 80 && !over;
                  const isExpanded = expandedCategories.has(center.id);

                  return (
                    <div key={center.id} className="rounded-xl border overflow-hidden transition-all"
                      style={{ borderColor: "var(--db-border)", background: "var(--db-card)" }}>
                      {/* Header do Centro */}
                      <button
                        onClick={() => {
                          const newSet = new Set(expandedCategories);
                          if (newSet.has(center.id)) {
                            newSet.delete(center.id);
                          } else {
                            newSet.add(center.id);
                          }
                          setExpandedCategories(newSet);
                        }}
                        className="w-full px-4 py-4 flex items-center justify-between hover:opacity-80 transition-opacity cursor-pointer border-b"
                        style={{ borderColor: "var(--db-border)" }}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ background: center.color }} />
                          <div className="text-left min-w-0 flex-1">
                            <p className="text-xs font-bold" style={{ color: "var(--db-text)" }}>{center.name}</p>
                            <p className="text-xs mt-1" style={{ color: "var(--db-text-3)" }}>Criado em {formatFullDate(center.createdAt)} • {(center.categories || []).length} categorias</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          {budgetDefined ? (
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex items-center gap-2">
                                <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--db-border)" }}>
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: over ? "var(--danger)" : warn ? "var(--warning)" : "var(--success)" }} />
                                </div>
                                <span className="mono text-xs font-bold px-2 py-0.5 rounded-full"
                                  style={{ background: over ? "var(--saida-bg)" : warn ? "var(--warn-weak)" : "var(--entrada-bg)", color: over ? "var(--saida-text)" : warn ? "var(--warn)" : "var(--entrada-text)" }}>
                                  {pct}%
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs">
                                <span className="mono font-semibold" style={{ color: "var(--db-text)" }}>{fmt(spentThisMonth)}</span>
                                <span style={{ color: "var(--db-text-3)" }}>de</span>
                                <span className="mono font-semibold" style={{ color: "var(--db-text-2)" }}>{fmt(budgetThisMonth)}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <span className="mono text-xs font-bold px-2 py-0.5 rounded-full"
                                style={{ background: "var(--db-sub)", color: "var(--db-text-3)" }}>
                                {fmt(0)}
                              </span>
                              {/* span, não button — já está dentro do botão de expandir/recolher o centro */}
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); setEditingCenter(center); setShowCenterModal(true); }}
                                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); setEditingCenter(center); setShowCenterModal(true); } }}
                                className="text-xs font-semibold cursor-pointer hover:underline"
                                style={{ color: "var(--primary)" }}
                              >
                                Orçamento não definido · Definir
                              </span>
                            </div>
                          )}
                          <ChevronDown
                            size={16}
                            style={{
                              color: "var(--db-text-2)",
                              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                              transition: "transform .2s",
                            }}
                          />
                        </div>
                      </button>

                      {/* Categorias expandidas */}
                      {isExpanded && (
                        <div className="px-4 py-4 space-y-2" style={{ background: "var(--db-sub)" }}>
                          {(center.categories || []).length === 0 ? (
                            <p className="text-xs text-center py-4" style={{ color: "var(--db-text-3)" }}>Nenhuma categoria com lançamentos</p>
                          ) : (
                            (center.categories || []).map(cat => {
                              // Gasto por categoria também é derivado das despesas pagas do mês selecionado.
                              const catExpensesThisMonth = expensesForCenterMonth(expenses, center.name, selectedMonth)
                                .filter(e => e.category === cat.name);
                              const catSpent = catExpensesThisMonth.reduce((s, e) => s + e.amount, 0);
                              const catCount = catExpensesThisMonth.length;
                              return (
                                <div key={cat.id} className="rounded-lg border overflow-hidden transition-all"
                                  style={{ borderColor: "var(--db-border)" }}>
                                  <div className="px-3 py-2.5 flex items-center justify-between" style={{ background: "var(--db-card)" }}>
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cat.color }} />
                                      <div className="text-left min-w-0 flex-1">
                                        <p className="text-xs font-semibold truncate" style={{ color: "var(--db-text)" }}>{cat.name}</p>
                                        <p className="text-xs mt-0.5" style={{ color: "var(--db-text-3)" }}>{catCount} lançamento{catCount !== 1 ? "s" : ""}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className="mono text-xs font-bold" style={{ color: "var(--db-text)" }}>{fmt(catSpent)}</span>
                                      <span className="text-xs font-semibold px-1.5" style={{ color: "var(--db-text-2)" }}>
                                        {budgetThisMonth > 0 ? ((catSpent / budgetThisMonth) * 100).toFixed(1) : "0.0"}%
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      {/* Botões de ação */}
                      <div className="px-4 py-3 flex items-center gap-1.5 border-t" style={{ borderColor: "var(--db-border)", background: "var(--db-card)" }}>
                        <button onClick={() => { setEditingCenter(center); setShowCenterModal(true); }}
                          className="p-1.5 rounded hover:opacity-70 cursor-pointer transition-colors">
                          <Edit2 size={12} style={{ color: "var(--primary)" }} />
                        </button>
                        <button onClick={() => handleDeleteCenter(center.id)}
                          className="p-1.5 rounded hover:opacity-70 cursor-pointer transition-colors">
                          <Trash2 size={12} style={{ color: "var(--danger)" }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Expenses */}
        <div className="chart-card p-4 md:p-6">
          <div className="flex items-start md:items-center justify-between mb-4 gap-2 flex-wrap">
            <div>
              <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Despesas de {period}</h2>
              <p className="text-xs mt-0.5 flex items-center gap-2" style={{ color: "var(--db-text-2)" }}>
                Total: {fmt(filteredExpenses.reduce((s, e) => s + e.amount, 0))}
                <span className="cf-badge">✓ Sincroniza com fluxo de caixa</span>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative hidden sm:flex">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--db-text-2)" }} />
                <input type="text" placeholder="Buscar..." aria-label="Buscar despesas" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs rounded-lg border"
                  style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }} />
              </div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
                className="text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors"
                style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}>
                <option value="todos">Todos</option>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="agendado">Agendado</option>
              </select>
              <button onClick={() => { setEditingExpense(null); setShowExpenseModal(true); }}
                className="text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
                style={{ background: "var(--primary)" }}>
                <Plus size={14} /> Novo
              </button>
            </div>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard size={32} style={{ color: "var(--db-text-2)", marginBottom: "1rem", opacity: 0.4 }} />
              <p style={{ color: "var(--db-text-2)" }}>Nenhuma despesa encontrada</p>
              {costCenters.length === 0 && (
                <p className="text-xs mt-1" style={{ color: "var(--db-text-3)" }}>Crie um centro de custo primeiro</p>
              )}
            </div>
          ) : (
            <>
              {/* Mobile */}
              <div className="md:hidden space-y-2">
                {filteredExpenses.map(exp => (
                  <div key={exp.id} className="p-3 rounded-xl flex items-center justify-between gap-3"
                    style={{ border: "1px solid var(--db-border)" }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate" style={{ color: "var(--db-text)" }}>{exp.description || exp.category}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--db-text-2)" }}>{exp.center} · {exp.date}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="mono text-xs font-bold" style={{ color: "var(--db-text)" }}>{fmt(exp.amount)}</span>
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full badge-${exp.status}`}>
                          {exp.status.charAt(0).toUpperCase() + exp.status.slice(1)}
                        </span>
                        {exp.status === "pago" && <span className="cf-badge">FC✓</span>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {exp.status !== "pago" && (
                        <button onClick={() => handleMarkExpensePaid(exp)} disabled={payingExpenseId === exp.id}
                          title="Marcar como pago" className="p-1 rounded cursor-pointer hover:opacity-70 transition-colors disabled:opacity-50">
                          {payingExpenseId === exp.id
                            ? <Loader size={12} className="animate-spin" style={{ color: "var(--success)" }} />
                            : <Check size={12} style={{ color: "var(--success)" }} />}
                        </button>
                      )}
                      <button onClick={() => { setEditingExpense(exp); setShowExpenseModal(true); }} className="p-1 rounded cursor-pointer hover:opacity-70 transition-colors">
                        <Edit2 size={12} style={{ color: "var(--primary)" }} />
                      </button>
                      <button onClick={() => handleDeleteExpense(exp.id)} className="p-1 rounded cursor-pointer hover:opacity-70 transition-colors">
                        <Trash2 size={12} style={{ color: "var(--danger)" }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "var(--db-border)" }}>
                      {["Descrição", "Categoria", "Centro", "Valor", "Data", "Status", ""].map(h => (
                        <th key={h} className="text-left text-xs font-semibold pb-3 pr-4 whitespace-nowrap"
                          style={{ color: "var(--db-text-2)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map(exp => (
                      <tr key={exp.id} className="expense-row">
                        <td className="py-3 pr-4 max-w-[150px]">
                          <p className="text-xs font-semibold truncate" style={{ color: "var(--db-text)" }}>{exp.description || "—"}</p>
                        </td>
                        <td className="py-3 pr-4"><span className="text-xs" style={{ color: "var(--db-text-2)" }}>{exp.category}</span></td>
                        <td className="py-3 pr-4"><span className="text-xs" style={{ color: "var(--db-text-2)" }}>{exp.center}</span></td>
                        <td className="py-3 pr-4"><span className="mono text-xs font-bold" style={{ color: "var(--db-text)" }}>{fmt(exp.amount)}</span></td>
                        <td className="py-3 pr-4"><span className="text-xs" style={{ color: "var(--db-text-2)" }}>{exp.date}</span></td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full badge-${exp.status}`}>
                              {exp.status.charAt(0).toUpperCase() + exp.status.slice(1)}
                            </span>
                            {exp.status === "pago" && <span className="cf-badge" title="Lançado no fluxo de caixa">FC ✓</span>}
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-1.5">
                            {exp.status !== "pago" && (
                              <button onClick={() => handleMarkExpensePaid(exp)} disabled={payingExpenseId === exp.id}
                                title="Marcar como pago" className="p-1 rounded hover:opacity-70 cursor-pointer transition-colors disabled:opacity-50">
                                {payingExpenseId === exp.id
                                  ? <Loader size={12} className="animate-spin" style={{ color: "var(--success)" }} />
                                  : <Check size={12} style={{ color: "var(--success)" }} />}
                              </button>
                            )}
                            <button onClick={() => { setEditingExpense(exp); setShowExpenseModal(true); }}
                              className="p-1 rounded hover:opacity-70 cursor-pointer transition-colors">
                              <Edit2 size={12} style={{ color: "var(--primary)" }} />
                            </button>
                            <button onClick={() => handleDeleteExpense(exp.id)}
                              className="p-1 rounded hover:opacity-70 cursor-pointer transition-colors">
                              <Trash2 size={12} style={{ color: "var(--danger)" }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Center Modal */}
      {showCenterModal && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-999"
          style={{ background: "rgba(0,0,0,0.42)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}>
          <div className="w-full max-w-md rounded-2xl border shadow-2xl"
            style={{ background: "var(--db-card)", borderColor: "var(--db-border)" }}>
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: "var(--db-border)" }}>
              <h3 className="font-bold" style={{ color: "var(--db-text)" }}>
                {editingCenter ? "Editar centro" : "Novo centro de custo"}
              </h3>
              <button onClick={() => { setShowCenterModal(false); setEditingCenter(null); }} className="p-1.5 rounded-lg cursor-pointer hover:opacity-70 transition-opacity">
                <X size={16} style={{ color: "var(--db-text-2)" }} />
              </button>
            </div>
            <form onSubmit={handleSaveCenter} className="p-5 space-y-4">
              {[
                { name: "name", label: "Nome", placeholder: "Ex: Operações", type: "text", defaultValue: editingCenter?.name, min: undefined, step: undefined },
                { name: "budget", label: `Orçamento de ${period} (R$)`, placeholder: "10000", type: "number", defaultValue: editingCenter ? (getBudgetForMonth(editingCenter, selectedMonth, currentMonthKey) || undefined) : undefined, min: "1", step: "0.01" },
                { name: "createdAt", label: "Data de cadastro", placeholder: undefined, type: "date", defaultValue: editingCenter ? toDateInputValue(editingCenter.createdAt) : selectedDate, min: undefined, step: undefined },
              ].map(f => (
                <div key={f.name}>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text-2)" }}>{f.label}</label>
                  <input type={f.type} name={f.name} defaultValue={f.defaultValue} placeholder={f.placeholder}
                    required min={f.min} step={f.step}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }} />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setShowCenterModal(false); setEditingCenter(null); }}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl border cursor-pointer transition-opacity hover:opacity-70"
                  style={{ borderColor: "var(--db-border)", color: "var(--db-text-2)" }}>
                  Cancelar
                </button>
                <button type="submit" disabled={savingCenter}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-white flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                  style={{ background: "var(--primary)" }}>
                  {savingCenter ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                  {editingCenter ? "Atualizar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}