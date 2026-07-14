"use client";

import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp, TrendingDown, DollarSign, CheckCircle, AlertCircle,
  Calendar, ArrowUpRight, ArrowDownRight, Sparkles, Landmark,
  FileText, Check, Plus, Search, RefreshCw, Upload, ShieldCheck,
  ChevronRight, ArrowRight, X, AlertTriangle, Eye, EyeOff, Calculator, BarChart3, PieChart, Activity
} from "lucide-react";
import Navbar from "../components/Navbar";

// ─── Tipos ────────────────────────────────────────────────────────────────────
type TxType = "entrada" | "saida";

interface Tx {
  id: string;
  type: TxType;
  description: string;
  category: string;
  amount: number;
  date: string;
  note: string;
  createdAt: number;
  reconciled?: boolean;
}

interface BankStatementItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: TxType;
}

// Helper para formatação
const toBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function RelatoriosPage() {
  const [uid, setUid] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPeriod, setFilterPeriod] = useState<"7d" | "30d" | "mes" | "ano">("30d");
  const [searchQuery, setSearchQuery] = useState("");
  const [hideValues, setHideValues] = useState(false);

  type TabType = "fluxo" | "faturamento" | "dre" | "precificacao";
  const [activeTab, setActiveTab] = useState<TabType>("fluxo");

  // Estados de Precificação
  const [precCusto, setPrecCusto] = useState<number | "">("");
  const [precImposto, setPrecImposto] = useState<number | "">("");
  const [precMargem, setPrecMargem] = useState<number | "">("");

  // Estados de conciliação bancária
  const [statement, setStatement] = useState<BankStatementItem[]>([]);
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);

  // Inicialização e Auth
  useEffect(() => {
    let snapUnsub: (() => void) | undefined;
    let authUnsub: (() => void) | undefined;

    (async () => {
      try {
        const [{ getFirebase }, { onAuthStateChanged }, { collection, query, orderBy, onSnapshot }] = await Promise.all([
          import("@/lib/firebase"),
          import("firebase/auth"),
          import("firebase/firestore"),
        ]);

        const { auth, db } = await getFirebase();
        authUnsub = onAuthStateChanged(auth, (u) => {
          if (!u) {
            window.location.href = "/login";
            return;
          }
          setUid(u.uid);
          setUser(u);

          // Buscar transações de fluxo de caixa
          const q = query(collection(db, "users", u.uid, "cashflow"), orderBy("date", "desc"));
          snapUnsub = onSnapshot(q, (snap) => {
            setTxs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tx)));
            setLoading(false);
          }, (err) => {
            console.error("Erro ao carregar transações:", err);
            setLoading(false);
          });
        });
      } catch (e) {
        console.error("Erro ao inicializar Firebase:", e);
        setLoading(false);
      }
    })();

    return () => {
      authUnsub?.();
      snapUnsub?.();
    };
  }, []);

  // Filtragem das transações por período
  const filteredTxs = useMemo(() => {
    const now = new Date();
    return txs.filter(tx => {
      // Filtro de Busca
      if (searchQuery && !tx.description.toLowerCase().includes(searchQuery.toLowerCase()) && !tx.category.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      // Filtro de Data
      const txDate = new Date(tx.date + "T12:00:00");
      if (filterPeriod === "7d") {
        const diff = (now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 7;
      }
      if (filterPeriod === "30d") {
        const diff = (now.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24);
        return diff <= 30;
      }
      if (filterPeriod === "mes") {
        return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
      }
      if (filterPeriod === "ano") {
        return txDate.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [txs, filterPeriod, searchQuery]);

  // Cálculos financeiros com base no filtro
  const metrics = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    let conciliadas = 0;

    filteredTxs.forEach(tx => {
      if (tx.type === "entrada") entradas += tx.amount;
      else if (tx.type === "saida") saidas += tx.amount;
      if (tx.reconciled) conciliadas++;
    });

    const saldo = entradas - saidas;
    const taxaConciliacao = filteredTxs.length > 0 ? (conciliadas / filteredTxs.length) * 100 : 0;

    return { entradas, saidas, saldo, taxaConciliacao, total: filteredTxs.length };
  }, [filteredTxs]);

  // Cálculos do DRE
  const dreData = useMemo(() => {
    let receita = 0;
    let impostos = 0;
    let cmv = 0;
    let despesas = 0;

    filteredTxs.forEach(tx => {
      const catLower = tx.category.toLowerCase();
      if (tx.type === "entrada") {
        receita += tx.amount;
      } else {
        if (catLower.includes("imposto") || catLower.includes("taxa") || catLower.includes("tributo")) {
          impostos += tx.amount;
        } else if (catLower.includes("fornecedor") || catLower.includes("produto") || catLower.includes("mercadoria") || catLower.includes("compra")) {
          cmv += tx.amount;
        } else {
          despesas += tx.amount;
        }
      }
    });

    const receitaLiquida = receita - impostos;
    const lucroBruto = receitaLiquida - cmv;
    const lucroLiquido = lucroBruto - despesas;
    const margemLiquida = receita > 0 ? (lucroLiquido / receita) * 100 : 0;

    return { receita, impostos, receitaLiquida, cmv, lucroBruto, despesas, lucroLiquido, margemLiquida };
  }, [filteredTxs]);

  // Cálculos de Precificação (Markup)
  const precSugestao = useMemo(() => {
    const c = Number(precCusto) || 0;
    const i = Number(precImposto) || 0;
    const m = Number(precMargem) || 0;

    if (c === 0) return 0;
    const deducoes = (i + m) / 100;
    if (deducoes >= 1) return -1; // Inviável

    return c / (1 - deducoes);
  }, [precCusto, precImposto, precMargem]);

  // Categorias de Entrada e Saída agrupadas
  const categoryBreakdown = useMemo(() => {
    const breakdown: Record<string, { total: number; type: TxType }> = {};
    filteredTxs.forEach(tx => {
      if (!breakdown[tx.category]) {
        breakdown[tx.category] = { total: 0, type: tx.type };
      }
      breakdown[tx.category].total += tx.amount;
    });

    return Object.entries(breakdown)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [filteredTxs]);

  // Simulação de Extrato Bancário
  const generateMockStatement = () => {
    // Cria itens que combinam e outros que não combinam para simular o banco real
    const mockItems: BankStatementItem[] = [];

    // 1. Matches Perfeitos baseados nas transações não conciliadas existentes
    const pendingTxs = txs.filter(t => !t.reconciled).slice(0, 3);
    pendingTxs.forEach((tx, idx) => {
      mockItems.push({
        id: `ext-${idx}`,
        date: tx.date,
        description: `DEB/CRED AUTO - ${tx.description.toUpperCase()}`,
        amount: tx.amount,
        type: tx.type
      });
    });

    // 2. Transação com valor certo mas descrição/data ligeiramente diferente
    const matchDiferente = txs.find(t => !t.reconciled && !pendingTxs.includes(t));
    if (matchDiferente) {
      const d = new Date(matchDiferente.date + "T12:00:00");
      d.setDate(d.getDate() - 1); // Dia anterior
      mockItems.push({
        id: "ext-diff",
        date: d.toISOString().split("T")[0],
        description: `TRANSF BANC - ${matchDiferente.category.toUpperCase()}`,
        amount: matchDiferente.amount,
        type: matchDiferente.type
      });
    }

    // 3. Transação que está no extrato bancário, mas NÃO está no fluxo de caixa (Novo Pix)
    mockItems.push({
      id: "ext-new-1",
      date: new Date().toISOString().split("T")[0],
      description: "RECEBIMENTO PIX - MARCOS DE SOUZA",
      amount: 1500.00,
      type: "entrada"
    });

    mockItems.push({
      id: "ext-new-2",
      date: new Date().toISOString().split("T")[0],
      description: "TARIFA BANCARIA CESTA FACIL",
      amount: 49.90,
      type: "saida"
    });

    setStatement(mockItems);
  };

  // Conciliar transação
  const handleReconcile = async (statementItem: BankStatementItem, matchedTxId: string) => {
    if (!uid) return;
    setReconcilingId(matchedTxId);

    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { doc, updateDoc } = await import("firebase/firestore");
      const { db } = await getFirebase();

      await updateDoc(doc(db, "users", uid, "cashflow", matchedTxId), {
        reconciled: true,
        reconciledAt: Date.now(),
        bankTransactionDesc: statementItem.description
      });

      // Remover o item conciliado da lista visual de extrato
      setStatement(prev => prev.filter(item => item.id !== statementItem.id));
    } catch (err) {
      console.error("Erro ao conciliar transação:", err);
    } finally {
      setReconcilingId(null);
    }
  };

  // Registrar nova transação vinda do extrato bancário
  const handleRegisterFromStatement = async (item: BankStatementItem) => {
    if (!uid) return;
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { collection, addDoc } = await import("firebase/firestore");
      const { db } = await getFirebase();

      const defaultCategory = item.type === "entrada" ? "Vendas" : "Outros gastos";

      await addDoc(collection(db, "users", uid, "cashflow"), {
        type: item.type,
        description: item.description,
        category: defaultCategory,
        amount: item.amount,
        date: item.date,
        note: "Registrado via Conciliação Bancária",
        createdAt: Date.now(),
        reconciled: true
      });

      // Remove do extrato pendente
      setStatement(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      console.error("Erro ao criar transação a partir do extrato:", err);
    }
  };

  // Algoritmo de correspondência para sugestão inteligente
  const getMatchSuggestions = (item: BankStatementItem) => {
    return txs.filter(tx => {
      if (tx.reconciled) return false;
      if (tx.type !== item.type) return false;

      // Correspondência perfeita de valor
      const valueMatch = Math.abs(tx.amount - item.amount) < 0.01;
      
      // Proximidade de datas (máximo 4 dias de diferença)
      const t1 = new Date(tx.date + "T12:00:00").getTime();
      const t2 = new Date(item.date + "T12:00:00").getTime();
      const dateDiffDays = Math.abs(t1 - t2) / (1000 * 60 * 60 * 24);

      return valueMatch && dateDiffDays <= 4;
    });
  };

  // Renderização do gráfico SVG de colunas
  const svgChartData = useMemo(() => {
    // Agrupar por data dos últimos 7 dias para desenhar gráfico simples
    const days: Record<string, { entrada: number; saida: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateString = d.toISOString().split("T")[0];
      days[dateString] = { entrada: 0, saida: 0 };
    }

    filteredTxs.forEach(tx => {
      if (days[tx.date]) {
        if (tx.type === "entrada") days[tx.date].entrada += tx.amount;
        else days[tx.date].saida += tx.amount;
      }
    });

    return Object.entries(days).map(([date, val]) => ({
      label: date.split("-")[2] + "/" + date.split("-")[1],
      ...val
    }));
  }, [filteredTxs]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--db-bg)" }}>
        <div className="text-center space-y-4">
          <RefreshCw className="animate-spin h-10 w-10 text-primary mx-auto" />
          <p className="text-sm font-semibold" style={{ color: "var(--db-text-2)" }}>Carregando Relatórios e Métricas...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navbar activePath="/relatorios" user={user} />
      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6 pb-24">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-extrabold" style={{ color: "var(--db-text)" }}>
              Relatórios & Conciliação
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--db-text-2)" }}>
              Monitore a saúde do seu fluxo de caixa e verifique a conformidade com seus extratos.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg p-1" style={{ background: "var(--cf-input)" }}>
              {[
                { id: "7d", label: "7D" },
                { id: "30d", label: "30D" },
                { id: "mes", label: "Mês" },
                { id: "ano", label: "Ano" }
              ].map(p => (
                <button
                  key={p.id}
                  onClick={() => setFilterPeriod(p.id as any)}
                  className="px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer"
                  style={filterPeriod === p.id 
                    ? { background: "var(--db-card)", color: "var(--primary)", boxShadow: "var(--db-shadow-sm)" }
                    : { background: "transparent", color: "var(--db-text-2)" }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button 
              onClick={() => setHideValues(!hideValues)}
              className="p-2.5 rounded-lg border cursor-pointer hover:bg-opacity-80 transition-colors"
              style={{ borderColor: "var(--db-border)", background: "var(--db-card)", color: "var(--db-text-2)" }}
              title={hideValues ? "Mostrar valores" : "Ocultar valores"}
            >
              {hideValues ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b scrollbar-hide" style={{ borderColor: "var(--db-border)" }}>
          {[
            { id: "fluxo", label: "Fluxo de Caixa", icon: Activity },
            { id: "faturamento", label: "Faturamento", icon: BarChart3 },
            { id: "dre", label: "DRE", icon: FileText },
            { id: "precificacao", label: "Precificação", icon: Calculator },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold border-b-2 transition-all whitespace-nowrap cursor-pointer"
              style={{
                color: activeTab === tab.id ? "var(--primary)" : "var(--db-text-2)",
                borderColor: activeTab === tab.id ? "var(--primary)" : "transparent",
              }}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Aba: Fluxo de Caixa */}
        {activeTab === "fluxo" && (
          <div className="space-y-6 fade-in">
            {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card Entradas */}
          <div className="cf-card p-5 space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Total Entradas</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <ArrowUpRight size={16} />
              </div>
            </div>
            <p className="text-2xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
              {hideValues ? "••••••" : toBRL(metrics.entradas)}
            </p>
            <p className="text-xs" style={{ color: "var(--db-text-3)" }}>Recebimentos no período</p>
          </div>

          {/* Card Saídas */}
          <div className="cf-card p-5 space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Total Saídas</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400">
                <ArrowDownRight size={16} />
              </div>
            </div>
            <p className="text-2xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
              {hideValues ? "••••••" : toBRL(metrics.saidas)}
            </p>
            <p className="text-xs" style={{ color: "var(--db-text-3)" }}>Pagamentos e despesas</p>
          </div>

          {/* Card Saldo Líquido */}
          <div className="cf-card p-5 space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Saldo Líquido</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400">
                <DollarSign size={16} />
              </div>
            </div>
            <p className="text-2xl font-extrabold mono" style={{ color: metrics.saldo >= 0 ? "var(--success)" : "var(--danger)" }}>
              {hideValues ? "••••••" : toBRL(metrics.saldo)}
            </p>
            <p className="text-xs" style={{ color: "var(--db-text-3)" }}>Resultado operacional</p>
          </div>

          {/* Card Conciliação */}
          <div className="cf-card p-5 space-y-2 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Conciliação Bancária</span>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                <ShieldCheck size={16} />
              </div>
            </div>
            <p className="text-2xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
              {metrics.taxaConciliacao.toFixed(0)}%
            </p>
            <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-indigo-600 h-full transition-all duration-500" style={{ width: `${metrics.taxaConciliacao}%` }} />
            </div>
          </div>
        </div>

        {/* Gráfico SVG e Categorias */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Gráfico de Barras */}
          <div className="cf-card p-5 lg:col-span-2 space-y-4">
            <div>
              <h3 className="font-heading text-sm font-bold" style={{ color: "var(--db-text)" }}>Histórico de Fluxo Diário</h3>
              <p className="text-xs" style={{ color: "var(--db-text-2)" }}>Entradas vs Saídas nos últimos dias ativos</p>
            </div>
            
            {/* SVG Plot */}
            <div className="h-64 w-full flex items-end justify-between pt-6 px-4 relative">
              <div className="absolute inset-x-0 top-1/2 border-t border-dashed" style={{ borderColor: "var(--db-border)" }} />
              {svgChartData.map((data, i) => {
                const max = Math.max(...svgChartData.map(d => Math.max(d.entrada, d.saida))) || 1;
                const entHeight = (data.entrada / max) * 160;
                const saiHeight = (data.saida / max) * 160;
                return (
                  <div key={i} className="flex flex-col items-center gap-2 flex-1 group">
                    <div className="flex items-end gap-1.5 h-44">
                      {/* Entrada Bar */}
                      <div className="w-2.5 sm:w-3.5 bg-emerald-500 rounded-t-md transition-all duration-300 relative" style={{ height: `${Math.max(entHeight, 4)}px` }}>
                        <span className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded text-white bg-slate-900 pointer-events-none transition-opacity whitespace-nowrap z-30">
                          +{toBRL(data.entrada)}
                        </span>
                      </div>
                      {/* Saida Bar */}
                      <div className="w-2.5 sm:w-3.5 bg-rose-500 rounded-t-md transition-all duration-300 relative" style={{ height: `${Math.max(saiHeight, 4)}px` }}>
                        <span className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 text-[10px] font-bold px-1.5 py-0.5 rounded text-white bg-slate-900 pointer-events-none transition-opacity whitespace-nowrap z-30">
                          -{toBRL(data.saida)}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: "var(--db-text-2)" }}>{data.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Distribuição por Categoria */}
          <div className="cf-card p-5 space-y-4">
            <div>
              <h3 className="font-heading text-sm font-bold" style={{ color: "var(--db-text)" }}>Gastos e Receitas por Categoria</h3>
              <p className="text-xs" style={{ color: "var(--db-text-2)" }}>Maiores agrupamentos do período</p>
            </div>

            <div className="space-y-4 max-h-[260px] overflow-y-auto pr-1">
              {categoryBreakdown.length === 0 ? (
                <div className="text-center py-10" style={{ color: "var(--db-text-3)" }}>
                  Nenhuma transação no período.
                </div>
              ) : (
                categoryBreakdown.map((cat, i) => {
                  const maxAmt = Math.max(...categoryBreakdown.map(c => c.total)) || 1;
                  const pct = (cat.total / maxAmt) * 100;
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span style={{ color: "var(--db-text)" }}>{cat.name}</span>
                        <span style={{ color: cat.type === "entrada" ? "var(--success)" : "var(--danger)" }}>
                          {hideValues ? "•••" : toBRL(cat.total)}
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div 
                          className="h-full rounded-full transition-all duration-500" 
                          style={{ 
                            width: `${pct}%`, 
                            background: cat.type === "entrada" ? "var(--success)" : "var(--danger)" 
                          }} 
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Seção de Conciliação Bancária */}
        <div className="cf-card p-6 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Landmark className="text-primary" size={20} />
                <h2 className="font-heading text-lg font-bold" style={{ color: "var(--db-text)" }}>
                  Conciliação Bancária Ativa
                </h2>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--db-text-2)" }}>
                Compare extratos OFX/CSV/Simulados com o seu fluxo de caixa interno.
              </p>
            </div>
            
            <button
              onClick={generateMockStatement}
              className="btn-primary px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer"
            >
              <Upload size={14} /> Importar / Simular Extrato Bancário
            </button>
          </div>

          {statement.length === 0 ? (
            <div className="border border-dashed rounded-2xl p-10 text-center space-y-3" style={{ borderColor: "var(--db-border)" }}>
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                <Landmark size={22} />
              </div>
              <h4 className="font-bold text-sm" style={{ color: "var(--db-text)" }}>Sem extrato importado</h4>
              <p className="text-xs max-w-sm mx-auto" style={{ color: "var(--db-text-2)" }}>
                Importe ou simule um extrato bancário para iniciar a correspondência automática de seus lançamentos.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="font-semibold text-xs uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Transações do Extrato a Conciliar</h3>
              
              <div className="space-y-3">
                {statement.map((item) => {
                  const suggestions = getMatchSuggestions(item);
                  return (
                    <div key={item.id} className="border rounded-xl p-4 transition-all hover:shadow-sm" style={{ borderColor: "var(--db-border)", background: "var(--db-card-alt)" }}>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                        
                        {/* Detalhes do extrato bancário */}
                        <div className="space-y-1">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            Extrato Bancário
                          </span>
                          <p className="text-xs font-extrabold truncate" style={{ color: "var(--db-text)" }}>{item.description}</p>
                          <p className="text-[10px]" style={{ color: "var(--db-text-2)" }}>Data do extrato: {item.date}</p>
                          <p className="text-xs font-mono font-bold" style={{ color: item.type === "entrada" ? "var(--success)" : "var(--danger)" }}>
                            {item.type === "entrada" ? "+" : "-"}{toBRL(item.amount)}
                          </p>
                        </div>

                        {/* Status de Correspondência */}
                        <div className="md:col-span-2 space-y-3">
                          {suggestions.length > 0 ? (
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5 text-xs text-amber-600 font-semibold">
                                <AlertCircle size={14} />
                                <span>{suggestions.length} correspondência(s) encontrada(s):</span>
                              </div>
                              
                              <div className="space-y-2">
                                {suggestions.map((matchedTx) => (
                                  <div key={matchedTx.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2.5 rounded-lg border gap-3" style={{ background: "var(--db-card)", borderColor: "var(--db-border)" }}>
                                    <div className="text-xs">
                                      <p className="font-semibold" style={{ color: "var(--db-text)" }}>{matchedTx.description}</p>
                                      <p className="text-[10px]" style={{ color: "var(--db-text-2)" }}>Categoria: {matchedTx.category} · Data Interna: {matchedTx.date}</p>
                                    </div>
                                    <button
                                      onClick={() => handleReconcile(item, matchedTx.id)}
                                      disabled={reconcilingId === matchedTx.id}
                                      className="btn-success px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
                                    >
                                      {reconcilingId === matchedTx.id ? "Aguarde..." : <><Check size={11} /> Confirmar Conciliação</>}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl">
                              <div className="flex items-start gap-2 text-xs text-red-700 dark:text-red-300">
                                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-semibold">Nenhuma transação interna correspondente</p>
                                  <p className="text-[10px] opacity-80">Este valor não foi cadastrado no fluxo de caixa.</p>
                                </div>
                              </div>
                              <button
                                onClick={() => handleRegisterFromStatement(item)}
                                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-extrabold flex items-center gap-1 cursor-pointer shrink-0 transition-colors"
                              >
                                <Plus size={11} /> Adicionar ao Fluxo de Caixa
                              </button>
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Transações Recentes Filtradas */}
        <div className="cf-card p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-heading text-sm font-bold" style={{ color: "var(--db-text)" }}>Lançamentos Filtrados</h3>
              <p className="text-xs" style={{ color: "var(--db-text-2)" }}>Visualizando {filteredTxs.length} transações no período</p>
            </div>
            
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
              <input
                type="text"
                placeholder="Buscar por nome ou categoria..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 pl-8 pr-4 py-1.5 rounded-lg text-xs outline-none transition-colors border"
                style={{ background: "var(--cf-input)", borderColor: "var(--db-border)", color: "var(--db-text)" }}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--db-border)", color: "var(--db-text-2)" }}>
                  <th className="py-2.5 font-bold">Data</th>
                  <th className="py-2.5 font-bold">Descrição</th>
                  <th className="py-2.5 font-bold">Categoria</th>
                  <th className="py-2.5 font-bold">Status</th>
                  <th className="py-2.5 font-bold text-right">Valor</th>
                </tr>
              </thead>
              <tbody style={{ color: "var(--db-text)" }}>
                {filteredTxs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center" style={{ color: "var(--db-text-3)" }}>
                      Nenhum lançamento corresponde ao filtro.
                    </td>
                  </tr>
                ) : (
                  filteredTxs.map((tx) => (
                    <tr key={tx.id} className="border-b transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40" style={{ borderColor: "var(--db-border)" }}>
                      <td className="py-3 font-semibold">{tx.date.split("-")[2]}/{tx.date.split("-")[1]}</td>
                      <td className="py-3 font-semibold max-w-[200px] truncate">{tx.description}</td>
                      <td className="py-3">{tx.category}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                          tx.reconciled 
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400"
                            : "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400"
                        }`}>
                          {tx.reconciled ? "Conciliado" : "Não Conciliado"}
                        </span>
                      </td>
                      <td className={`py-3 text-right font-mono font-bold ${tx.type === "entrada" ? "text-emerald-500" : "text-rose-500"}`}>
                        {tx.type === "entrada" ? "+" : "-"}{hideValues ? "•••" : toBRL(tx.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

          </div>
        )}

        {/* Aba: Faturamento */}
        {activeTab === "faturamento" && (
          <div className="space-y-6 fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="cf-card p-6 flex flex-col items-center justify-center text-center space-y-2">
                <BarChart3 className="text-primary mb-2" size={32} />
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Receita Bruta</p>
                <p className="text-4xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
                  {hideValues ? "••••••" : toBRL(dreData.receita)}
                </p>
              </div>
              <div className="cf-card p-6 flex flex-col items-center justify-center text-center space-y-2">
                <Activity className="text-primary mb-2" size={32} />
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--db-text-2)" }}>Ticket Médio Estimado</p>
                <p className="text-4xl font-extrabold mono" style={{ color: "var(--db-text)" }}>
                  {hideValues ? "••••••" : toBRL(dreData.receita / (filteredTxs.filter(t => t.type === "entrada").length || 1))}
                </p>
              </div>
            </div>

            <div className="cf-card p-6">
              <h3 className="font-heading text-lg font-bold mb-4" style={{ color: "var(--db-text)" }}>Maiores Fontes de Faturamento</h3>
              <div className="space-y-4">
                {categoryBreakdown.filter(c => c.type === "entrada").length === 0 ? (
                  <p className="text-sm" style={{ color: "var(--db-text-3)" }}>Nenhum faturamento registrado no período.</p>
                ) : (
                  categoryBreakdown.filter(c => c.type === "entrada").map((cat, i) => {
                    const maxAmt = Math.max(...categoryBreakdown.filter(c => c.type === "entrada").map(c => c.total)) || 1;
                    const pct = (cat.total / maxAmt) * 100;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-sm font-semibold">
                          <span style={{ color: "var(--db-text)" }}>{cat.name}</span>
                          <span style={{ color: "var(--success)" }}>
                            {hideValues ? "•••" : toBRL(cat.total)}
                          </span>
                        </div>
                        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500 bg-emerald-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* Aba: DRE */}
        {activeTab === "dre" && (
          <div className="space-y-6 fade-in">
            <div className="cf-card p-6 sm:p-8">
              <div className="mb-6 flex items-center gap-3">
                <FileText className="text-primary" size={24} />
                <div>
                  <h2 className="font-heading text-xl font-bold" style={{ color: "var(--db-text)" }}>
                    Demonstração do Resultado do Exercício
                  </h2>
                  <p className="text-xs" style={{ color: "var(--db-text-2)" }}>Visão simplificada baseada nas categorias de fluxo de caixa</p>
                </div>
              </div>

              <div className="space-y-0 rounded-xl overflow-hidden border" style={{ borderColor: "var(--db-border)" }}>
                {/* Linha Receita */}
                <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50">
                  <span className="font-bold text-sm" style={{ color: "var(--db-text)" }}>Receita Operacional Bruta</span>
                  <span className="font-mono font-bold" style={{ color: "var(--success)" }}>{hideValues ? "••••••" : toBRL(dreData.receita)}</span>
                </div>
                {/* Linha Impostos */}
                <div className="flex justify-between items-center p-4 border-t" style={{ borderColor: "var(--db-border)" }}>
                  <span className="text-sm" style={{ color: "var(--db-text-2)" }}>(-) Deduções e Impostos</span>
                  <span className="font-mono" style={{ color: "var(--danger)" }}>{hideValues ? "••••••" : `-${toBRL(dreData.impostos)}`}</span>
                </div>
                {/* Receita Líquida */}
                <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 border-t" style={{ borderColor: "var(--db-border)" }}>
                  <span className="font-bold text-sm" style={{ color: "var(--db-text)" }}>= Receita Operacional Líquida</span>
                  <span className="font-mono font-bold" style={{ color: "var(--db-text)" }}>{hideValues ? "••••••" : toBRL(dreData.receitaLiquida)}</span>
                </div>
                {/* CMV */}
                <div className="flex justify-between items-center p-4 border-t" style={{ borderColor: "var(--db-border)" }}>
                  <span className="text-sm" style={{ color: "var(--db-text-2)" }}>(-) Custo da Mercadoria Vendida (CMV)</span>
                  <span className="font-mono" style={{ color: "var(--danger)" }}>{hideValues ? "••••••" : `-${toBRL(dreData.cmv)}`}</span>
                </div>
                {/* Lucro Bruto */}
                <div className="flex justify-between items-center p-4 bg-slate-50 dark:bg-slate-800/50 border-t" style={{ borderColor: "var(--db-border)" }}>
                  <span className="font-bold text-sm" style={{ color: "var(--db-text)" }}>= Lucro Bruto</span>
                  <span className="font-mono font-bold" style={{ color: "var(--db-text)" }}>{hideValues ? "••••••" : toBRL(dreData.lucroBruto)}</span>
                </div>
                {/* Despesas */}
                <div className="flex justify-between items-center p-4 border-t" style={{ borderColor: "var(--db-border)" }}>
                  <span className="text-sm" style={{ color: "var(--db-text-2)" }}>(-) Despesas Operacionais</span>
                  <span className="font-mono" style={{ color: "var(--danger)" }}>{hideValues ? "••••••" : `-${toBRL(dreData.despesas)}`}</span>
                </div>
                {/* Lucro Líquido */}
                <div className="flex justify-between items-center p-5 bg-slate-100 dark:bg-slate-900 border-t" style={{ borderColor: "var(--db-border)" }}>
                  <span className="font-extrabold text-base uppercase tracking-wider" style={{ color: "var(--db-text)" }}>= Lucro Líquido do Exercício</span>
                  <div className="text-right">
                    <span className="font-mono font-extrabold text-xl" style={{ color: dreData.lucroLiquido >= 0 ? "var(--success)" : "var(--danger)" }}>
                      {hideValues ? "••••••" : toBRL(dreData.lucroLiquido)}
                    </span>
                    <p className="text-[10px] font-bold mt-1" style={{ color: "var(--db-text-2)" }}>
                      Margem Líquida: {dreData.margemLiquida.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Aba: Precificação */}
        {activeTab === "precificacao" && (
          <div className="space-y-6 fade-in">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="cf-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Calculator className="text-primary" size={24} />
                  <h2 className="font-heading text-xl font-bold" style={{ color: "var(--db-text)" }}>
                    Calculadora de Precificação
                  </h2>
                </div>
                <p className="text-sm mb-6" style={{ color: "var(--db-text-2)" }}>
                  Descubra o preço de venda ideal com base no método Markup, garantindo que você atinja a margem de lucro desejada após o pagamento de impostos.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--db-text)" }}>Custo do Produto (R$)</label>
                    <input 
                      type="number" 
                      value={precCusto} 
                      onChange={(e) => setPrecCusto(Number(e.target.value))} 
                      className="w-full p-2.5 rounded-lg border outline-none font-mono" 
                      style={{ background: "var(--cf-input)", borderColor: "var(--db-border)", color: "var(--db-text)" }} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--db-text)" }}>Impostos e Taxas (%)</label>
                    <input 
                      type="number" 
                      value={precImposto} 
                      onChange={(e) => setPrecImposto(Number(e.target.value))} 
                      className="w-full p-2.5 rounded-lg border outline-none font-mono" 
                      style={{ background: "var(--cf-input)", borderColor: "var(--db-border)", color: "var(--db-text)" }} 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold mb-1.5" style={{ color: "var(--db-text)" }}>Margem de Lucro Desejada (%)</label>
                    <input 
                      type="number" 
                      value={precMargem} 
                      onChange={(e) => setPrecMargem(Number(e.target.value))} 
                      className="w-full p-2.5 rounded-lg border outline-none font-mono" 
                      style={{ background: "var(--cf-input)", borderColor: "var(--db-border)", color: "var(--db-text)" }} 
                    />
                  </div>
                </div>
              </div>

              <div className="cf-card p-6 flex flex-col justify-center text-center">
                <h3 className="font-heading text-lg font-bold mb-2" style={{ color: "var(--db-text)" }}>Preço de Venda Sugerido</h3>
                {precSugestao === -1 ? (
                  <div className="text-rose-500 font-bold mt-4 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20">
                    Sua margem e impostos superam ou igualam 100%. É impossível precificar.
                  </div>
                ) : (
                  <>
                    <div className="text-5xl font-extrabold mono mt-4 mb-6" style={{ color: "var(--primary)" }}>
                      {toBRL(precSugestao)}
                    </div>
                    <div className="space-y-3 mt-auto border-t pt-4 text-sm" style={{ borderColor: "var(--db-border)" }}>
                      <div className="flex justify-between">
                        <span style={{ color: "var(--db-text-2)" }}>Custos:</span>
                        <span className="font-mono font-semibold" style={{ color: "var(--db-text)" }}>{toBRL(Number(precCusto) || 0)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ color: "var(--db-text-2)" }}>Impostos Estimados:</span>
                        <span className="font-mono font-semibold" style={{ color: "var(--danger)" }}>{toBRL(precSugestao * ((Number(precImposto) || 0)/100))}</span>
                      </div>
                      <div className="flex justify-between font-bold">
                        <span style={{ color: "var(--db-text)" }}>Lucro Líquido:</span>
                        <span className="font-mono text-emerald-500">{toBRL(precSugestao * ((Number(precMargem) || 0)/100))}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </>
  );
}