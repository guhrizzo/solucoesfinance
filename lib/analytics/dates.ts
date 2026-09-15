// lib/analytics/dates.ts
// Chaves de data no fuso America/Sao_Paulo. O servidor pode rodar em UTC,
// então `new Date().toISOString().slice(0,10)` viraria o dia às 21h. Estas
// funções garantem que "hoje" bate com o horário de Brasília — mesma técnica
// de lib/billing.ts → calendarDateKey.

const TZ = "America/Sao_Paulo";

/** Ex.: "2026-09-15" (dia no fuso de São Paulo). */
export function dayKey(d: Date = new Date()): string {
  // en-CA formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Ex.: "2026-09" (mês no fuso de São Paulo). */
export function monthKey(d: Date = new Date()): string {
  return dayKey(d).slice(0, 7);
}
