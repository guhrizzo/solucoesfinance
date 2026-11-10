// lib/tour/state.ts
// Estado persistido do tour (users/{uid}/profile/tour). Sem oferta automática: a apresentação de entrada é do Midas.
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

/** Próximo/anterior dentro da lista visível; null nas pontas. */
export function neighbor(ids: readonly string[], current: string, dir: 1 | -1): string | null {
  const i = ids.indexOf(current);
  if (i === -1) return null;
  return ids[i + dir] ?? null;
}

/** Evento de janela que abre o menu do guia (Configurações, menu da conta). */
export const OPEN_EVENT = "nexusfi:open-tour";
