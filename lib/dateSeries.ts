// lib/dateSeries.ts
// Soma meses a uma data "YYYY-MM-DD" SEM passar por Date local — evita escorregar
// o dia por timezone (o resto do app formata com `d + "T12:00:00"`). Se o dia não
// existe no mês alvo (ex.: 31 de janeiro + 1 mês), clampeia pro último dia do mês.
// Usado pra gerar as datas de vencimento das parcelas de uma série "numeral".

export function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;

  const totalMonth = m - 1 + months; // base 0
  const targetY = y + Math.floor(totalMonth / 12);
  const targetM = ((totalMonth % 12) + 12) % 12; // 0..11

  // Dia 0 do mês seguinte = último dia do mês alvo. UTC pra não pegar fuso local.
  const lastDay = new Date(Date.UTC(targetY, targetM + 1, 0)).getUTCDate();
  const day = Math.min(d, lastDay);

  return `${targetY}-${String(targetM + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Rótulo curto "mês/ano" (ex.: "fev/2026") pra toasts de série. */
export function monthLabel(iso: string): string {
  return new Date(iso + "T12:00:00")
    .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
    .replace(/\./g, "")
    .replace(/ de /, "/");
}
