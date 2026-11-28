// lib/compAccounts.ts
// Contas "cortesia": e-mails que NUNCA são cobrados por nenhum serviço da
// plataforma. Têm acesso vitalício — sem trial, sem paywall, sem checkout.
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
//
// IMPORTANTE: isenção de cobrança (`isCompedEmail`) é independente de
// privilégio de "adm supremo" (`isSupremeAdminEmail`, que enxerga e resolve
// os chamados de feedback de TODOS os usuários). Um e-mail cortesia comum
// não vira admin automaticamente — só quem está em `SUPREME_ADMIN_EMAILS`.

/** Donos da plataforma: além de cortesia, enxergam/resolvem os chamados de todo mundo. */
const SUPREME_ADMIN_EMAILS = [
  "gurizzo943@gmail.com",
  "felipeaugjpaiva@gmail.com",
];

/** Contas futuras só recebem os privilégios depois que o Firebase confirma o endereço. */
const VERIFIED_SUPREME_ADMIN_EMAILS = [
  "gustavorizzo@nexusfi.com.br",
  "felipe.paiva@nexusfi.com.br",
];

/** E-mails com acesso vitalício e gratuito, sem privilégio de admin. */
const COURTESY_ONLY_EMAILS = [
  "atelieda.ni25@gmail.com",
  "assessoriaxfamily@gmail.com",
  "biatriz.sataiva0317@gmail.com",
];

/** E-mails com acesso vitalício e gratuito. Não remover sem alinhar com o dono. */
const HARDCODED_COMP_EMAILS = [...SUPREME_ADMIN_EMAILS, ...COURTESY_ONLY_EMAILS];

/** Fim de acesso "infinito" pra contas cortesia (ano 9999, em ms epoch). */
export const COMP_ACCESS_UNTIL = Date.UTC(9999, 0, 1);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function requiresSupremeAdminEmailVerification(email: string | null | undefined): boolean {
  return !!email && VERIFIED_SUPREME_ADMIN_EMAILS.includes(normalizeEmail(email));
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
export function isCompedEmail(email: string | null | undefined, emailVerified?: boolean): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  if (VERIFIED_SUPREME_ADMIN_EMAILS.includes(normalized)) return emailVerified === true;
  return compEmailSet().has(normalized);
}

/** true se o e-mail é de um adm supremo (dono da plataforma). */
export function isSupremeAdminEmail(email: string | null | undefined, emailVerified?: boolean): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return SUPREME_ADMIN_EMAILS.includes(normalized) ||
    (emailVerified === true && VERIFIED_SUPREME_ADMIN_EMAILS.includes(normalized));
}
