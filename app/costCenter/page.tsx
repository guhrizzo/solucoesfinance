"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  Wallet,
  BarChart2,
  Plus,
  Edit2,
  Trash2,
  X,
  Check,
  AlertCircle,
  MoreHorizontal,
  Filter,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  Loader,
  Search,
} from "lucide-react";
import Navbar from "../components/Navbar";
import { useTheme } from "@/app/hooks/useTheme";

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
}

interface Expense {
  id: string;
  category: string;
  center: string;
  amount: number;
  date: string;
  status: "pago" | "pendente" | "agendado";
  userId: string;
  createdAt: any;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;

const colors = [
  "#1565c0", "#42a5f5", "#90caf9", "#bbdefb",
  "#64b5f6", "#2196f3", "#1e88e5", "#1976d2"
];

const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
  blue:    { bg: "rgba(21,101,192,0.1)",  text: "#42a5f5", icon: "rgba(21,101,192,0.15)" },
  rose:    { bg: "rgba(244,63,94,0.08)",  text: "#fb7185", icon: "rgba(244,63,94,0.12)" },
  emerald: { bg: "rgba(16,185,129,0.08)", text: "#34d399", icon: "rgba(16,185,129,0.12)" },
  amber:   { bg: "rgba(245,158,11,0.08)", text: "#fbbf24", icon: "rgba(245,158,11,0.12)" },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CostCenter() {
  const [period] = useState("Nov 2024");
  const [user, setUser] = useState<{ displayName: string | null; email: string | null; uid?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showCenterModal, setShowCenterModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingCenter, setEditingCenter] = useState<CostCenter | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filterStatus, setFilterStatus] = useState<"todos" | "pago" | "pendente" | "agendado">("todos");
  const activePath = "/costCenter";

  const { dark } = useTheme();

  const theme = dark ? {
    "--db-bg": "#0d1117",
    "--db-card": "#1c2230",
    "--db-border": "#2a3548",
    "--db-text": "#e2e8f0",
    "--db-text2": "#8899b4",
    "--db-text3": "#4a5568",
    "--db-hover": "#1e2a3a",
    "--db-sub": "#131922",
    "--db-divider": "#2a3548",
  } : {
    "--db-bg": "#f8fafc",
    "--db-card": "#ffffff",
    "--db-border": "#e8eef8",
    "--db-text": "#0f1f40",
    "--db-text2": "#64748b",
    "--db-text3": "#94a3b8",
    "--db-hover": "#f8faff",
    "--db-sub": "#f1f5fb",
    "--db-divider": "#f1f5fb",
  };

  const svgText = dark ? "#8899b4" : "#94a3b8";
  const svgTitle = dark ? "#e2e8f0" : "#0d2247";

  // ─── Load data from Firestore ─────────────────────────────────────────────────
  useEffect(() => {
  let unsubCenters: (() => void) | undefined;
  let unsubExpenses: (() => void) | undefined;
  let unsubAuth: (() => void) | undefined;

  (async () => {
    try {
      const { getFirebase } = await import("../../lib/firebase");
      const { auth, db } = await getFirebase();
      const { onAuthStateChanged } = await import("firebase/auth");
      const { collection, query, where, onSnapshot } = await import("firebase/firestore");

      unsubAuth = onAuthStateChanged(auth, (u) => {
        if (!u) { window.location.href = "/login"; return; }
        setUser({ displayName: u.displayName, email: u.email, uid: u.uid });

        const centersQuery = query(collection(db, "costCenters"), where("userId", "==", u.uid));
        unsubCenters = onSnapshot(centersQuery, (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CostCenter));
          setCostCenters(data);
        });

        const expensesQuery = query(collection(db, "expenses"), where("userId", "==", u.uid));
        unsubExpenses = onSnapshot(expensesQuery, (snapshot) => {
          const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense));
          setExpenses(data);
        });

        // ✅ setLoading(false) logo após montar os listeners,
        //    não espera dados chegarem
        setLoading(false);
      });
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  })();

  // ✅ cleanup correto no nível do useEffect
  return () => {
    unsubAuth?.();
    unsubCenters?.();
    unsubExpenses?.();
  };
}, []);

  // ─── Save cost center ──────────────────────────────────────────────────────────
  const handleSaveCenter = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.uid) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const formData = new FormData(e.currentTarget);
      const name = formData.get("name") as string;
      const budget = parseFloat(formData.get("budget") as string);
      const employees = parseInt(formData.get("employees") as string);

      if (!name || !budget || budget <= 0 || !employees || employees <= 0) {
        setError("Todos os campos são obrigatórios e devem ser válidos");
        setSaving(false);
        return;
      }

      const { getFirebase } = await import("../../lib/firebase");
      const { db } = await getFirebase();
      const { collection, addDoc, updateDoc, doc } = await import("firebase/firestore");

      if (editingCenter) {
        await updateDoc(doc(db, "costCenters", editingCenter.id), {
          name,
          budget,
          employees,
        });
        setSuccess("Centro de custo atualizado com sucesso!");
      } else {
        await addDoc(collection(db, "costCenters"), {
          name,
          budget,
          spent: 0,
          employees,
          color: colors[Math.floor(Math.random() * colors.length)],
          userId: user.uid,
          createdAt: new Date(),
        });
        setSuccess("Centro de custo criado com sucesso!");
      }

      setShowCenterModal(false);
      setEditingCenter(null);
      (e.target as HTMLFormElement).reset();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message || "Erro ao salvar centro de custo");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete cost center ────────────────────────────────────────────────────────
  const handleDeleteCenter = async (id: string) => {
    if (!confirm("Tem certeza que deseja deletar este centro de custo?")) return;

    try {
      const { getFirebase } = await import("../../lib/firebase");
      const { db } = await getFirebase();
      const { deleteDoc, doc } = await import("firebase/firestore");

      await deleteDoc(doc(db, "costCenters", id));
      setSuccess("Centro de custo removido com sucesso!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message || "Erro ao deletar centro de custo");
    }
  };

  // ─── Save expense ──────────────────────────────────────────────────────────────
  const handleSaveExpense = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.uid) return;

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const formData = new FormData(e.currentTarget);
      const category = formData.get("category") as string;
      const center = formData.get("center") as string;
      const amount = parseFloat(formData.get("amount") as string);
      const date = formData.get("date") as string;
      const status = formData.get("status") as string;

      if (!category || !center || !amount || amount <= 0 || !date || !status) {
        setError("Todos os campos são obrigatórios");
        setSaving(false);
        return;
      }

      const { getFirebase } = await import("../../lib/firebase");
      const { db } = await getFirebase();
      const { collection, addDoc, updateDoc, doc } = await import("firebase/firestore");

      if (editingExpense) {
        await updateDoc(doc(db, "expenses", editingExpense.id), {
          category,
          center,
          amount,
          date,
          status,
        });
        setSuccess("Despesa atualizada com sucesso!");
      } else {
        await addDoc(collection(db, "expenses"), {
          category,
          center,
          amount,
          date,
          status,
          userId: user.uid,
          createdAt: new Date(),
        });
        setSuccess("Despesa criada com sucesso!");
      }

      setShowExpenseModal(false);
      setEditingExpense(null);
      (e.target as HTMLFormElement).reset();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message || "Erro ao salvar despesa");
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete expense ────────────────────────────────────────────────────────────
  const handleDeleteExpense = async (id: string) => {
    if (!confirm("Tem certeza que deseja deletar esta despesa?")) return;

    try {
      const { getFirebase } = await import("../../lib/firebase");
      const { db } = await getFirebase();
      const { deleteDoc, doc } = await import("firebase/firestore");

      await deleteDoc(doc(db, "expenses", id));
      setSuccess("Despesa removida com sucesso!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message || "Erro ao deletar despesa");
    }
  };

  // ─── Filtered data ─────────────────────────────────────────────────────────────
  const filteredExpenses = expenses.filter(exp => {
    const matchesSearch = exp.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         exp.center.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "todos" || exp.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const totalBudget = costCenters.reduce((sum, cc) => sum + cc.budget, 0);
  const totalSpent = costCenters.reduce((sum, cc) => sum + cc.spent, 0);
  const totalExpenses = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const utilizationPct = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

  const kpis = [
    { label: "Orçamento total", value: fmt(totalBudget), change: costCenters.length.toString(), up: true, sub: `${costCenters.length} centros`, icon: Wallet, color: "blue" },
    { label: "Custo real", value: fmt(totalExpenses), change: "+3.1%", up: false, sub: "vs. mês anterior", icon: CreditCard, color: "rose" },
    { label: "Disponível", value: fmt(totalBudget - totalSpent), change: `${100 - utilizationPct}%`, up: true, sub: "de margem", icon: TrendingUp, color: "emerald" },
    { label: "Centros ativos", value: costCenters.length.toString(), change: "+0", up: true, sub: "ativos agora", icon: BarChart2, color: "amber" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--db-bg)", ...(theme as any) }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          <p className="text-sm" style={{ color: "var(--db-text2)" }}>Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--db-bg)", ...(theme as any) }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');
        *, body { font-family: 'Sora', sans-serif; }
        .mono { font-family: 'JetBrains Mono', monospace; }
        * { transition: background-color .2s, border-color .2s, color .15s; }
        button, a, input, select { transition: background-color .15s, border-color .15s, color .1s, opacity .15s !important; }

        .kpi-card {
          background: var(--db-card);
          border: 1px solid var(--db-border);
          box-shadow: 0 1px 3px rgba(13,34,71,0.06), 0 4px 16px rgba(13,34,71,0.04);
          animation: slideUp 0.5s ease both;
        }
        .chart-card {
          background: var(--db-card);
          border: 1px solid var(--db-border);
          box-shadow: 0 1px 3px rgba(13,34,71,0.06), 0 4px 16px rgba(13,34,71,0.04);
          border-radius: 1rem;
          animation: slideUp 0.5s 0.2s ease both;
        }
        .side-card {
          background: var(--db-card);
          border: 1px solid var(--db-border);
          box-shadow: 0 1px 3px rgba(13,34,71,0.06), 0 4px 16px rgba(13,34,71,0.04);
          border-radius: 1rem;
          animation: slideUp 0.5s 0.3s ease both;
        }
        @keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }

        .center-row { transition: background 0.15s; border-radius: 12px; }
        .center-row:hover { background: var(--db-hover); }

        .expense-row { transition: background 0.15s; border-bottom: 1px solid var(--db-border); }
        .expense-row:last-child { border-bottom: none; }
        .expense-row:hover { background: var(--db-hover); }

        .badge-pago     { background: #dcfce7; color: #16a34a; }
        .badge-pendente { background: #fef9c3; color: #b45309; }
        .badge-agendado { background: #dbeafe; color: #1d4ed8; }

        .db-divider { border-color: var(--db-border); }
        .db-progress-bg { background: var(--db-border); }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--db-border); border-radius: 4px; }
      `}</style>

      {/* ── Notifications ── */}
      {error && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg flex items-center gap-2 z-50">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {success && (
        <div className="fixed top-4 right-4 bg-emerald-500 text-white px-4 py-3 rounded-lg flex items-center gap-2 z-50">
          <Check size={16} />
          {success}
        </div>
      )}

      <Navbar user={user} period={period} activePath={activePath} />

      <main className="flex-1 p-4 md:p-6 lg:p-8 space-y-4 md:space-y-6 overflow-auto pb-20 lg:pb-8">

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
          {kpis.map((kpi, i) => {
            const c = colorMap[kpi.color];
            return (
              <div key={kpi.label} className="kpi-card rounded-2xl p-4 md:p-5 flex flex-col gap-3 md:gap-4" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="flex items-start justify-between">
                  <p className="text-xs font-medium" style={{ color: "var(--db-text2)" }}>{kpi.label}</p>
                  <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: c.icon }}>
                    <kpi.icon size={16} style={{ color: c.text }} />
                  </div>
                </div>
                <div>
                  <p className="text-xl md:text-2xl font-extrabold leading-tight mb-1" style={{ color: "var(--db-text)" }}>{kpi.value}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ background: c.bg, color: c.text }}>
                      {kpi.up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                      {kpi.change}
                    </span>
                    <span className="text-xs" style={{ color: "var(--db-text2)" }}>{kpi.sub}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Cost Centers ── */}
        <div className="chart-card p-4 md:p-6">
          <div className="flex items-start md:items-center justify-between mb-4 md:mb-6 gap-2">
            <div>
              <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Centros de custo</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--db-text2)" }}>Gerenciar orçamentos e despesas</p>
            </div>
            <button
              onClick={() => { setEditingCenter(null); setShowCenterModal(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1 cursor-pointer">
              <Plus size={14} /> Novo
            </button>
          </div>

          {costCenters.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BarChart2 size={32} style={{ color: "var(--db-text2)", marginBottom: "1rem", opacity: 0.5 }} />
              <p style={{ color: "var(--db-text2)" }}>Nenhum centro de custo criado</p>
              <button
                onClick={() => setShowCenterModal(true)}
                className="mt-3 text-xs text-blue-500 hover:text-blue-400 font-semibold cursor-pointer">
                Criar primeiro centro
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {costCenters.map((center) => {
                const pct = center.budget > 0 ? Math.round((center.spent / center.budget) * 100) : 0;
                const remaining = center.budget - center.spent;
                return (
                  <div key={center.id} className="center-row p-3 md:p-4 rounded-xl border" style={{ borderColor: "var(--db-border)" }}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: center.color }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate" style={{ color: "var(--db-text)" }}>{center.name}</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--db-text2)" }}>{center.employees} colaboradores</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        <button
                          onClick={() => { setEditingCenter(center); setShowCenterModal(true); }}
                          className="p-1.5 rounded hover:bg-blue-500 hover:bg-opacity-10 transition-colors">
                          <Edit2 size={12} style={{ color: "#60a5fa" }} />
                        </button>
                        <button
                          onClick={() => handleDeleteCenter(center.id)}
                          className="p-1.5 rounded hover:bg-red-500 hover:bg-opacity-10 transition-colors">
                          <Trash2 size={12} style={{ color: "#f87171" }} />
                        </button>
                      </div>
                    </div>
                    <div className="relative w-full overflow-hidden rounded-full mb-2" style={{ background: "var(--db-border)", height: "8px" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(pct, 100)}%`, background: pct > 90 ? "#f87171" : center.color }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <p style={{ color: "var(--db-text2)" }}>Orçamento</p>
                        <p className="font-bold mono" style={{ color: "var(--db-text)" }}>{fmt(center.budget)}</p>
                      </div>
                      <div>
                        <p style={{ color: "var(--db-text2)" }}>Gasto</p>
                        <p className="font-bold mono" style={{ color: "var(--db-text)" }}>{fmt(center.spent)}</p>
                      </div>
                      <div>
                        <p style={{ color: "var(--db-text2)" }}>Utilização</p>
                        <p className="font-bold mono" style={{ color: pct > 90 ? "#f87171" : "var(--db-text)" }}>{pct}%</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Expenses ── */}
        <div className="chart-card p-4 md:p-6">
          <div className="flex items-start md:items-center justify-between mb-4 md:mb-6 gap-2 flex-wrap">
            <div>
              <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--db-text)" }}>Despesas</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--db-text2)" }}>Total: {fmt(totalExpenses)}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative hidden sm:flex">
                <Search size={14} className="absolute left-2.5 top-1/2 transform -translate-y-1/2" style={{ color: "var(--db-text2)" }} />
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs rounded-lg border"
                  style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="text-xs px-2.5 py-1.5 rounded-lg border"
                style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}>
                <option value="todos">Todos</option>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="agendado">Agendado</option>
              </select>
              <button
                onClick={() => { setEditingExpense(null); setShowExpenseModal(true); }}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex items-center gap-1 cursor-pointer">
                <Plus size={14} /> Novo
              </button>
            </div>
          </div>

          {filteredExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CreditCard size={32} style={{ color: "var(--db-text2)", marginBottom: "1rem", opacity: 0.5 }} />
              <p style={{ color: "var(--db-text2)" }}>Nenhuma despesa encontrada</p>
            </div>
          ) : (
            <>
              {/* Mobile */}
              <div className="md:hidden space-y-2">
                {filteredExpenses.map((exp) => (
                  <div key={exp.id} className="expense-row flex items-center justify-between p-3 rounded-xl" style={{ border: `1px solid var(--db-border)` }}>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate" style={{ color: "var(--db-text)" }}>{exp.category}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--db-text2)" }}>{exp.center}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-3 shrink-0">
                      <span className="mono text-xs font-bold" style={{ color: "var(--db-text)" }}>{fmt(exp.amount)}</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full badge-${exp.status}`}>
                        {exp.status.charAt(0).toUpperCase() + exp.status.slice(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b db-divider">
                      {["Categoria", "Centro", "Valor", "Data", "Status", "Ações"].map((h) => (
                        <th key={h} className="text-left text-xs font-semibold pb-3 pr-4 whitespace-nowrap" style={{ color: "var(--db-text2)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredExpenses.map((exp) => (
                      <tr key={exp.id} className="expense-row">
                        <td className="py-3 pr-4"><p className="text-xs font-semibold" style={{ color: "var(--db-text)" }}>{exp.category}</p></td>
                        <td className="py-3 pr-4"><span className="text-xs" style={{ color: "var(--db-text2)" }}>{exp.center}</span></td>
                        <td className="py-3 pr-4"><span className="mono text-xs font-bold" style={{ color: "var(--db-text)" }}>{fmt(exp.amount)}</span></td>
                        <td className="py-3 pr-4"><span className="text-xs" style={{ color: "var(--db-text2)" }}>{exp.date}</span></td>
                        <td className="py-3 pr-4"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full badge-${exp.status}`}>{exp.status.charAt(0).toUpperCase() + exp.status.slice(1)}</span></td>
                        <td className="py-3"><div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditingExpense(exp); setShowExpenseModal(true); }}
                            className="p-1 rounded hover:bg-blue-500 hover:bg-opacity-10 transition-colors">
                            <Edit2 size={12} style={{ color: "#60a5fa" }} />
                          </button>
                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1 rounded hover:bg-red-500 hover:bg-opacity-10 transition-colors">
                            <Trash2 size={12} style={{ color: "#f87171" }} />
                          </button>
                        </div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

      </main>

      {/* ── Modal: Center ── */}
      {showCenterModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded-xl border" style={{ background: "var(--db-card)", borderColor: "var(--db-border)" }}>
            <div className="flex items-center justify-between p-4 md:p-6 border-b db-divider">
              <h3 className="font-bold" style={{ color: "var(--db-text)" }}>
                {editingCenter ? "Editar centro" : "Novo centro de custo"}
              </h3>
              <button onClick={() => { setShowCenterModal(false); setEditingCenter(null); }} className="p-1">
                <X size={18} style={{ color: "var(--db-text2)" }} />
              </button>
            </div>
            <form onSubmit={handleSaveCenter} className="p-4 md:p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: "var(--db-text2)" }}>Nome</label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingCenter?.name}
                  placeholder="Ex: Operações"
                  required
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: "var(--db-text2)" }}>Orçamento (R$)</label>
                <input
                  type="number"
                  name="budget"
                  defaultValue={editingCenter?.budget}
                  placeholder="185000"
                  required
                  min="0"
                  step="100"
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: "var(--db-text2)" }}>Colaboradores</label>
                <input
                  type="number"
                  name="employees"
                  defaultValue={editingCenter?.employees}
                  placeholder="24"
                  required
                  min="1"
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}
                />
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowCenterModal(false); setEditingCenter(null); }}
                  className="flex-1 px-4 py-2 text-sm font-semibold rounded-lg border transition-colors"
                  style={{ borderColor: "var(--db-border)", color: "var(--db-text2)" }}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2">
                  {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                  {editingCenter ? "Atualizar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Expense ── */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md rounded-xl border" style={{ background: "var(--db-card)", borderColor: "var(--db-border)" }}>
            <div className="flex items-center justify-between p-4 md:p-6 border-b db-divider">
              <h3 className="font-bold" style={{ color: "var(--db-text)" }}>
                {editingExpense ? "Editar despesa" : "Nova despesa"}
              </h3>
              <button onClick={() => { setShowExpenseModal(false); setEditingExpense(null); }} className="p-1">
                <X size={18} style={{ color: "var(--db-text2)" }} />
              </button>
            </div>
            <form onSubmit={handleSaveExpense} className="p-4 md:p-6 space-y-4">
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: "var(--db-text2)" }}>Categoria</label>
                <input
                  type="text"
                  name="category"
                  defaultValue={editingExpense?.category}
                  placeholder="Ex: Salários"
                  required
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: "var(--db-text2)" }}>Centro</label>
                <select
                  name="center"
                  defaultValue={editingExpense?.center}
                  required
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}>
                  <option value="">Selecione um centro</option>
                  {costCenters.map(cc => (
                    <option key={cc.id} value={cc.name}>{cc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: "var(--db-text2)" }}>Valor (R$)</label>
                <input
                  type="number"
                  name="amount"
                  defaultValue={editingExpense?.amount}
                  placeholder="98000"
                  required
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: "var(--db-text2)" }}>Data</label>
                <input
                  type="text"
                  name="date"
                  defaultValue={editingExpense?.date}
                  placeholder="Ex: Mensal"
                  required
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}
                />
              </div>
              <div>
                <label className="text-xs font-semibold block mb-2" style={{ color: "var(--db-text2)" }}>Status</label>
                <select
                  name="status"
                  defaultValue={editingExpense?.status}
                  required
                  className="w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ borderColor: "var(--db-border)", background: "var(--db-sub)", color: "var(--db-text)" }}>
                  <option value="pago">Pago</option>
                  <option value="pendente">Pendente</option>
                  <option value="agendado">Agendado</option>
                </select>
              </div>
              <div className="flex gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowExpenseModal(false); setEditingExpense(null); }}
                  className="flex-1 px-4 py-2 text-sm font-semibold rounded-lg border transition-colors"
                  style={{ borderColor: "var(--db-border)", color: "var(--db-text2)" }}>
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2">
                  {saving ? <Loader size={14} className="animate-spin" /> : <Check size={14} />}
                  {editingExpense ? "Atualizar" : "Criar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
