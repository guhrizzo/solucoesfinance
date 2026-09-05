"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useMemo } from "react";
import { useAuth } from "../hooks/useAuth";
import Navbar from "../components/Navbar";
import AccessDenied from "../components/AccessDenied";
import { PageLoader } from "../components/ui";
import { authedFetch } from "@/lib/authedFetch";
import {
  ShoppingCart, DollarSign, Receipt, Package, TrendingUp,
  ArrowRight, AlertTriangle, Zap, Boxes, Layers,
  LayoutGrid, Calculator,
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Canal = "mercadolivre" | "shopee";

interface CashflowTx {
  id: string;
  type: "entrada" | "saida";
  description: string;
  category: string;
  amount: number;
  date: string;            // YYYY-MM-DD
  createdAt: number;
  saleChannel?: Canal;
  saleSku?: string;
  saleQty?: number;
  saleUnitPrice?: number;
  saleAdId?: string;
  orderId?: string;
  source?: string;
}

interface ProdutoEstoque {
  id: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  minQuantity: number;
}

interface Integracao {
  id: string;
  platform: Canal;
  accountName?: string;
}

type Periodo = "mes" | "30d" | "tudo";
type Aba = "geral" | "precificacao";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const toBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const CANAL_INFO: Record<Canal, { label: string; bg: string; fg: string; solid: string }> = {
  mercadolivre: { label: "Mercado Livre", bg: "var(--brand-ml-bg)", fg: "var(--brand-ml-fg)", solid: "var(--brand-ml-solid)" },
  shopee: { label: "Shopee", bg: "var(--brand-shopee-bg)", fg: "var(--brand-shopee-fg)", solid: "var(--brand-shopee-bg)" },
};

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const ymd = (d: Date) => d.toISOString().split("T")[0];

// ─── Página ───────────────────────────────────────────────────────────────────

export default function VendasPage() {
  const { user, loading: authLoading } = useAuth();

  const [ownerUid, setOwnerUid] = useState("");
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { resolveAccountScope, hasPermission } = await import("@/lib/accountScope");
      const scope = await resolveAccountScope(db, user.uid);
      if (cancelled) return;
      if (!hasPermission(scope, "vendas")) { setBlocked(true); return; }
      setOwnerUid(scope.ownerUid);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Ramo "Serviço" não usa vendas de marketplace — manda pro dashboard.
  useEffect(() => {
    if (!user || !ownerUid) return;
    const cached = typeof window !== "undefined" ? localStorage.getItem(`onboarding_ramo_${ownerUid}`) : null;
    if (cached) {
      try {
        if (JSON.parse(cached).includes("Serviço")) { window.location.href = "/dashboard"; }
      } catch { /* noop */ }
    }
  }, [user, ownerUid]);

  async function handleLogout() {
    const { getFirebase } = await import("@/lib/firebase");
    const { signOut } = await import("firebase/auth");
    const { auth } = await getFirebase();
    await signOut(auth);
    window.location.href = "/login";
  }

  // ── Dados ──────────────────────────────────────────────────────────────────
  const [txs, setTxs] = useState<CashflowTx[]>([]);
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [dbLoading, setDbLoading] = useState(true);
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [aba, setAba] = useState<Aba>("geral");
  const [shopeeRepasse, setShopeeRepasse] = useState<
    { pendente: number; liberado: number; taxas: number; mock: boolean } | null
  >(null);

  useEffect(() => {
    if (!user || !ownerUid) return;
    let unsubTx: () => void;
    let unsubEstoque: () => void;
    let unsubInteg: () => void;

    (async () => {
      try {
        const { getFirebase } = await import("@/lib/firebase");
        const { db } = await getFirebase();
        const { collection, onSnapshot, query, where, orderBy } = await import("firebase/firestore");

        const qTx = query(collection(db, "users", ownerUid, "cashflow"), orderBy("createdAt", "desc"));
        unsubTx = onSnapshot(qTx, (snap) => {
          setTxs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashflowTx)));
          setDbLoading(false);
        }, (err) => { console.error("Erro vendas/cashflow:", err); setDbLoading(false); });

        const qEstoque = query(collection(db, "estoque"), where("userId", "==", ownerUid));
        unsubEstoque = onSnapshot(qEstoque, (snap) => {
          setProdutos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProdutoEstoque)));
        });

        const qInteg = query(collection(db, "integracoes"), where("userId", "==", ownerUid));
        unsubInteg = onSnapshot(qInteg, (snap) => {
          setIntegracoes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Integracao)));
        });
      } catch (err) {
        console.error("Erro ao configurar listeners de vendas:", err);
        setDbLoading(false);
      }
    })();

    return () => { unsubTx?.(); unsubEstoque?.(); unsubInteg?.(); };
  }, [user, ownerUid]);

  // Valor líquido a receber da Shopee (escrow) — consulta sob demanda.
  useEffect(() => {
    if (!ownerUid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authedFetch("/api/shopee/repasse");
        const data = await res.json();
        if (!cancelled && res.ok && (data.configured || data.mock)) {
          setShopeeRepasse({
            pendente: data.repasse?.pendente || 0,
            liberado: data.repasse?.liberado || 0,
            taxas: data.repasse?.taxas || 0,
            mock: !!data.mock,
          });
        }
      } catch { /* silencioso */ }
    })();
    return () => { cancelled = true; };
  }, [ownerUid]);

  // ── Vendas (entradas de marketplace) ───────────────────────────────────────
  const todasVendas = useMemo(
    () => txs.filter((t) => t.type === "entrada" && (t.saleChannel === "mercadolivre" || t.saleChannel === "shopee")),
    [txs]
  );

  const { dataInicio, labelPeriodo } = useMemo(() => {
    const now = new Date();
    if (periodo === "mes") {
      return { dataInicio: `${monthKey(now)}-01`, labelPeriodo: "Este mês" };
    }
    if (periodo === "30d") {
      const d = new Date(now); d.setDate(d.getDate() - 29);
      return { dataInicio: ymd(d), labelPeriodo: "Últimos 30 dias" };
    }
    return { dataInicio: "0000-00-00", labelPeriodo: "Todo o período" };
  }, [periodo]);

  const vendas = useMemo(
    () => todasVendas.filter((v) => v.date >= dataInicio),
    [todasVendas, dataInicio]
  );

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = vendas.reduce((s, v) => s + (v.amount || 0), 0);
    const pedidos = vendas.length;
    const unidades = vendas.reduce((s, v) => s + (v.saleQty || 1), 0);
    const ticket = pedidos > 0 ? total / pedidos : 0;

    const porCanal = (c: Canal) => {
      const list = vendas.filter((v) => v.saleChannel === c);
      return {
        total: list.reduce((s, v) => s + (v.amount || 0), 0),
        pedidos: list.length,
        unidades: list.reduce((s, v) => s + (v.saleQty || 1), 0),
      };
    };

    return { total, pedidos, unidades, ticket, ml: porCanal("mercadolivre"), shopee: porCanal("shopee") };
  }, [vendas]);

  // ── Série temporal (gráfico de barras empilhadas por canal) ────────────────
  const serie = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; label: string; ml: number; shopee: number }[] = [];

    if (periodo === "tudo") {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({
          key: monthKey(d),
          label: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
          ml: 0, shopee: 0,
        });
      }
      vendas.forEach((v) => {
        const b = buckets.find((x) => x.key === v.date.slice(0, 7));
        if (b) b[v.saleChannel === "shopee" ? "shopee" : "ml"] += v.amount || 0;
      });
    } else {
      const dias = periodo === "mes"
        ? new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
        : 30;
      const base = periodo === "mes"
        ? new Date(now.getFullYear(), now.getMonth(), 1)
        : (() => { const d = new Date(now); d.setDate(d.getDate() - 29); return d; })();
      for (let i = 0; i < dias; i++) {
        const d = new Date(base); d.setDate(base.getDate() + i);
        buckets.push({ key: ymd(d), label: String(d.getDate()), ml: 0, shopee: 0 });
      }
      vendas.forEach((v) => {
        const b = buckets.find((x) => x.key === v.date);
        if (b) b[v.saleChannel === "shopee" ? "shopee" : "ml"] += v.amount || 0;
      });
    }

    const max = Math.max(1, ...buckets.map((b) => b.ml + b.shopee));
    return { buckets, max };
  }, [vendas, periodo]);

  // ── Top produtos vendidos × estoque ────────────────────────────────────────
  const topProdutos = useMemo(() => {
    const map = new Map<string, { sku: string; qty: number; receita: number }>();
    vendas.forEach((v) => {
      const sku = (v.saleSku || "").toUpperCase();
      if (!sku) return;
      const cur = map.get(sku) || { sku, qty: 0, receita: 0 };
      cur.qty += v.saleQty || 1;
      cur.receita += v.amount || 0;
      map.set(sku, cur);
    });
    return [...map.values()]
      .map((r) => {
        const p = produtos.find((x) => x.sku.toUpperCase() === r.sku);
        return {
          ...r,
          name: p?.name || r.sku,
          estoque: p?.quantity ?? null,
          minQuantity: p?.minQuantity ?? 0,
        };
      })
      .sort((a, b) => b.receita - a.receita)
      .slice(0, 6);
  }, [vendas, produtos]);

  // ── Controle de estoque (resumo) ───────────────────────────────────────────
  const estoqueResumo = useMemo(() => {
    let unidades = 0, baixo = 0, zerado = 0, valor = 0;
    produtos.forEach((p) => {
      unidades += p.quantity;
      valor += p.quantity * (p.price || 0);
      if (p.quantity <= 0) zerado++;
      else if (p.quantity <= p.minQuantity) baixo++;
    });
    return { unidades, baixo, zerado, valor, itens: produtos.length };
  }, [produtos]);

  const canaisConectados = useMemo(() => {
    return {
      mercadolivre: integracoes.some((i) => i.platform === "mercadolivre"),
      shopee: integracoes.some((i) => i.platform === "shopee"),
    };
  }, [integracoes]);

  if (blocked) return <AccessDenied category="Painel de Vendas" />;
  if (authLoading || (user && !blocked && dbLoading)) return <PageLoader />;
  if (!user) return null;

  const periodOptions: { id: Periodo; label: string }[] = [
    { id: "mes", label: "Este mês" },
    { id: "30d", label: "30 dias" },
    { id: "tudo", label: "Tudo" },
  ];

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--db-bg)" }}>
      <Navbar activePath="/vendas" user={user} onLogout={handleLogout} hidePeriod />

      <main className="px-6 py-8 max-w-7xl mx-auto w-full space-y-8 pb-24">

        {/* Cabeçalho */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight" style={{ color: "var(--db-text)" }}>
              Painel de Vendas
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--db-text-3)" }}>
              Vendas do Mercado Livre e Shopee — cada pedido entra automaticamente como
              <span className="font-semibold" style={{ color: "var(--success)" }}> entrada no Fluxo de Caixa</span>.
            </p>
          </div>

          {aba === "geral" && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--cf-border)" }}>
                {periodOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setPeriodo(opt.id)}
                    className="px-3.5 py-2 text-xs font-bold cursor-pointer border-none"
                    style={periodo === opt.id
                      ? { background: "var(--primary)", color: "var(--brand-on)" }
                      : { background: "var(--cf-input)", color: "var(--cf-text-2)" }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <a
                href="/estoque"
                className="btn-secondary flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider"
              >
                <Zap size={15} /> Simular venda
              </a>
            </div>
          )}
        </div>

        {/* Abas */}
        <div className="flex items-center gap-2 overflow-x-auto -mt-2" style={{ borderBottom: "1px solid var(--cf-border)" }}>
          {([
            { id: "geral", label: "Visão geral", icon: LayoutGrid },
            { id: "precificacao", label: "Precificação", icon: Calculator },
          ] as { id: Aba; label: string; icon: typeof LayoutGrid }[]).map((t) => (
            <button
              key={t.id}
              onClick={() => setAba(t.id)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold whitespace-nowrap cursor-pointer border-b-2 transition-colors"
              style={{
                color: aba === t.id ? "var(--primary)" : "var(--cf-text-2)",
                borderColor: aba === t.id ? "var(--primary)" : "transparent",
              }}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {aba === "geral" && (
        <>

        {/* Status dos canais */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span style={{ color: "var(--cf-text-3)" }}>Canais:</span>
          {(["mercadolivre", "shopee"] as Canal[]).map((c) => (
            <span
              key={c}
              className="px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5"
              style={{
                background: canaisConectados[c] ? "rgba(16,185,129,0.1)" : "var(--cf-input)",
                color: canaisConectados[c] ? "var(--success)" : "var(--cf-text-3)",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: canaisConectados[c] ? "var(--success)" : "var(--cf-text-4)" }} />
              {CANAL_INFO[c].label} {canaisConectados[c] ? "conectado" : "não conectado"}
            </span>
          ))}
        </div>

        {/* KPIs principais */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Kpi
            label="Valor de vendas"
            value={toBRL(kpis.total)}
            hint={labelPeriodo}
            icon={<DollarSign size={22} />}
            tone="success"
          />
          <Kpi
            label="Nº de vendas"
            value={String(kpis.pedidos)}
            hint={`${kpis.unidades} unidade(s) vendida(s)`}
            icon={<ShoppingCart size={22} />}
            tone="primary"
          />
          <Kpi
            label="Ticket médio"
            value={toBRL(kpis.ticket)}
            hint="Valor médio por pedido"
            icon={<Receipt size={22} />}
            tone="purple"
          />
          <Kpi
            label="Unidades vendidas"
            value={String(kpis.unidades)}
            hint={`${topProdutos.length} SKU(s) diferentes`}
            icon={<Layers size={22} />}
            tone="amber"
          />
        </div>

        {/* Split por canal + gráfico */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Por canal */}
          <div className="cf-card p-5 space-y-4">
            <h2 className="font-heading font-bold text-sm" style={{ color: "var(--cf-text)" }}>Vendas por canal</h2>
            {(["mercadolivre", "shopee"] as Canal[]).map((c) => {
              const d = c === "mercadolivre" ? kpis.ml : kpis.shopee;
              const pct = kpis.total > 0 ? (d.total / kpis.total) * 100 : 0;
              return (
                <div key={c} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold px-2 py-0.5 rounded" style={{ background: CANAL_INFO[c].bg, color: CANAL_INFO[c].fg }}>
                      {CANAL_INFO[c].label}
                    </span>
                    <span className="mono font-bold" style={{ color: "var(--cf-text)" }}>{toBRL(d.total)}</span>
                  </div>
                  <div className="cf-progress">
                    <div className="cf-progress-fill" style={{ width: `${pct}%`, background: CANAL_INFO[c].solid }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--cf-text-3)" }}>
                    <span>{d.pedidos} pedido(s) · {d.unidades} un</span>
                    <span>{pct.toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}

            {shopeeRepasse && (
              <div className="pt-3 mt-1 space-y-1.5" style={{ borderTop: "1px solid var(--cf-border)" }}>
                <div className="flex items-center justify-between text-xs">
                  <span style={{ color: "var(--cf-text-2)" }}>
                    Líquido a receber da Shopee
                    {shopeeRepasse.mock && (
                      <span className="ml-1.5 text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--cf-input)", color: "var(--cf-text-3)" }}>SIMULADO</span>
                    )}
                  </span>
                  <span className="mono font-bold" style={{ color: "var(--success)" }}>{toBRL(shopeeRepasse.pendente)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px]" style={{ color: "var(--cf-text-3)" }}>
                  <span>Já liberado (60d): {toBRL(shopeeRepasse.liberado)}</span>
                  <span>Taxas: {toBRL(shopeeRepasse.taxas)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Gráfico temporal */}
          <div className="cf-card p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-bold text-sm" style={{ color: "var(--cf-text)" }}>
                Evolução das vendas
              </h2>
              <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--cf-text-3)" }}>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: CANAL_INFO.mercadolivre.solid }} /> ML</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: CANAL_INFO.shopee.solid }} /> Shopee</span>
              </div>
            </div>
            {vendas.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-xs" style={{ color: "var(--cf-text-3)" }}>
                Sem vendas no período.
              </div>
            ) : (
              <svg
                viewBox="0 0 600 180" className="w-full" style={{ height: 160 }}
                role="img"
                aria-label="Gráfico de barras: vendas do Mercado Livre e Shopee por período — detalhamento na tabela abaixo"
              >
                {serie.buckets.map((b, i) => {
                  const n = serie.buckets.length;
                  const bw = Math.max(3, (560 / n) - 3);
                  const x = 30 + i * (560 / n);
                  const hMl = (b.ml / serie.max) * 150;
                  const hShp = (b.shopee / serie.max) * 150;
                  return (
                    <g key={b.key}>
                      <rect x={x} y={165 - hMl} width={bw} height={hMl} rx="2" fill={CANAL_INFO.mercadolivre.solid} />
                      <rect x={x} y={165 - hMl - hShp} width={bw} height={hShp} rx="2" fill={CANAL_INFO.shopee.solid} />
                      {(n <= 16 || i % Math.ceil(n / 12) === 0) && (
                        <text x={x + bw / 2} y={178} fontSize="8" fill="var(--cf-text-3)" textAnchor="middle">{b.label}</text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}
            {vendas.length > 0 && (
              <table className="sr-only">
                <caption>Vendas do Mercado Livre e Shopee por período</caption>
                <thead>
                  <tr>
                    <th scope="col">Período</th>
                    <th scope="col">Mercado Livre</th>
                    <th scope="col">Shopee</th>
                  </tr>
                </thead>
                <tbody>
                  {serie.buckets.map((b) => (
                    <tr key={b.key}>
                      <th scope="row">{b.label}</th>
                      <td>{toBRL(b.ml)}</td>
                      <td>{toBRL(b.shopee)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Top produtos + Controle de estoque */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Top produtos */}
          <div className="cf-card lg:col-span-2 overflow-hidden">
            <div className="p-5" style={{ borderBottom: "1px solid var(--cf-border)" }}>
              <h2 className="font-heading font-bold text-sm" style={{ color: "var(--cf-text)" }}>Produtos mais vendidos</h2>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--cf-text-3)" }}>Receita no período × estoque atual</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr style={{ background: "var(--cf-txhdr)", borderBottom: "1px solid var(--cf-border)" }}>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Produto</th>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--cf-text-2)" }}>Qtd</th>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--cf-text-2)" }}>Receita</th>
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--cf-text-2)" }}>Estoque</th>
                  </tr>
                </thead>
                <tbody>
                  {topProdutos.length === 0 ? (
                    <tr><td colSpan={4} className="text-center py-10 text-xs" style={{ color: "var(--cf-text-3)" }}>Nenhuma venda registrada no período.</td></tr>
                  ) : topProdutos.map((p) => {
                    const ruptura = p.estoque !== null && p.estoque <= 0;
                    const baixo = p.estoque !== null && !ruptura && p.estoque <= p.minQuantity;
                    return (
                      <tr key={p.sku} className="cf-tx" style={{ borderBottom: "1px solid var(--cf-border)" }}>
                        <td className="px-5 py-3">
                          <div className="text-xs font-semibold" style={{ color: "var(--cf-text)" }}>{p.name}</div>
                          <div className="text-[10px] mono" style={{ color: "var(--cf-text-3)" }}>{p.sku}</div>
                        </td>
                        <td className="px-5 py-3 text-right text-xs font-bold mono" style={{ color: "var(--cf-text)" }}>{p.qty}</td>
                        <td className="px-5 py-3 text-right text-xs font-bold mono" style={{ color: "var(--success)" }}>{toBRL(p.receita)}</td>
                        <td className="px-5 py-3 text-right">
                          {p.estoque === null ? (
                            <span className="text-[10px]" style={{ color: "var(--cf-text-3)" }}>—</span>
                          ) : (
                            <span
                              className="text-[10px] font-bold px-2 py-0.5 rounded-full mono"
                              style={ruptura
                                ? { background: "rgba(239,68,68,0.12)", color: "var(--danger)" }
                                : baixo
                                  ? { background: "rgba(245,158,11,0.12)", color: "var(--warning)" }
                                  : { background: "var(--cf-input)", color: "var(--cf-text-2)" }}
                            >
                              {ruptura ? "Sem estoque" : `${p.estoque} un`}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Controle de estoque */}
          <div className="cf-card p-5 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-heading font-bold text-sm" style={{ color: "var(--cf-text)" }}>Controle de estoque</h2>
              <a href="/estoque" className="text-[11px] font-bold flex items-center gap-1" style={{ color: "var(--primary)" }}>
                Gerenciar <ArrowRight size={12} />
              </a>
            </div>
            <div className="space-y-3 flex-1">
              <MiniRow icon={<Boxes size={15} />} label="Unidades em estoque" value={`${estoqueResumo.unidades}`} />
              <MiniRow icon={<DollarSign size={15} />} label="Valor imobilizado" value={toBRL(estoqueResumo.valor)} />
              <MiniRow
                icon={<AlertTriangle size={15} />}
                label="Estoque baixo"
                value={`${estoqueResumo.baixo}`}
                tone={estoqueResumo.baixo > 0 ? "warning" : undefined}
              />
              <MiniRow
                icon={<Package size={15} />}
                label="Sem estoque"
                value={`${estoqueResumo.zerado}`}
                tone={estoqueResumo.zerado > 0 ? "danger" : undefined}
              />
            </div>
            <p className="text-[11px] mt-4 pt-3" style={{ color: "var(--cf-text-3)", borderTop: "1px solid var(--cf-border)" }}>
              {estoqueResumo.itens} produto(s) cadastrado(s). Cada venda dá baixa automática e sincroniza os canais vinculados.
            </p>
          </div>
        </div>

        {/* Vendas recentes */}
        <div className="cf-card overflow-hidden">
          <div className="p-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--cf-border)" }}>
            <div>
              <h2 className="font-heading font-bold text-sm" style={{ color: "var(--cf-text)" }}>Vendas recentes</h2>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--cf-text-3)" }}>Últimos pedidos recebidos dos marketplaces</p>
            </div>
            <span className="text-[11px] font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ background: "rgba(16,185,129,0.1)", color: "var(--success)" }}>
              <TrendingUp size={12} /> Sincronizado no caixa
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ background: "var(--cf-txhdr)", borderBottom: "1px solid var(--cf-border)" }}>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Data</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Canal</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--cf-text-2)" }}>Produto</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--cf-text-2)" }}>Qtd</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--cf-text-2)" }}>Unitário</th>
                  <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--cf-text-2)" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {vendas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-14 text-sm" style={{ color: "var(--cf-text-3)" }}>
                      <ShoppingCart size={26} className="mx-auto mb-3 opacity-40" />
                      Nenhuma venda no período.<br />
                      <span className="text-xs">Vendas do Mercado Livre e da Shopee (reais ou simuladas em Estoque) aparecem aqui.</span>
                    </td>
                  </tr>
                ) : vendas.slice(0, 40).map((v) => {
                  const canal = (v.saleChannel || "mercadolivre") as Canal;
                  return (
                    <tr key={v.id} className="cf-tx" style={{ borderBottom: "1px solid var(--cf-border)" }}>
                      <td className="px-5 py-3 text-xs mono" style={{ color: "var(--cf-text-2)" }}>
                        {new Date(v.date + "T12:00:00").toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full" style={{ background: CANAL_INFO[canal].bg, color: CANAL_INFO[canal].fg }}>
                          {CANAL_INFO[canal].label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <div className="text-xs font-semibold" style={{ color: "var(--cf-text)" }}>
                          {v.description.replace(/^Venda (Mercado Livre|Shopee) · /, "")}
                        </div>
                        {v.saleSku && <div className="text-[10px] mono" style={{ color: "var(--cf-text-3)" }}>{v.saleSku}</div>}
                      </td>
                      <td className="px-5 py-3 text-right text-xs font-bold mono" style={{ color: "var(--cf-text)" }}>{v.saleQty || 1}</td>
                      <td className="px-5 py-3 text-right text-xs mono" style={{ color: "var(--cf-text-2)" }}>
                        {toBRL(v.saleUnitPrice || (v.amount / (v.saleQty || 1)))}
                      </td>
                      <td className="px-5 py-3 text-right text-xs font-bold mono" style={{ color: "var(--success)" }}>
                        + {toBRL(v.amount || 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        </>
        )}

        {aba === "precificacao" && <PrecificacaoTab />}

      </main>
    </div>
  );
}

// ─── Aba Precificação ─────────────────────────────────────────────────────────
//
// Markup por dentro. O custo do produto e o custo variável (embalagem, frete
// fixo por envio, comissão já convertida em R$…) são valores em reais e somam
// no numerador; impostos e margem desejada são % sobre o preço de venda e
// entram no divisor:
//
//   preço = (custo do produto + custo variável) ÷ (1 − (impostos% + margem%) / 100)
//
// Assim, no preço sugerido: impostos e lucro são exatamente os percentuais
// informados, e o que sobra cobre o custo do produto + o custo variável.

function PrecificacaoTab() {
  const [custo, setCusto] = useState<number | "">("");
  const [impostos, setImpostos] = useState<number | "">("");
  const [custoVar, setCustoVar] = useState<number | "">("");
  const [margem, setMargem] = useState<number | "">("");

  const calc = useMemo(() => {
    const c = Number(custo) || 0;
    const v = Number(custoVar) || 0;
    const iPct = Number(impostos) || 0;
    const mPct = Number(margem) || 0;

    const custoTotal = c + v;
    const deducoes = (iPct + mPct) / 100;
    const inviavel = deducoes >= 1;
    const preco = custoTotal > 0 && !inviavel ? custoTotal / (1 - deducoes) : 0;

    return {
      c, v, iPct, mPct,
      custoTotal,
      inviavel,
      preco,
      valorImpostos: preco * (iPct / 100),
      lucro: preco * (mPct / 100),
      markup: custoTotal > 0 && preco > 0 ? preco / custoTotal : 0,
    };
  }, [custo, impostos, custoVar, margem]);

  const setNum = (fn: (v: number | "") => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    fn(e.target.value === "" ? "" : Number(e.target.value));

  const field = (
    label: string, hint: string,
    value: number | "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
    suffix: string,
  ) => (
    <div>
      <label className="block text-xs font-bold mb-1" style={{ color: "var(--cf-text)" }}>{label}</label>
      <p className="text-[11px] mb-1.5" style={{ color: "var(--cf-text-3)" }}>{hint}</p>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold pointer-events-none" style={{ color: "var(--cf-text-3)" }}>
          {suffix === "R$" ? "R$" : ""}
        </span>
        <input
          type="number"
          min="0"
          inputMode="decimal"
          value={value}
          onChange={onChange}
          placeholder="0"
          className={`w-full py-2.5 rounded-lg border outline-none font-mono text-sm ${suffix === "R$" ? "pl-9 pr-3" : "pl-3 pr-9"}`}
          style={{ background: "var(--cf-input)", borderColor: "var(--cf-border)", color: "var(--cf-text)" }}
        />
        {suffix === "%" && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold pointer-events-none" style={{ color: "var(--cf-text-3)" }}>%</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Entradas */}
      <div className="cf-card p-6">
        <div className="flex items-center gap-3 mb-2">
          <Calculator size={22} style={{ color: "var(--primary)" }} />
          <h2 className="font-heading text-lg font-bold" style={{ color: "var(--cf-text)" }}>
            Calculadora de Precificação
          </h2>
        </div>
        <p className="text-sm mb-6" style={{ color: "var(--cf-text-2)" }}>
          Descubra o preço de venda que garante a margem desejada depois de pagar
          impostos e os custos variáveis por unidade (embalagem, frete, comissão).
        </p>
        <div className="space-y-4">
          {field("Custo do produto", "Quanto o produto custa para você (compra ou produção).", custo, setNum(setCusto), "R$")}
          {field("Custo variável", "Embalagem, etiqueta, frete e comissão do canal — em R$ por unidade.", custoVar, setNum(setCustoVar), "R$")}
          {field("Impostos e taxas", "Tributos sobre a venda — Simples, ICMS, etc.", impostos, setNum(setImpostos), "%")}
          {field("Margem de lucro desejada", "Lucro líquido que você quer sobre o preço de venda.", margem, setNum(setMargem), "%")}
        </div>
      </div>

      {/* Resultado */}
      <div className="cf-card p-6 flex flex-col">
        <h3 className="font-heading text-sm font-bold mb-1" style={{ color: "var(--cf-text)" }}>Preço de venda sugerido</h3>

        {calc.inviavel ? (
          <div className="flex-1 flex items-center">
            <div className="w-full text-sm font-semibold p-4 rounded-xl" style={{ background: "rgba(239,68,68,0.1)", color: "var(--danger)" }}>
              Impostos + margem somam 100% ou mais do preço.
              Não há preço possível — reduza a margem ou os impostos.
            </div>
          </div>
        ) : (
          <>
            <div className="text-4xl md:text-5xl font-extrabold mono my-4" style={{ color: "var(--primary)" }}>
              {toBRL(calc.preco)}
            </div>
            {calc.markup > 0 && (
              <p className="text-[11px] mb-4" style={{ color: "var(--cf-text-3)" }}>
                Markup de <span className="font-bold mono">{calc.markup.toFixed(2)}×</span> sobre o custo total (produto + variável).
              </p>
            )}

            <div className="space-y-2.5 mt-auto pt-4 text-sm" style={{ borderTop: "1px solid var(--cf-border)" }}>
              <Linha label="Custo do produto" value={toBRL(calc.c)} />
              <Linha label="Custo variável" value={toBRL(calc.v)} color="var(--danger)" />
              <Linha label={`Impostos e taxas (${calc.iPct || 0}%)`} value={toBRL(calc.valorImpostos)} color="var(--danger)" />
              <Linha label={`Lucro líquido (${calc.mPct || 0}%)`} value={toBRL(calc.lucro)} color="var(--success)" bold />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Linha({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span style={{ color: "var(--cf-text-2)" }}>{label}</span>
      <span className="mono font-semibold" style={{ color: color ?? "var(--cf-text)" }}>{value}</span>
    </div>
  );
}

// ─── Subcomponentes ───────────────────────────────────────────────────────────

function Kpi({ label, value, hint, icon, tone }: {
  label: string; value: string; hint: string; icon: React.ReactNode;
  tone: "success" | "primary" | "purple" | "amber";
}) {
  const toneMap = {
    success: { bg: "rgba(16,185,129,0.1)", fg: "var(--success)" },
    primary: { bg: "rgba(21,101,192,0.1)", fg: "var(--primary)" },
    purple: { bg: "var(--brand-weak)", fg: "var(--brand)" },
    amber: { bg: "rgba(245,158,11,0.12)", fg: "var(--warning)" },
  }[tone];
  return (
    <div className="cf-kpi p-5 flex items-center justify-between">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--cf-text-3)" }}>{label}</h2>
        <p className="font-heading text-2xl font-bold mt-1.5 mono" style={{ color: "var(--cf-text)" }}>{value}</p>
        <p className="text-[11px] mt-1" style={{ color: "var(--cf-text-3)" }}>{hint}</p>
      </div>
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: toneMap.bg, color: toneMap.fg }}>
        {icon}
      </div>
    </div>
  );
}

function MiniRow({ icon, label, value, tone }: {
  icon: React.ReactNode; label: string; value: string; tone?: "warning" | "danger";
}) {
  const color = tone === "danger" ? "var(--danger)" : tone === "warning" ? "var(--warning)" : "var(--cf-text)";
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5 text-xs" style={{ color: "var(--cf-text-2)" }}>
        <span style={{ color: "var(--cf-text-3)" }}>{icon}</span>
        {label}
      </div>
      <span className="text-sm font-bold mono" style={{ color }}>{value}</span>
    </div>
  );
}
