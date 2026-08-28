// lib/audit.ts
// ─── Carimbo de autoria — "quem fez e quando" ────────────────────────────────
// Toda ação protegida por PIN (criar / editar / dar baixa em contas, cobranças
// e impostos) grava quem a executou e o horário. O autor é SEMPRE o usuário
// logado no Firebase Auth (u.uid / displayName), mesmo quando ele escreve nos
// dados de outro dono de conta — ver lib/accountScope.ts. Isso fica amarrado
// ao PIN porque o PIN validado passou a ser o do próprio usuário logado.

export interface Actor {
    /** uid do Firebase Auth de quem está logado (NÃO o ownerUid dos dados). */
    uid: string;
    /** displayName ou e-mail — o que aparece no selo do card. */
    name: string;
}

/** Campos gravados na criação de um registro. */
export function stampCreate(actor: Actor) {
    return { createdBy: actor.uid, createdByName: actor.name };
}

/** Campos gravados a cada edição. */
export function stampUpdate(actor: Actor) {
    return { updatedBy: actor.uid, updatedByName: actor.name, updatedAt: Date.now() };
}

/** Campos gravados na baixa (pagamento / recebimento). */
export function stampSettle(actor: Actor) {
    return { settledBy: actor.uid, settledByName: actor.name, settledAt: Date.now() };
}

/** Formata um epoch em ms como "27/08/2026 14:30" (pt-BR). */
export function fmtDateTime(ts?: number): string {
    if (!ts || !Number.isFinite(ts)) return "";
    return new Date(ts).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}
