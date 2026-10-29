// lib/rh/datas.ts
// Datas "YYYY-MM-DD" e competências "YYYY-MM" sem fuso: tudo em UTC puro,
// pra um dia nunca "escorregar" por causa do horário local.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const COMP_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function daysInMonth(comp: string): number {
  const [y, m] = comp.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function firstDay(comp: string): string {
  return `${comp}-01`;
}

export function lastDay(comp: string): string {
  return `${comp}-${String(daysInMonth(comp)).padStart(2, "0")}`;
}

export function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function monthOf(date: string): string {
  return date.slice(0, 7);
}

export function nextComp(comp: string): string {
  const [y, m] = comp.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function dayOf(comp: string, n: number): string {
  return `${comp}-${String(n).padStart(2, "0")}`;
}

export function todayKey(now: Date = new Date()): string {
  // Dia civil no Brasil (UTC-3), independente do fuso do servidor.
  const br = new Date(now.getTime() - 3 * 3600 * 1000);
  return br.toISOString().slice(0, 10);
}
