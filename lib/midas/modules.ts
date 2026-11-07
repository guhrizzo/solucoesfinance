// lib/midas/modules.ts
// Catálogo de módulos que o Midas apresenta na demonstração.

import type { TourAnimation } from "@/lib/tour/catalog";
import type { Pain } from "./types";

export interface MidasModule {
  id: string;
  /** Nome do ícone Lucide. */
  icon: string;
  pro: boolean;
  tourStepId: string | null;
  animation: TourAnimation;
}

export const MIDAS_MODULES: readonly MidasModule[] = [
  { id: "fluxoCaixa", icon: "wallet", pro: false, tourStepId: "fluxoCaixa", animation: "flow" },
  { id: "contasPagar", icon: "receipt-text", pro: false, tourStepId: "contasPagar", animation: "calendar" },
  { id: "contasReceber", icon: "banknote", pro: false, tourStepId: "contasReceber", animation: "receipt" },
  { id: "relatorios", icon: "chart-bar", pro: false, tourStepId: "relatorios", animation: "report" },
  { id: "estoque", icon: "package", pro: false, tourStepId: "estoque", animation: "boxes" },
  { id: "vendas", icon: "shopping-cart", pro: false, tourStepId: "vendas", animation: "cart" },
  { id: "integracoes", icon: "plug", pro: false, tourStepId: "integracoes", animation: "sync" },
  { id: "impostos", icon: "percent", pro: false, tourStepId: "impostos", animation: "receipt" },
  { id: "centroCustos", icon: "landmark", pro: false, tourStepId: "centroCustos", animation: "bars" },
  { id: "dashboard", icon: "layout-dashboard", pro: false, tourStepId: "dashboard", animation: "bars" },
  { id: "cobrancaEmail", icon: "mail-check", pro: true, tourStepId: null, animation: "receipt" },
  { id: "leitorNf", icon: "scan-text", pro: true, tourStepId: null, animation: "receipt" },
  { id: "rh", icon: "users", pro: true, tourStepId: null, animation: "team" },
  { id: "pdv", icon: "store", pro: true, tourStepId: null, animation: "cart" },
  { id: "alertasWhatsapp", icon: "bell-ring", pro: true, tourStepId: null, animation: "sync" },
];

const BY_PAIN: Record<Pain, string[]> = {
  financeiro: ["fluxoCaixa", "dashboard", "relatorios"],
  contas: ["contasPagar", "contasReceber", "fluxoCaixa"],
  estoque: ["estoque", "integracoes", "vendas"],
  vendas: ["vendas", "integracoes", "relatorios"],
  impostos: ["impostos", "relatorios", "fluxoCaixa"],
  relatorios: ["relatorios", "dashboard", "centroCustos"],
  canais: ["integracoes", "vendas", "estoque"],
  tudo: ["dashboard", "fluxoCaixa", "estoque"],
};

/** 2–3 ids de módulos, ordenados por relevância para a dor principal. */
export function modulesForPain(pain: Pain): string[] {
  return [...(BY_PAIN[pain] ?? BY_PAIN.tudo)];
}
