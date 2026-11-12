// lib/restaurante/unidades.ts
// Conversão entre unidade de exibição/compra (kg, L) e unidade base (g, ml, un).
// Todo saldo/consumo é guardado na BASE; a conversão acontece só na borda
// (formulário → API, e na exibição). Puro e testado.

import type { Unidade, UnidadeBase } from "./tipos";

export const UNIDADES: Record<Unidade, { base: UnidadeBase; fator: number }> = {
  g: { base: "g", fator: 1 },
  kg: { base: "g", fator: 1000 },
  ml: { base: "ml", fator: 1 },
  L: { base: "ml", fator: 1000 },
  un: { base: "un", fator: 1 },
};

export const UNIDADES_BASE: readonly UnidadeBase[] = ["g", "ml", "un"];

export const isUnidade = (u: unknown): u is Unidade => typeof u === "string" && u in UNIDADES;
export const isUnidadeBase = (u: unknown): u is UnidadeBase => u === "g" || u === "ml" || u === "un";

/** Arredonda quantidades em unidade base (3 casas evita lixo de ponto flutuante). */
export const r3 = (n: number): number => Math.round((Number(n) || 0) * 1000) / 1000;
/** Dinheiro. */
export const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;
/** Custo por unidade base (R$/g pode ser bem pequeno). */
export const r6 = (n: number): number => Math.round((Number(n) || 0) * 1e6) / 1e6;

/** Unidades que podem ser usadas para um ingrediente com esta base. */
export function unidadesCompativeis(base: UnidadeBase): Unidade[] {
  return (Object.keys(UNIDADES) as Unidade[]).filter((u) => UNIDADES[u].base === base);
}

export function compativel(unidade: Unidade, base: UnidadeBase): boolean {
  return UNIDADES[unidade]?.base === base;
}

/** Quantidade em `unidade` → unidade base. `null` se as unidades não combinam (ex.: kg para ml). */
export function paraBase(qtd: number, unidade: Unidade, base: UnidadeBase): number | null {
  if (!compativel(unidade, base)) return null;
  return r3(qtd * UNIDADES[unidade].fator);
}

/** Quantidade na base → `unidade` (para exibição). */
export function deBase(qtdBase: number, unidade: Unidade): number {
  return r3(qtdBase / UNIDADES[unidade].fator);
}

/** Custo por `unidade` (R$/kg) → custo por unidade base (R$/g). */
export function custoParaBase(custo: number, unidade: Unidade): number {
  return r6(custo / UNIDADES[unidade].fator);
}

/** Custo por unidade base (R$/g) → custo por `unidade` (R$/kg). */
export function custoDeBase(custoBase: number, unidade: Unidade): number {
  return r6(custoBase * UNIDADES[unidade].fator);
}
