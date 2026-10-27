// lib/tour/catalog.ts
// Catálogo do tour guiado: só a ESTRUTURA de cada etapa (rota, permissão,
// alvo do destaque, animação). Os textos moram em messages/<locale>/tour.json
// (steps.<id>.*) — assim o servidor (rota de áudio) e o cliente leem a mesma
// fonte e ninguém consegue pedir narração de um texto arbitrário.
//
// Para documentar uma funcionalidade nova: adicione um item aqui + o bloco
// steps.<id> nos 3 idiomas. Nada mais muda.

import type { PermissionKey } from "@/lib/accountScope";

export type TourAnimation = "bars" | "flow" | "calendar" | "receipt" | "cart" | "boxes" | "sync" | "report" | "team" | "gear";

export interface TourStepDef {
  id: string;
  order: number;
  /** Rota (sem prefixo de idioma) aberta no tour completo; null = só o modal. */
  route: string | null;
  /** Valor de data-tour-target do elemento real a destacar (ver Navbar). */
  target: string | null;
  /** Categoria de permissão exigida; "owner" = só o dono; null = qualquer login. */
  permission: PermissionKey | "owner" | null;
  animation: TourAnimation;
  /** Etapas que fazem mais sentido depois destas (informativo). */
  prerequisites?: string[];
}

export const TOUR_STEPS: readonly TourStepDef[] = [
  { id: "dashboard", order: 1, route: "/dashboard", target: "nav-dashboard", permission: "dashboard", animation: "bars" },
  { id: "fluxoCaixa", order: 2, route: "/fluxo-caixa", target: "nav-fluxoCaixa", permission: "fluxoCaixa", animation: "flow" },
  { id: "contasPagar", order: 3, route: "/contasPagar", target: "nav-contasPagar", permission: "contasPagar", animation: "calendar" },
  { id: "contasReceber", order: 4, route: "/contasReceber", target: "nav-contasReceber", permission: "contasReceber", animation: "receipt" },
  { id: "faturamento", order: 5, route: "/relatorios", target: "nav-relatorios", permission: "relatorios", animation: "bars", prerequisites: ["fluxoCaixa", "contasReceber"] },
  { id: "vendas", order: 6, route: "/vendas", target: "nav-vendas", permission: "vendas", animation: "cart" },
  { id: "estoque", order: 7, route: "/estoque", target: "nav-estoque", permission: "estoque", animation: "boxes" },
  { id: "integracoes", order: 8, route: "/estoque", target: "nav-estoque", permission: "estoque", animation: "sync", prerequisites: ["estoque"] },
  { id: "relatorios", order: 9, route: "/relatorios", target: "nav-relatorios", permission: "relatorios", animation: "report" },
  { id: "impostos", order: 10, route: "/impostos", target: "nav-impostos", permission: "impostos", animation: "receipt" },
  { id: "centroCustos", order: 11, route: "/costCenter", target: "nav-centroCustos", permission: "centroCustos", animation: "bars" },
  { id: "equipe", order: 12, route: "/users", target: "nav-usuarios", permission: "owner", animation: "team" },
  { id: "configuracoes", order: 13, route: "/configuracoes", target: null, permission: null, animation: "gear" },
];

export const TOUR_STEP_IDS: readonly string[] = TOUR_STEPS.map((s) => s.id);

export function getStep(id: string | null | undefined): TourStepDef | undefined {
  return TOUR_STEPS.find((s) => s.id === id);
}

export interface TourAccess {
  isOwner: boolean;
  permissions: "all" | readonly PermissionKey[];
}

/** O usuário pode ver a explicação desta etapa? (nunca oferece atalho a área sem permissão) */
export function canAccessStep(step: TourStepDef, access: TourAccess): boolean {
  if (step.permission === null) return true;
  if (step.permission === "owner") return access.isOwner;
  return access.permissions === "all" || access.permissions.includes(step.permission);
}

export function visibleSteps(access: TourAccess): TourStepDef[] {
  return [...TOUR_STEPS].sort((a, b) => a.order - b.order).filter((s) => canAccessStep(s, access));
}

/** Etapa que explica a rota atual (para "Entenda esta página"). */
export function stepForPath(pathname: string, access: TourAccess): TourStepDef | undefined {
  const norm = pathname.replace(/\/+$/, "") || "/";
  return visibleSteps(access)
    .filter((s) => s.route && (norm === s.route || norm.startsWith(s.route + "/")))
    .sort((a, b) => (b.route?.length ?? 0) - (a.route?.length ?? 0))[0];
}
