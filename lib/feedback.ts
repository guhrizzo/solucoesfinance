// lib/feedback.ts
// Canal de bugs & sugestões de melhoria enviados pelos usuários a partir de
// /configuracoes. Os documentos moram na coleção raiz `feedback` e são
// escritos/lidos SOMENTE pelo Admin SDK (rotas app/api/feedback/*) — o client
// nunca toca a coleção direto (firestore.rules nega por padrão).
//
// Só os e-mails de `lib/compAccounts` (adm supremo) enxergam todos os
// chamados e podem marcá-los como resolvidos; ao resolver, o usuário que
// abriu recebe um e-mail com o que foi feito.

export type FeedbackType = "bug" | "melhoria";
export type FeedbackStatus = "aberto" | "resolvido";

export interface FeedbackDoc {
  id: string;
  type: FeedbackType;
  /** Onde acontece (bug) / onde deveria aparecer ou mudar (melhoria). */
  local: string;
  /** O que aconteceu (bug) / como funciona hoje (melhoria). Opcional p/ melhoria. */
  atual: string;
  /** O que deveria acontecer. */
  esperado: string;
  status: FeedbackStatus;

  // Quem abriu
  userId: string;
  userEmail: string;
  userName: string;
  /** Dono da conta de quem abriu — só contexto. */
  ownerId: string;

  createdAt: number;
  updatedAt: number;

  // Resolução (preenchido pelo adm supremo)
  resolvedAt: number | null;
  resolvedByEmail: string | null;
  resolution: string | null;
  /** Quando o e-mail de retorno foi enviado ao usuário. */
  notifiedAt: number | null;
}

export const FEEDBACK_LIMITS = {
  local: 160,
  atual: 4000,
  esperado: 4000,
  resolution: 4000,
} as const;

export const FEEDBACK_TYPE_LABEL: Record<FeedbackType, string> = {
  bug: "Bug",
  melhoria: "Melhoria",
};

export function isFeedbackType(v: unknown): v is FeedbackType {
  return v === "bug" || v === "melhoria";
}

/** Rótulos do formulário — mudam conforme é bug ou sugestão de melhoria. */
export function feedbackFieldLabels(type: FeedbackType): {
  local: string;
  atual: string;
  esperado: string;
  atualRequired: boolean;
} {
  return type === "bug"
    ? {
        local: "Onde acontece?",
        atual: "O que aconteceu?",
        esperado: "O que deveria ter acontecido?",
        atualRequired: true,
      }
    : {
        local: "Onde deveria aparecer ou mudar?",
        atual: "Como funciona hoje? (opcional)",
        esperado: "O que deveria acontecer?",
        atualRequired: false,
      };
}
