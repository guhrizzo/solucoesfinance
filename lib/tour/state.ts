// lib/tour/state.ts
// Estado persistido do tour (users/{uid}/profile/tour) e regras de oferta.
// Puro (sem Firebase/React) para ser testável com node --test.
//
// "Nunca iniciado" = documento ausente. "Dispensado" difere de "concluído":
// quem dispensa só volta a ver a oferta automática uma vez, 30 dias depois;
// quem conclui nunca mais é interrompido. O acesso manual (botão de ajuda)
// está sempre disponível.

export type TourStatus = "never" | "in_progress" | "completed" | "dismissed";

export interface TourState {
  status: TourStatus;
  lastStepId: string | null;
  dismissCount: number;
  updatedAt: number;
}

export const DEFAULT_TOUR_STATE: TourState = {
  status: "never",
  lastStepId: null,
  dismissCount: 0,
  updatedAt: 0,
};

export const REOFFER_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_DISMISSALS_FOR_REOFFER = 1;

const STATUSES: readonly TourStatus[] = ["never", "in_progress", "completed", "dismissed"];

export function normalizeTourState(raw: unknown, validStepIds: readonly string[]): TourState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_TOUR_STATE };
  const r = raw as Record<string, unknown>;
  const status = STATUSES.includes(r.status as TourStatus) ? (r.status as TourStatus) : "never";
  const last = typeof r.lastStepId === "string" && validStepIds.includes(r.lastStepId) ? r.lastStepId : null;
  return {
    status,
    lastStepId: last,
    dismissCount: typeof r.dismissCount === "number" && r.dismissCount >= 0 ? Math.floor(r.dismissCount) : 0,
    updatedAt: typeof r.updatedAt === "number" ? r.updatedAt : 0,
  };
}

export interface OfferContext {
  /** Questionário inicial do dono já respondido (ou usuário é membro). */
  setupDone: boolean;
  /** Assinatura/trial ativos — não oferece o tour por cima do paywall. */
  accessActive: boolean;
  now: number;
}

/** Deve a tela de boas-vindas abrir sozinha? */
export function shouldAutoOffer(state: TourState, ctx: OfferContext): boolean {
  if (!ctx.setupDone || !ctx.accessActive) return false;
  switch (state.status) {
    case "never":
      return true;
    case "dismissed":
      return state.dismissCount <= MAX_DISMISSALS_FOR_REOFFER && ctx.now - state.updatedAt >= REOFFER_AFTER_MS;
    default:
      return false; // em andamento ou concluído: nunca interrompe sozinho
  }
}

/** Próximo/anterior dentro da lista visível; null nas pontas. */
export function neighbor(ids: readonly string[], current: string, dir: 1 | -1): string | null {
  const i = ids.indexOf(current);
  if (i === -1) return null;
  return ids[i + dir] ?? null;
}
