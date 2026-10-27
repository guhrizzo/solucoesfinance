"use client";

import {
  LayoutDashboard, TrendingUp, CreditCard, DollarSign, Receipt, ShoppingCart, Boxes, RefreshCw,
  FileText, Landmark, BarChart2, Users, Settings, Sparkles,
} from "lucide-react";
import type { TourAnimation } from "@/lib/tour/catalog";

export const STEP_ICONS: Record<string, React.ElementType> = {
  dashboard: LayoutDashboard,
  fluxoCaixa: TrendingUp,
  contasPagar: CreditCard,
  contasReceber: DollarSign,
  faturamento: Receipt,
  vendas: ShoppingCart,
  estoque: Boxes,
  integracoes: RefreshCw,
  relatorios: FileText,
  impostos: Landmark,
  centroCustos: BarChart2,
  equipe: Users,
  configuracoes: Settings,
};

export function StepIcon({ id, size = 16, strokeWidth }: { id: string; size?: number; strokeWidth?: number }) {
  const Icon = STEP_ICONS[id] ?? Sparkles;
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" />;
}

/** Cena animada em CSS puro (sem vídeo): ícone flutuando + decoração por tipo. */
export function TourIllustration({ stepId, animation }: { stepId: string; animation: TourAnimation }) {
  return (
    <div className="nxt-stage" aria-hidden="true">
      {animation === "bars" || animation === "report" ? (
        <div className="nxt-bars"><i /><i /><i /><i /></div>
      ) : animation === "flow" ? (
        <div className="nxt-flow"><i /><i /><i /><i /></div>
      ) : (
        <div className="nxt-orbit"><i /><i /><i /></div>
      )}
      <div className="nxt-stage-icon"><StepIcon id={stepId} size={26} strokeWidth={2} /></div>
    </div>
  );
}
