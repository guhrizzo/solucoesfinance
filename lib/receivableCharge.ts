// lib/receivableCharge.ts
// Cobrança por e-mail em Contas a Receber (recurso do plano Pro). Regras de
// multa/juros compartilhadas entre o modal (prévia), o card e a rota
// /api/receivables/charge-email (que monta o e-mail com o valor atualizado).

/** Opções rápidas do modal. "Outro" abre um campo livre (limitado abaixo). */
export const FINE_PRESETS = [0, 1, 2] as const;      // multa, % sobre o valor
export const INTEREST_PRESETS = [0, 1, 2] as const;  // juros, % ao mês

/** Tetos de sanidade pros campos livres (não são limite legal). */
export const MAX_FINE_RATE = 20;
export const MAX_INTEREST_RATE = 20;

export function clampRate(v: unknown, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n * 100) / 100, max);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const isValidEmail = (s: string) => EMAIL_RE.test(s.trim());

/** Telefone BR: (11) 91234-5678 / (11) 1234-5678. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Dias de atraso em relação a `todayIso` (0 se não venceu). */
export function daysLate(dueDate: string, todayIso: string): number {
  const due = Date.parse(`${dueDate}T00:00:00Z`);
  const today = Date.parse(`${todayIso}T00:00:00Z`);
  if (!Number.isFinite(due) || !Number.isFinite(today)) return 0;
  return Math.max(0, Math.round((today - due) / 86400000));
}

/**
 * Valor atualizado de uma cobrança vencida: multa única (% do valor) +
 * juros simples pró-rata dia (% ao mês ÷ 30 × dias de atraso).
 */
export function chargeWithPenalties(amount: number, fineRate: number, interestRate: number, lateDays: number) {
  if (lateDays <= 0) return { fine: 0, interest: 0, total: amount };
  const fine = Math.round(amount * (fineRate / 100) * 100) / 100;
  const interest = Math.round(amount * (interestRate / 100 / 30) * lateDays * 100) / 100;
  return { fine, interest, total: Math.round((amount + fine + interest) * 100) / 100 };
}
