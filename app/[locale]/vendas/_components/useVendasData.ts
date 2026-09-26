"use client";

import { useEffect, useMemo, useState } from "react";
import { budgetForCenterMonth } from "@/lib/costCenterSync";
import {
  CANAIS_QUEBRA, TODOS_CANAIS, monthKey, prevMonthKey,
  type Canal, type CashflowTx, type Integracao, type ProdutoEstoque, type VendasFiltros,
} from "./shared";

// Fonte do orçamento do mês (mesmo cálculo do KPI "Orçamento" do Fluxo de
// Caixa — ver app/components/CashFlow.tsx e lib/costCenterSync.ts): orçamento
// dos centros de custo no mês + contas a pagar que vencem no mês + impostos
// que vencem no mês. Aqui só precisamos do suficiente pra somar o total.
interface CostCenterBudget {
  id: string;
  budget?: number;
  budgetsByMonth?: Record<string, number>;
}
interface ForecastAmount {
  id: string;
  amount: number;
  dueDate: string;
}

export interface Resumo {
  bruto: number;
  taxas: number;
  liquido: number;
  pedidos: number;
  unidades: number;
  ticket: number;
}

const resumir = (vendas: CashflowTx[], taxas: CashflowTx[]): Resumo => {
  const bruto = vendas.reduce((s, v) => s + (v.amount || 0), 0);
  const tx = taxas.reduce((s, v) => s + (v.amount || 0), 0);
  const pedidos = vendas.length;
  return {
    bruto,
    taxas: tx,
    liquido: bruto - tx,
    pedidos,
    unidades: vendas.reduce((s, v) => s + (v.saleQty || 1), 0),
    ticket: pedidos > 0 ? bruto / pedidos : 0,
  };
};

/**
 * Listeners do Firestore + todos os derivados do painel de vendas. A página
 * só compõe a UI; os filtros da barra (canal/produto) e o mês da Navbar
 * entram aqui e valem pra KPIs, gráfico, rankings e lista.
 */
export function useVendasData(ownerUid: string, mesSelecionado: string, filtros: VendasFiltros) {
  const [txs, setTxs] = useState<CashflowTx[]>([]);
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [integracoes, setIntegracoes] = useState<Integracao[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenterBudget[]>([]);
  const [bills, setBills] = useState<ForecastAmount[]>([]);
  const [taxes, setTaxes] = useState<ForecastAmount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ownerUid) return;
    const unsubs: (() => void)[] = [];
    let cancelled = false;

    (async () => {
      try {
        const { getFirebase } = await import("@/lib/firebase");
        const { db } = await getFirebase();
        const { collection, onSnapshot, query, where, orderBy } = await import("firebase/firestore");
        if (cancelled) return;

        const qTx = query(collection(db, "users", ownerUid, "cashflow"), orderBy("createdAt", "desc"));
        unsubs.push(onSnapshot(qTx, (snap) => {
          setTxs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CashflowTx)));
          setLoading(false);
        }, (err) => { console.error("Erro vendas/cashflow:", err); setLoading(false); }));

        const qEstoque = query(collection(db, "estoque"), where("userId", "==", ownerUid));
        unsubs.push(onSnapshot(qEstoque, (snap) => {
          setProdutos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ProdutoEstoque)));
        }));

        const qInteg = query(collection(db, "integracoes"), where("userId", "==", ownerUid));
        unsubs.push(onSnapshot(qInteg, (snap) => {
          setIntegracoes(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Integracao)));
        }));

        // Orçamento do mês (ponto de equilíbrio). Erro aqui não trava a página.
        const qCenters = query(collection(db, "costCenters"), where("userId", "==", ownerUid));
        unsubs.push(onSnapshot(qCenters, (snap) => {
          setCostCenters(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CostCenterBudget)));
        }, (err) => console.debug("Aviso ao sincronizar orçamento (centros):", err.code)));

        const toForecast = (d: { id: string; data: () => Record<string, unknown> }) => {
          const x = d.data();
          return { id: d.id, amount: Number(x.amount) || 0, dueDate: (x.dueDate as string) || "" };
        };
        unsubs.push(onSnapshot(collection(db, "users", ownerUid, "bills"),
          (snap) => setBills(snap.docs.map(toForecast)),
          (err) => console.debug("Aviso ao sincronizar orçamento (contas a pagar):", err.code)));
        unsubs.push(onSnapshot(collection(db, "users", ownerUid, "taxes"),
          (snap) => setTaxes(snap.docs.map(toForecast)),
          (err) => console.debug("Aviso ao sincronizar orçamento (impostos):", err.code)));
      } catch (err) {
        console.error("Erro ao configurar listeners de vendas:", err);
        setLoading(false);
      }
    })();

    return () => { cancelled = true; unsubs.forEach((u) => u()); };
  }, [ownerUid]);

  // ── Vendas e taxas de marketplace (todos os meses) ──────────────────────────
  // Venda = ENTRADA com canal conhecido. Antes o filtro só aceitava ML, Shopee
  // e manual — as vendas do TikTok Shop ficavam de fora do painel inteiro.
  const { todasVendas, todasTaxas } = useMemo(() => {
    const vendas: CashflowTx[] = [];
    const taxas: CashflowTx[] = [];
    for (const t of txs) {
      if (!t.saleChannel || !TODOS_CANAIS.includes(t.saleChannel)) continue;
      if (t.type === "entrada") vendas.push(t);
      else if (t.type === "saida" && t.isMarketplaceFee) taxas.push(t);
    }
    return { todasVendas: vendas, todasTaxas: taxas };
  }, [txs]);

  const passaFiltro = useMemo(() => {
    const sku = filtros.sku.toUpperCase();
    return (t: CashflowTx) =>
      (filtros.canal === "todos" || t.saleChannel === filtros.canal) &&
      (!sku || (t.saleSku || "").toUpperCase() === sku);
  }, [filtros]);

  const doMes = (list: CashflowTx[], key: string) =>
    list.filter((v) => (v.date || "").slice(0, 7) === key && passaFiltro(v));

  const mesAnterior = prevMonthKey(mesSelecionado);

  const vendas = useMemo(() => doMes(todasVendas, mesSelecionado),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todasVendas, mesSelecionado, passaFiltro]);

  const resumo = useMemo(
    () => resumir(vendas, doMes(todasTaxas, mesSelecionado)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vendas, todasTaxas, mesSelecionado, passaFiltro],
  );

  const resumoAnterior = useMemo(
    () => resumir(doMes(todasVendas, mesAnterior), doMes(todasTaxas, mesAnterior)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todasVendas, todasTaxas, mesAnterior, passaFiltro],
  );

  // ── Quebra por canal (respeita só o filtro de produto) ──────────────────────
  const porCanal = useMemo(() => {
    const sku = filtros.sku.toUpperCase();
    const base = todasVendas.filter(
      (v) => (v.date || "").slice(0, 7) === mesSelecionado && (!sku || (v.saleSku || "").toUpperCase() === sku),
    );
    const total = base.reduce((s, v) => s + (v.amount || 0), 0);
    return CANAIS_QUEBRA.map((c) => {
      const list = base.filter((v) => v.saleChannel === c);
      const valor = list.reduce((s, v) => s + (v.amount || 0), 0);
      return {
        canal: c,
        total: valor,
        pedidos: list.length,
        unidades: list.reduce((s, v) => s + (v.saleQty || 1), 0),
        pct: total > 0 ? (valor / total) * 100 : 0,
      };
    });
  }, [todasVendas, mesSelecionado, filtros.sku]);

  // ── Ponto de equilíbrio (sempre sobre o faturamento TOTAL do mês) ───────────
  // É uma meta da empresa, não de um canal — por isso ignora os filtros.
  const mesAtual = useMemo(() => monthKey(new Date()), []);

  const pontoEquilibrio = useMemo(() => {
    const centros = costCenters.reduce((s, c) => s + budgetForCenterMonth(c, mesSelecionado, mesAtual), 0);
    const contasM = bills.filter((b) => (b.dueDate || "").slice(0, 7) === mesSelecionado).reduce((s, b) => s + b.amount, 0);
    const impostosM = taxes.filter((x) => (x.dueDate || "").slice(0, 7) === mesSelecionado).reduce((s, x) => s + x.amount, 0);
    const meta = centros + contasM + impostosM;
    const vendido = todasVendas
      .filter((v) => (v.date || "").slice(0, 7) === mesSelecionado)
      .reduce((s, v) => s + (v.amount || 0), 0);
    return {
      meta,
      vendido,
      pct: meta > 0 ? Math.min(100, (vendido / meta) * 100) : 0,
      atingido: meta > 0 && vendido >= meta,
      falta: Math.max(0, meta - vendido),
      superavit: Math.max(0, vendido - meta),
    };
  }, [costCenters, bills, taxes, todasVendas, mesSelecionado, mesAtual]);

  // ── Série diária (barras empilhadas por canal) ─────────────────────────────
  const serie = useMemo(() => {
    const [y, m] = mesSelecionado.split("-").map(Number);
    const dias = new Date(y, m, 0).getDate();
    const buckets = Array.from({ length: dias }, (_, i) => ({
      dia: i + 1,
      key: `${mesSelecionado}-${String(i + 1).padStart(2, "0")}`,
      porCanal: {} as Partial<Record<Canal, number>>,
      total: 0,
    }));
    for (const v of vendas) {
      const b = buckets[Number((v.date || "").slice(8, 10)) - 1];
      if (!b || !v.saleChannel) continue;
      b.porCanal[v.saleChannel] = (b.porCanal[v.saleChannel] || 0) + (v.amount || 0);
      b.total += v.amount || 0;
    }
    return { buckets, metaDiaria: pontoEquilibrio.meta > 0 ? pontoEquilibrio.meta / dias : 0 };
  }, [vendas, mesSelecionado, pontoEquilibrio.meta]);

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
        return { ...r, name: p?.name || r.sku, estoque: p?.quantity ?? null, minQuantity: p?.minQuantity ?? 0 };
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

  const canaisConectados = useMemo<Record<Canal, boolean>>(() => ({
    mercadolivre: integracoes.some((i) => i.platform === "mercadolivre"),
    shopee: integracoes.some((i) => i.platform === "shopee"),
    tiktokshop: integracoes.some((i) => i.platform === "tiktokshop"),
    shein: integracoes.some((i) => i.platform === "shein"),
    manual: true, // venda manual sempre disponível
  }), [integracoes]);

  // SKUs que já tiveram venda + os do estoque — opções do filtro de produto.
  const opcoesProduto = useMemo(() => {
    const map = new Map<string, string>();
    produtos.forEach((p) => map.set(p.sku.toUpperCase(), p.name || p.sku));
    todasVendas.forEach((v) => {
      const sku = (v.saleSku || "").toUpperCase();
      if (sku && !map.has(sku)) map.set(sku, sku);
    });
    return [...map.entries()]
      .map(([sku, name]) => ({ sku, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [produtos, todasVendas]);

  return {
    loading, produtos, vendas, resumo, resumoAnterior, porCanal, pontoEquilibrio,
    serie, topProdutos, estoqueResumo, canaisConectados, opcoesProduto,
  };
}
