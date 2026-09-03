// lib/compAccounts.ts
// Contas "cortesia" (adm supremo): e-mails que NUNCA são cobrados por nenhum
// serviço da plataforma. Têm acesso vitalício — sem trial, sem paywall, sem
// checkout.
//
// Puro / sem dependências: pode ser importado tanto no servidor (rotas de
// billing) quanto no client (useSubscription).
//
// Como o efeito é aplicado:
//   • /api/billing/status  → se o DONO da conta é cortesia, marca
//     `comped: true` em users/{ownerUid}/profile/billing (Admin SDK).
//   • lib/billing.ts        → `resolveSubscriptionState` vê `comped` e devolve
//     estado sempre ativo (o client destrava via onSnapshot).
//   • useSubscription.ts    → atalho no client: se o e-mail logado é cortesia,
//     libera na hora, mesmo antes do doc ser marcado / mesmo sendo membro.
//   • /api/billing/checkout → recusa gerar cobrança pra conta cortesia.

/** E-mails com acesso vitalício e gratuito. Não remover sem alinhar com o dono. */
const HARDCODED_COMP_EMAILS = [
  "gurizzo943@gmail.com",
  "felipeaugjpaiva@gmail.com",
];

/** Fim de acesso "infinito" pra contas cortesia (ano 9999, em ms epoch). */
export const COMP_ACCESS_UNTIL = Date.UTC(9999, 0, 1);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Lista efetiva: hard-coded + env `COMP_ACCOUNT_EMAILS` (separada por vírgula). */
function compEmailSet(): Set<string> {
  const fromEnv = (process.env.COMP_ACCOUNT_EMAILS || "")
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean);
  return new Set([...HARDCODED_COMP_EMAILS.map(normalizeEmail), ...fromEnv]);
}

/** true se o e-mail pertence a uma conta cortesia (nunca cobrada). */
export function isCompedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return compEmailSet().has(normalizeEmail(email));
}
