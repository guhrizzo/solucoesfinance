// Tipos compartilhados (cliente + servidor) da integração Banco Inter.
// Os documentos são gravados pelo Admin SDK; ver regras em firestore.rules.

import type { InterTx } from "./inter.ts";
import type { Suggestion } from "./interMatch.ts";

/**
 * users/{ownerUid}/interPendentes/{txKey} — transação do extrato aguardando
 * conciliação. Criado só pelo servidor; o cliente só altera
 * status/cashflowId/resolvedAt/resolvedBy/suggestion.
 */
export type InterPendente = InterTx & {
  status: "pendente" | "conciliado" | "ignorado";
  suggestion?: Suggestion;
  cashflowId?: string;
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
};

/**
 * users/{ownerUid}/profile/interStatus — resumo da conexão, legível pela conta.
 * Nunca contém segredo (credenciais ficam em integracoesBanco/{ownerUid}).
 */
export type InterStatus = {
  connected: boolean;
  contaMasked?: string;
  lastSyncAt?: number;
  lastSyncError?: string | null;
  certExpiresAt?: number;
};
