"use client";

// ─── Mês global compartilhado ────────────────────────────────────────────────
// Um único "mês selecionado" pra todo o app (Dashboard, Contas a pagar,
// Impostos, Contas a receber, Centro de custos). O stepper na Navbar
// (‹ Out 2024 ›) controla este estado; as páginas leem `refDate` / `monthKey`
// pra filtrar seus dados. Persistido em localStorage, então a escolha
// sobrevive a recarga e troca de página.
//
// Páginas com recorte próprio (Relatórios: mês/ano; Vendas: mês/30d/tudo) NÃO
// usam este contexto. Páginas sem conceito de mês (Fluxo de caixa, Estoque,
// Usuários) escondem o seletor via <Navbar hidePeriod />.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "nexusfi-period"; // formato "YYYY-MM"

interface PeriodContextValue {
  /** Primeiro dia do mês selecionado (00:00 local). */
  refDate: Date;
  /** "YYYY-MM" do mês selecionado — pra comparar com `date.slice(0, 7)`. */
  monthKey: string;
  /** Rótulo curto pt-BR, ex.: "Out 2024". */
  label: string;
  /** true quando o mês selecionado é o mês corrente. */
  isCurrentMonth: boolean;
  goPrevMonth: () => void;
  goNextMonth: () => void;
  /** Define o mês a partir de qualquer Date (usa só ano/mês). */
  setMonth: (d: Date) => void;
}

const PeriodContext = createContext<PeriodContextValue | null>(null);

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const toKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  // Estado inicial é sempre o mês corrente — igual ao que o servidor (sem
  // acesso a localStorage) renderiza. Ler o valor salvo já no primeiro render
  // do cliente faria esse render divergir do HTML do SSR (hydration mismatch)
  // pra quem tem outro mês salvo. O valor real é aplicado no effect de mount,
  // depois da hidratação — mesmo padrão de useNavbarLayout/useTheme.
  const [refDate, setRefDate] = useState<Date>(() => startOfMonth(new Date()));

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && /^\d{4}-\d{2}$/.test(saved)) {
        const [y, m] = saved.split("-").map(Number);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- intencional: corrige o default SSR-safe pro mês salvo depois da hidratação
        setRefDate(new Date(y, m - 1, 1));
      }
    } catch {
      /* ambiente sem localStorage — segue no mês corrente */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, toKey(refDate));
    } catch {
      /* noop */
    }
  }, [refDate]);

  const goPrevMonth = useCallback(
    () => setRefDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1)),
    []
  );
  const goNextMonth = useCallback(
    () => setRefDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1)),
    []
  );
  const setMonth = useCallback((d: Date) => setRefDate(startOfMonth(d)), []);

  const value = useMemo<PeriodContextValue>(() => {
    const now = new Date();
    const label = refDate
      .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
      .replace(/^\w/, (c) => c.toUpperCase())
      .replace(/\./g, "");
    return {
      refDate,
      monthKey: toKey(refDate),
      label,
      isCurrentMonth:
        now.getFullYear() === refDate.getFullYear() &&
        now.getMonth() === refDate.getMonth(),
      goPrevMonth,
      goNextMonth,
      setMonth,
    };
  }, [refDate, goPrevMonth, goNextMonth, setMonth]);

  return (
    <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
  );
}

export function usePeriod(): PeriodContextValue {
  const ctx = useContext(PeriodContext);
  if (!ctx) {
    throw new Error("usePeriod precisa estar dentro de <PeriodProvider>");
  }
  return ctx;
}
