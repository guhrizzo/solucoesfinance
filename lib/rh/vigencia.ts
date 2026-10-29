// lib/rh/vigencia.ts
// Histórico com vigência (salário, encargos, benefícios). Funções puras.
//
// Regras:
//  • Uma vigência vale de `inicio` até `fim` (inclusive); `fim` null = em aberto.
//  • Nova vigência sempre entra em aberto e encerra a anterior no dia anterior
//    ao seu início — nunca há duas valendo no mesmo dia.
//  • Nova vigência não pode começar antes/igual ao início de uma já existente
//    (nada de reescrever o passado) nem tocar competência já FECHADA.

import { dayBefore, daysInMonth, dayOf, monthOf } from "./datas";

export interface Vigencia<T = Record<string, unknown>> {
  id?: string;
  inicio: string;
  fim: string | null;
  dados: T;
}

export function vigenciaEm<T>(list: Vigencia<T>[], date: string): Vigencia<T> | null {
  let best: Vigencia<T> | null = null;
  for (const v of list) {
    if (v.inicio <= date && (v.fim == null || date <= v.fim)) {
      if (!best || v.inicio > best.inicio) best = v;
    }
  }
  return best;
}

/** Dias da competência em que o colaborador estava ativo (entrada..saída). */
export function diasAtivos(comp: string, entrada: string, saida: string | null): string[] {
  const out: string[] = [];
  for (let n = 1; n <= daysInMonth(comp); n++) {
    const d = dayOf(comp, n);
    if (d >= entrada && (saida == null || d <= saida)) out.push(d);
  }
  return out;
}

/**
 * Valor mensal proporcional: soma, dia a dia nos dias ativos, o valor da
 * vigência daquele dia ÷ dias do mês. Mudança de salário no meio do mês e
 * admissão/saída no meio do mês saem pro-rata automaticamente.
 */
export function valorProporcional<T>(
  list: Vigencia<T>[],
  dias: string[],
  comp: string,
  pick: (dados: T) => number,
): number {
  const dm = daysInMonth(comp);
  let total = 0;
  for (const d of dias) {
    const v = vigenciaEm(list, d);
    if (v) total += pick(v.dados) / dm;
  }
  return total;
}

export type ErroVigencia = "inicio_invalido" | "sobreposicao" | "competencia_fechada";

/**
 * Valida a entrada de uma nova vigência em aberto a partir de `inicio`.
 * `competenciasFechadas` = lista de "YYYY-MM" fechadas. O efeito da nova
 * vigência vai de `inicio` até o infinito, então qualquer competência fechada
 * de `monthOf(inicio)` em diante bloqueia.
 */
export function validarNovaVigencia<T>(
  existentes: Vigencia<T>[],
  inicio: string,
  competenciasFechadas: string[],
): ErroVigencia | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return "inicio_invalido";
  if (existentes.some((v) => v.inicio >= inicio)) return "sobreposicao";
  const mes = monthOf(inicio);
  if (competenciasFechadas.some((c) => c >= mes)) return "competencia_fechada";
  return null;
}

/** Devolve a lista com a vigência vigente encerrada e a nova adicionada. */
export function aplicarNovaVigencia<T>(
  existentes: Vigencia<T>[],
  nova: { inicio: string; dados: T; id?: string },
): Vigencia<T>[] {
  const fimAnterior = dayBefore(nova.inicio);
  const atualizadas = existentes.map((v) =>
    v.inicio < nova.inicio && (v.fim == null || v.fim >= nova.inicio) ? { ...v, fim: fimAnterior } : v,
  );
  return [...atualizadas, { id: nova.id, inicio: nova.inicio, fim: null, dados: nova.dados }];
}

/**
 * Encerra uma vigência em `fim` (ex.: benefício cancelado). Não pode tocar
 * competência fechada: o dia seguinte ao fim em diante é o que muda.
 */
export function validarEncerramento(
  v: Vigencia,
  fim: string,
  competenciasFechadas: string[],
): ErroVigencia | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fim) || fim < v.inicio) return "inicio_invalido";
  if (v.fim != null && v.fim <= fim) return "sobreposicao";
  const mesAfetado = monthOf(dayAfter(fim));
  if (competenciasFechadas.some((c) => c >= mesAfetado)) return "competencia_fechada";
  return null;
}

function dayAfter(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Mudar entrada/saída do colaborador altera o custo dos meses entre a data
 * antiga e a nova. `null` = em aberto (afeta de lá em diante). Devolve o erro
 * se alguma competência fechada cair no intervalo afetado.
 */
export function validarMudancaDeData(
  antiga: string | null,
  nova: string | null,
  competenciasFechadas: string[],
): ErroVigencia | null {
  if (antiga === nova) return null;
  const [a, b] = [antiga, nova];
  const de = monthOf([a, b].filter((x): x is string => !!x).sort()[0]);
  const ate = a && b ? monthOf([a, b].sort()[1]) : null;
  return competenciasFechadas.some((c) => c >= de && (ate == null || c <= ate)) ? "competencia_fechada" : null;
}
