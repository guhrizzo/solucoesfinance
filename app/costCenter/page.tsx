"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface CostCenter {
  id: string;
  name: string;
  budget: number;
  spent: number;
  employees: number;
  color: string;
  userId: string;
  createdAt: any;
  categories?: Array<{ id: string; name: string; spent: number; color: string }>;
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
}

// ─── Constantes e Helpers ─────────────────────────────────────────────────────

const fmt = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

const COLORS = [
  "#1565c0", "#42a5f5", "#90caf9", "#bbdefb",
  "#64b5f6", "#2196f3", "#1e88e5", "#1976d2",
];

const EXPENSE_CATEGORIES = [
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

const CATEGORY_COLORS: Record<string, string> = {
  "Alimentação": "#f97316",
  "Transporte": "#06b6d4",
  "Hospedagem": "#ec4899",
  "Comunicação": "#8b5cf6",
  "Equipamentos": "#10b981",
  "Consultoria": "#3b82f6",
  "Treinamento": "#f59e0b",
  "Marketing": "#ef4444",
  "Utilities": "#6366f1",
  "Manutenção": "#14b8a6",
  "Outros": "#6b7280",
};

const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
  blue: { bg: "rgba(59, 130, 246, 0.1)", text: "#42a5f5", icon: "rgba(59, 130, 246, 0.15)" },
  rose: { bg: "rgba(244, 63, 94, 0.08)", text: "#fb7185", icon: "rgba(244, 63, 94, 0.12)" },
  emerald: { bg: "rgba(16, 185, 129, 0.08)", text: "#34d399", icon: "rgba(16, 185, 129, 0.12)" },
  amber: { bg: "rgba(245, 158, 11, 0.08)", text: "#fbbf24", icon: "rgba(245, 158, 11, 0.12)" },
};

function mapCategoryToCashflow(cat: string): string {
  const l = cat.toLowerCase();
  if (l.includes("almoço") || l.includes("almoco") || l.includes("alimento") || l.includes("refeição") || l.includes("refeicao") || l.includes("restaurante")) return "Outros gastos";
  if (l.includes("uber") || l.includes("táxi") || l.includes("taxi") || l.includes("combustível") || l.includes("combustivel") || l.includes("passagem")) return "Outros gastos";
  if (l.includes("hotel") || l.includes("hospedagem") || l.includes("hostel") || l.includes("airbnb")) return "Outros gastos";
  if (l.includes("salário") || l.includes("salario") || l.includes("folha")) return "Folha de pagamento";
  if (l.includes("aluguel")) return "Aluguel";
  if (l.includes("fornec") || l.includes("compra") || l.includes("mercadoria")) return "Fornecedores";
  if (l.includes("imposto") || l.includes("tributo")) return "Impostos";
  if (l.includes("marketing") || l.includes("anúncio") || l.includes("publicidade")) return "Marketing";
  if (l.includes("ti") || l.includes("softw") || l.includes("assinatura")) return "TI / Software";
  return "Outros gastos";
}

// ─── SVG Bar Chart ─────────────────────────────────────────────────────────────

function BarChart({ centers }: { centers: CostCenter[] }) {
  if (centers.length === 0) return null;
  const maxVal = Math.max(...centers.map(c => Math.max(c.budget, c.spent, 1)));
  const W = Math.max(centers.length * 90 + 60, 320);

  return (
    <div style={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} 180`} style={{ width: "100%", minWidth: W, height: 180 }}>
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
          >
            <X size={16} style={{ color: "var(--db-text2)" }} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-sm" style={{ color: "var(--db-text2)" }}>
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
            style={{ borderColor: "var(--db-border)", color: "var(--db-text2)" }}
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
  uid: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}

function ExpenseModal({ open, editing, centers, uid, onClose, onSaved }: ExpenseModalProps) {
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [center, setCenter] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<"pago" | "pendente" | "agendado">("pago");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

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
      const {
        collection, addDoc, updateDoc, doc,
        query, where, getDocs, deleteDoc,
      } = await import("firebase/firestore");

      if (editing) {
        // ── EDITAR DESPESA ──────────────────────────────────────────────

        // 1. Atualizar documento de despesa
        await updateDoc(doc(db, "expenses", editing.id), {
          description, category, center, amount: parsedAmount, date, status,
        });

        // 2. Remover gasto anterior do centro/categoria (se mudou)
        if (editing.category !== category || editing.center !== center) {
          const oldCenterSnap = await getDocs(
            query(
              collection(db, "costCenters"),
              where("name", "==", editing.center),
              where("userId", "==", uid),
            )
          );
          if (!oldCenterSnap.empty) {
            const centerData = oldCenterSnap.docs[0].data();
            const categories = centerData.categories || [];
            const updatedCategories = categories.map((cat: any) =>
              cat.name === editing.category
                ? { ...cat, spent: Math.max(0, cat.spent - editing.amount) }
                : cat
            );
            const newSpent = updatedCategories.reduce((sum: number, cat: any) => sum + cat.spent, 0);
            await updateDoc(doc(db, "costCenters", oldCenterSnap.docs[0].id), {
              spent: newSpent,
              categories: updatedCategories,
            });
          }
        }

        // 3. Adicionar novo gasto no centro/categoria
        const newCenterSnap = await getDocs(
          query(
            collection(db, "costCenters"),
            where("name", "==", center),
            where("userId", "==", uid),
          )
        );
        if (!newCenterSnap.empty) {
          const centerData = newCenterSnap.docs[0].data();
          const categories = centerData.categories || [];
          const existingCat = categories.find((cat: any) => cat.name === category);
          let updatedCategories;
          if (existingCat) {
            updatedCategories = categories.map((cat: any) =>
              cat.name === category ? { ...cat, spent: cat.spent + parsedAmount } : cat
            );
          } else {
            updatedCategories = [
              ...categories,
              { id: `cat_${Date.now()}`, name: category, spent: parsedAmount, color: CATEGORY_COLORS[category] || "#6b7280" },
            ];
          }
          const newSpent = updatedCategories.reduce((sum: number, cat: any) => sum + cat.spent, 0);
          await updateDoc(doc(db, "costCenters", newCenterSnap.docs[0].id), {
            spent: newSpent,
            categories: updatedCategories,
          });
        }

        // 4. Sincronizar com cashflow
        const cfSnap = await getDocs(
          query(collection(db, "users", uid, "cashflow"), where("sourceExpenseId", "==", editing.id))
        );
        if (status === "pago") {
          const cfData = {
            type: "saida",
            description: description || `${category} – ${center}`,
            category: mapCategoryToCashflow(category),
            amount: parsedAmount,
            date,
            note: `Centro: ${center} | ${category}`,
            sourceExpenseId: editing.id,
            createdAt: Date.now(),
          };
          if (!cfSnap.empty) {
            await updateDoc(doc(db, "users", uid, "cashflow", cfSnap.docs[0].id), cfData);
          } else {
            await addDoc(collection(db, "users", uid, "cashflow"), cfData);
          }
        } else {
          await Promise.all(cfSnap.docs.map(d => deleteDoc(doc(db, "users", uid, "cashflow", d.id))));
        }

        onSaved("Despesa atualizada!");

      } else {
        // ── CRIAR NOVA DESPESA ──────────────────────────────────────────

        // 1. Criar documento de despesa
        const expRef = await addDoc(collection(db, "expenses"), {
          description,
          category,
          center,
          amount: parsedAmount,
          date,
          status,
          userId: uid,
          createdAt: new Date(),
        });

        // 2. Atualizar centro de custo com a categoria
        const centerSnap = await getDocs(
          query(
            collection(db, "costCenters"),
            where("name", "==", center),
            where("userId", "==", uid),
          )
        );
        if (!centerSnap.empty) {
          const centerData = centerSnap.docs[0].data();
          const categories = centerData.categories || [];
          const existingCat = categories.find((cat: any) => cat.name === category);
          let updatedCategories;
          if (existingCat) {
            updatedCategories = categories.map((cat: any) =>
              cat.name === category ? { ...cat, spent: cat.spent + parsedAmount } : cat
            );
          } else {
            updatedCategories = [
              ...categories,
              { id: `cat_${Date.now()}`, name: category, spent: parsedAmount, color: CATEGORY_COLORS[category] || "#6b7280" },
            ];
          }
          const newSpent = updatedCategories.reduce((sum: number, cat: any) => sum + cat.spent, 0);
          await updateDoc(doc(db, "costCenters", centerSnap.docs[0].id), {
            spent: newSpent,
            categories: updatedCategories,
          });
        }

        // 3. Sincronizar com cashflow quando "pago"
        if (status === "pago") {
          await addDoc(collection(db, "users", uid, "cashflow"), {
            type: "saida",
            description: description || `${category} – ${center}`,
            category: mapCategoryToCashflow(category),
            amount: parsedAmount,
            date,
            note: `Centro: ${center} | ${category}`,
            sourceExpenseId: expRef.id,
            createdAt: Date.now(),
          });
        }

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
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70 transition-opacity cursor-pointer">
            <X size={16} style={{ color: "var(--db-text2)" }} />
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
            <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text2)" }}>
              Descrição <span style={{ color: "var(--db-text3)" }}>(opcional)</span>
            </label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Almoço com cliente"
              className="w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500"
              style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }} />
          </div>

          {/* Categoria */}
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text2)" }}>
              Categoria <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <select value={category} onChange={e => setCategory(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors"
              style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}>
              <option value="">— Selecione uma categoria —</option>
              {EXPENSE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
            {category && (
              <div className="mt-2 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ background: CATEGORY_COLORS[category] || "#6b7280" }} />
                <span className="text-xs font-semibold" style={{ color: CATEGORY_COLORS[category] || "#6b7280" }}>{category}</span>
              </div>
            )}
          </div>

          {/* Centro de custo */}
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text2)" }}>
              Centro de custo <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            {centers.length === 0 ? (
              <p className="text-xs px-3 py-2.5 rounded-xl"
                style={{ background: "var(--db-sub)", border: "1px solid var(--db-border)", color: "var(--db-text3)" }}>
                Crie um centro de custo primeiro.
              </p>
            ) : (
              <select value={center} onChange={e => setCenter(e.target.value)} required
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
              <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text2)" }}>
                Valor (R$) <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0,00" required min="0.01" step="0.01"
                className="w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }} />
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text2)" }}>
                Data <span style={{ color: "var(--danger)" }}>*</span>
              </label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required
                className="w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }} />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-xs font-semibold block mb-2" style={{ color: "var(--db-text2)" }}>
              Status <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["pago", "pendente", "agendado"] as const).map(s => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className="py-2 rounded-xl text-xs font-semibold border-2 transition-all cursor-pointer"
                  style={status === s
                    ? s === "pago"
                      ? { background: "var(--entrada-bg)", borderColor: "var(--entrada-border)", color: "var(--entrada-text)" }
                      : s === "pendente"
                        ? { background: "#fef9c3", borderColor: "#fde047", color: "#b45309" }
                        : { background: "#dbeafe", borderColor: "#93c5fd", color: "#1d4ed8" }
                    : { background: "transparent", borderColor: "var(--db-border)", color: "var(--db-text2)" }
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
          </div>

          {/* Ações */}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl border cursor-pointer transition-opacity hover:opacity-70"
              style={{ borderColor: "var(--db-border)", color: "var(--db-text2)" }}>
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

// ─── Accordion de Categorias ───────────────────────────────────────────────────

interface CategoryAccordionProps {
  center: CostCenter;
  expanded: boolean;
  onToggle: () => void;
  expenses: Expense[];
}

function CategoryAccordion({ center, expanded, onToggle, expenses }: CategoryAccordionProps) {
  const categories = center.categories || [];
  const centerExpenses = expenses.filter(e => e.center === center.name);

  return (
    <div className="space-y-2">
      {categories.map(cat => {
        const catCount = centerExpenses.filter(e => e.category === cat.name).length;
        return (
          <div
            key={cat.id}
            className="rounded-xl border overflow-hidden transition-all"
            style={{ borderColor: "var(--db-border)" }}
          >
            <button
              onClick={onToggle}
              className="w-full px-4 py-3 flex items-center justify-between hover:opacity-80 transition-opacity cursor-pointer"
              style={{ background: "var(--db-sub)" }}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color }} />
                <div className="text-left min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate" style={{ color: "var(--db-text)" }}>{cat.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--db-text3)" }}>{catCount} lançamento{catCount !== 1 ? "s" : ""}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="mono text-xs font-bold" style={{ color: "var(--db-text)" }}>{fmt(cat.spent)}</span>
                <span className="text-xs font-semibold px-1.5" style={{ color: "var(--db-text2)" }}>
                  {((cat.spent / center.budget) * 100).toFixed(1)}%
                </span>
                <ChevronDown
                  size={14}
                  style={{
                    color: "var(--db-text2)",
                    transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform .2s",
                  }}
                />
              </div>
            </button>

            {expanded && (
              <div
                className="border-t px-4 py-3 space-y-2 max-h-[300px] overflow-y-auto"
                style={{ borderColor: "var(--db-border)", background: "var(--db-card)" }}
              >
                {centerExpenses.filter(e => e.category === cat.name).length > 0 ? (
                  centerExpenses.filter(e => e.category === cat.name).map(exp => (
                    <div key={exp.id} className="flex items-center justify-between py-2 border-b last:border-b-0"
                      style={{ borderColor: "var(--db-border)" }}>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate" style={{ color: "var(--db-text)" }}>
                          {exp.description || "—"}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--db-text3)" }}>{exp.date}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="mono text-xs font-bold" style={{ color: "var(--db-text)" }}>{fmt(exp.amount)}</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full badge-${exp.status}`}>
                          {exp.status.charAt(0).toUpperCase() + exp.status.slice(1)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-center py-4" style={{ color: "var(--db-text3)" }}>Nenhum lançamento</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CostCenterPage() {
  const [period] = useState("Abr 2025");
  const [uid, setUid] = useState<string>("");
  const [user, setUser] = useState<{ displayName: string | null; email: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

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
        const { collection, query, where, onSnapshot } = await import("firebase/firestore");

        unsubAuth = onAuthStateChanged(auth, u => {
          if (!u) { window.location.href = "/login"; return; }
          setUid(u.uid);
          setUser({ displayName: u.displayName, email: u.email });

          unsubCenters?.();
          unsubCenters = onSnapshot(
            query(collection(db, "costCenters"), where("userId", "==", u.uid)),
            snap => setCostCenters(snap.docs.map(d => ({ id: d.id, ...d.data() } as CostCenter)))
          );

          unsubExpenses?.();
          unsubExpenses = onSnapshot(
            query(collection(db, "expenses"), where("userId", "==", u.uid)),
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
      const employeesStr = (fd.get("employees") as string).trim();
      
      const budget = budgetStr ? parseFloat(budgetStr.replace(",", ".")) : NaN;
      const employees = employeesStr ? parseInt(employeesStr) : NaN;

      if (!name || !budgetStr || !employeesStr || isNaN(budget) || budget <= 0 || isNaN(employees) || employees <= 0) {
        showToast("Preencha todos os campos corretamente", "err"); return;
      }

      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { collection, addDoc, updateDoc, doc } = await import("firebase/firestore");

      if (editingCenter) {
        await updateDoc(doc(db, "costCenters", editingCenter.id), { name, budget, employees });
        showToast("Centro atualizado!");
      } else {
        const initialCategories = EXPENSE_CATEGORIES.map((cat, idx) => ({
          id: `cat_${Date.now()}_${idx}`,
          name: cat,
          spent: 0,
          color: CATEGORY_COLORS[cat],
        }));
        await addDoc(collection(db, "costCenters"), {
          name, budget, spent: 0, employees,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          userId: uid, createdAt: new Date(),
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
      const { deleteDoc, doc, collection, query, where, getDocs, updateDoc } = await import("firebase/firestore");

      const exp = expenses.find(e => e.id === confirmModal.id);
      if (exp) {
        const centerSnap = await getDocs(
          query(
            collection(db, "costCenters"),
            where("name", "==", exp.center),
            where("userId", "==", uid),
          )
        );

        if (!centerSnap.empty) {
          const centerData = centerSnap.docs[0].data();
          const categories = centerData.categories || [];
          const updatedCategories = categories.map((cat: any) =>
            cat.name === exp.category
              ? { ...cat, spent: Math.max(0, cat.spent - exp.amount) }
              : cat
          );
          const newSpent = updatedCategories.reduce((sum: number, cat: any) => sum + cat.spent, 0);
          await updateDoc(doc(db, "costCenters", centerSnap.docs[0].id), {
            spent: newSpent,
            categories: updatedCategories,
          });
        }

        // Remove entrada no cashflow vinculada
        const cfSnap = await getDocs(
          query(collection(db, "users", uid, "cashflow"), where("sourceExpenseId", "==", confirmModal.id))
        );
        await Promise.all(cfSnap.docs.map(d => deleteDoc(doc(db, "users", uid, "cashflow", d.id))));
      }

      await deleteDoc(doc(db, "expenses", confirmModal.id));
      showToast("Despesa removida!");
      setConfirmModal({ open: false, type: null, id: "", loading: false });
    } catch (err: any) {
      console.error("DELETE EXPENSE ERROR:", err.code, err.message, err);
      showToast(err.message || "Erro", "err");
      setConfirmModal(prev => ({ ...prev, loading: false }));
    }
  };

  // ── Computed ───────────────────────────────────────────────────────────────
  const filteredExpenses = expenses.filter(exp => {
    const q = searchTerm.toLowerCase();
    const matchSearch = !q ||
      exp.category.toLowerCase().includes(q) ||
      exp.center.toLowerCase().includes(q) ||
      (exp.description || "").toLowerCase().includes(q);
    return matchSearch && (filterStatus === "todos" || exp.status === filterStatus);
  });

  const totalBudget = costCenters.reduce((s, c) => s + c.budget, 0);
  const totalSpent = costCenters.reduce((s, c) => s + c.spent, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const utilizationPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  const today = new Date();
  const monthProgress = Math.max(today.getDate() / new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate(), 0.01);

  const kpis = [
    { label: "Orçamento total", value: fmt(totalBudget), change: `${costCenters.length}`, up: true, sub: `${costCenters.length} centros`, icon: Wallet, color: "blue" },
    { label: "Custo real", value: fmt(totalExpenses), change: "+3.1%", up: false, sub: "vs. mês anterior", icon: CreditCard, color: "rose" },
    { label: "Disponível", value: fmt(Math.max(totalBudget - totalSpent, 0)), change: `${100 - utilizationPct}%`, up: true, sub: "de margem", icon: TrendingUp, color: "emerald" },
    { label: "Centros ativos", value: String(costCenters.length), change: "+0", up: true, sub: "ativos agora", icon: BarChart2, color: "amber" },
  ];

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--db-bg)" }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-sm" style={{ color: "var(--db-text2)" }}>Carregando...</p>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--db-bg)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, body { font-family: 'Sora', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        * { transition: background-color .2s, border-color .2s, color .15s; }
        button, a, input, select { transition: background-color .15s, border-color .15s, color .1s, opacity .15s !important; }
        .kpi-card { background:var(--db-card); border:1px solid var(--db-border); box-shadow:0 1px 3px rgba(13,34,71,0.06),0 4px 16px rgba(13,34,71,0.04); animation:slideUp 0.5s ease both; }
        .chart-card { background:var(--db-card); border:1px solid var(--db-border); box-shadow:0 1px 3px rgba(13,34,71,0.06),0 4px 16px rgba(13,34,71,0.04); border-radius:1rem; animation:slideUp 0.5s 0.2s ease both; }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .expense-row { transition:background 0.15s; border-bottom:1px solid var(--db-border); }
        .expense-row:last-child { border-bottom:none; }
        .expense-row:hover { background:var(--db-hover); }
        .badge-pago     { background:var(--entrada-bg); color:var(--entrada-text); }
        .badge-pendente { background:#fef9c3; color:#b45309; }
        .badge-agendado { background:#dbeafe; color:#1d4ed8; }
        .cf-badge { background:rgba(16,185,129,0.12); color:var(--success); font-size:10px; padding:2px 7px; border-radius:999px; font-weight:600; }
        .atbl th { font-size:11px; font-weight:600; color:var(--db-text); padding:8px 12px; text-align:left; border-bottom:1px solid var(--db-border); white-space:nowrap; }
        .atbl td { font-size:12px; padding:10px 12px; border-bottom:1px solid var(--db-border); }
        .atbl tr:last-child td { border-bottom:none; }
        .atbl tr:hover td { background:var(--db-hover); }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-thumb { background:var(--db-border); border-radius:4px; }
      `}</style>

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

      <Navbar user={user} period={period} activePath={activePath} onLogout={handleLogout} />

      <ExpenseModal
        open={showExpenseModal}
        editing={editingExpense}
        centers={costCenters}
        uid={uid}
        onClose={() => { setShowExpenseModal(false); setEditingExpense(null); }}
        onSaved={msg => showToast(msg)}
      />

      <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 overflow-auto pb-20 lg:pb-8">

        {/* KPIs */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          {kpis.map((kpi, i) => {
            const c = colorMap[kpi.color];
            return (
              <div key={kpi.label} className="kpi-card rounded-2xl p-4 md:p-5 flex flex-col gap-3" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="flex items-start justify-between">
                  <p className="text-xs font-medium" style={{ color: "var(--db-text2)" }}>{kpi.label}</p>
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
                    <span className="text-xs" style={{ color: "var(--db-text2)" }}>{kpi.sub}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Cost Centers */}
        <div className="chart-card p-4 md:p-6">
          <div className="flex items-start md:items-center justify-between mb-5 gap-2">
            <div>
              <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Centros de custo</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--db-text2)" }}>Com detalhamento por categoria</p>
            </div>
            <button onClick={() => { setEditingCenter(null); setShowCenterModal(true); }}
              className="text-white text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1 cursor-pointer transition-colors"
              style={{ background: "var(--primary)" }}>
              <Plus size={14} /> Novo
            </button>
          </div>

          {costCenters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart2 size={32} style={{ color: "var(--db-text2)", marginBottom: "1rem", opacity: 0.4 }} />
              <p style={{ color: "var(--db-text2)" }}>Nenhum centro de custo criado</p>
              <button onClick={() => setShowCenterModal(true)} className="mt-3 text-xs font-semibold cursor-pointer transition-colors"
                style={{ color: "var(--primary)" }}>
                Criar primeiro centro
              </button>
            </div>
          ) : (
            <>
              <div className="mb-5 p-3 rounded-xl" style={{ background: "var(--db-sub)" }}>
                <BarChart centers={costCenters} />
              </div>

              {/* Centers com categorias */}
              <div className="space-y-4">
                {costCenters.map(center => {
                  const pct = center.budget > 0 ? Math.round((center.spent / center.budget) * 100) : 0;
                  const remaining = Math.max(center.budget - center.spent, 0);
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
                            <p className="text-xs mt-1" style={{ color: "var(--db-text3)" }}>{center.employees} colab. • {(center.categories || []).length} categorias</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--db-border)" }}>
                                <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: over ? "var(--danger)" : warn ? "var(--warning)" : "var(--success)" }} />
                              </div>
                              <span className="mono text-xs font-bold px-2 py-0.5 rounded-full"
                                style={{ background: over ? "var(--saida-bg)" : warn ? "#fef9c3" : "var(--entrada-bg)", color: over ? "var(--saida-text)" : warn ? "#b45309" : "var(--entrada-text)" }}>
                                {pct}%
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="mono font-semibold" style={{ color: "var(--db-text)" }}>{fmt(center.spent)}</span>
                              <span style={{ color: "var(--db-text3)" }}>de</span>
                              <span className="mono font-semibold" style={{ color: "var(--db-text2)" }}>{fmt(center.budget)}</span>
                            </div>
                          </div>
                          <ChevronDown
                            size={16}
                            style={{
                              color: "var(--db-text2)",
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
                            <p className="text-xs text-center py-4" style={{ color: "var(--db-text3)" }}>Nenhuma categoria com lançamentos</p>
                          ) : (
                            (center.categories || []).map(cat => {
                              const catCount = expenses.filter(e => e.center === center.name && e.category === cat.name).length;
                              return (
                                <div key={cat.id} className="rounded-lg border overflow-hidden transition-all"
                                  style={{ borderColor: "var(--db-border)" }}>
                                  <div className="px-3 py-2.5 flex items-center justify-between" style={{ background: "var(--db-card)" }}>
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cat.color }} />
                                      <div className="text-left min-w-0 flex-1">
                                        <p className="text-xs font-semibold truncate" style={{ color: "var(--db-text)" }}>{cat.name}</p>
                                        <p className="text-xs mt-0.5" style={{ color: "var(--db-text3)" }}>{catCount} lançamento{catCount !== 1 ? "s" : ""}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                      <span className="mono text-xs font-bold" style={{ color: "var(--db-text)" }}>{fmt(cat.spent)}</span>
                                      <span className="text-xs font-semibold px-1.5" style={{ color: "var(--db-text2)" }}>
                                        {((cat.spent / center.budget) * 100).toFixed(1)}%
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
              <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Despesas</h2>
              <p className="text-xs mt-0.5 flex items-center gap-2" style={{ color: "var(--db-text2)" }}>
                Total: {fmt(totalExpenses)}
                <span className="cf-badge">✓ Sincroniza com fluxo de caixa</span>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative hidden sm:flex">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--db-text2)" }} />
                <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
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
              <CreditCard size={32} style={{ color: "var(--db-text2)", marginBottom: "1rem", opacity: 0.4 }} />
              <p style={{ color: "var(--db-text2)" }}>Nenhuma despesa encontrada</p>
              {costCenters.length === 0 && (
                <p className="text-xs mt-1" style={{ color: "var(--db-text3)" }}>Crie um centro de custo primeiro</p>
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
                      <p className="text-xs mt-0.5" style={{ color: "var(--db-text2)" }}>{exp.center} · {exp.date}</p>
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
                          style={{ color: "var(--db-text2)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map(exp => (
                      <tr key={exp.id} className="expense-row">
                        <td className="py-3 pr-4 max-w-[150px]">
                          <p className="text-xs font-semibold truncate" style={{ color: "var(--db-text)" }}>{exp.description || "—"}</p>
                        </td>
                        <td className="py-3 pr-4"><span className="text-xs" style={{ color: "var(--db-text2)" }}>{exp.category}</span></td>
                        <td className="py-3 pr-4"><span className="text-xs" style={{ color: "var(--db-text2)" }}>{exp.center}</span></td>
                        <td className="py-3 pr-4"><span className="mono text-xs font-bold" style={{ color: "var(--db-text)" }}>{fmt(exp.amount)}</span></td>
                        <td className="py-3 pr-4"><span className="text-xs" style={{ color: "var(--db-text2)" }}>{exp.date}</span></td>
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
                <X size={16} style={{ color: "var(--db-text2)" }} />
              </button>
            </div>
            <form onSubmit={handleSaveCenter} className="p-5 space-y-4">
              {[
                { name: "name", label: "Nome", placeholder: "Ex: Operações", type: "text", defaultValue: editingCenter?.name, min: undefined, step: undefined },
                { name: "budget", label: "Orçamento (R$)", placeholder: "10000", type: "number", defaultValue: editingCenter?.budget, min: "1", step: "0.01" },
                { name: "employees", label: "Colaboradores", placeholder: "5", type: "number", defaultValue: editingCenter?.employees, min: "1", step: undefined },
              ].map(f => (
                <div key={f.name}>
                  <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--db-text2)" }}>{f.label}</label>
                  <input type={f.type} name={f.name} defaultValue={f.defaultValue} placeholder={f.placeholder}
                    required min={f.min} step={f.step}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }} />
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setShowCenterModal(false); setEditingCenter(null); }}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl border cursor-pointer transition-opacity hover:opacity-70"
                  style={{ borderColor: "var(--db-border)", color: "var(--db-text2)" }}>
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