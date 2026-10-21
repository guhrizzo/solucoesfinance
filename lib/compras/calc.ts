// lib/compras/calc.ts
// Cálculo dos totais do pedido de compra. É a MESMA função no client (prévia
// enquanto digita) e no servidor (valor gravado) — mas o servidor sempre
// recalcula a partir dos itens/ajustes e ignora qualquer total que venha do
// cliente. Tudo em centavos inteiros pra não acumular erro de ponto flutuante.

import type { OrderAdjustments, OrderItem, OrderTotals } from "./types";

/** Valor em reais → centavos inteiros (arredondamento comercial). */
export const toCents = (n: number): number => Math.round((Number(n) || 0) * 100);
export const fromCents = (c: number): number => Math.round(c) / 100;
export const round2 = (n: number): number => fromCents(toCents(n));

/** Total da linha: quantidade × preço unitário, arredondado em centavos. */
export function lineTotal(quantity: number, unitPrice: number): number {
  const q = Number(quantity) || 0;
  const p = Number(unitPrice) || 0;
  // q pode ter 3 casas (kg, m…); multiplica antes de arredondar pra centavos.
  return fromCents(Math.round(q * p * 100));
}

/**
 * Subtotal = Σ itens; total = subtotal − desconto + impostos + frete + outros.
 * Total nunca fica negativo (desconto maior que o subtotal é barrado na
 * validação; aqui só garantimos o piso).
 */
export function computeTotals(
  items: Pick<OrderItem, "quantity" | "unitPrice">[],
  adj: OrderAdjustments,
): OrderTotals {
  const subtotalCents = items.reduce((s, it) => s + toCents(lineTotal(it.quantity, it.unitPrice)), 0);
  const discount = toCents(adj.discount);
  const taxes = toCents(adj.taxes);
  const freight = toCents(adj.freight);
  const otherCosts = toCents(adj.otherCosts);
  const totalCents = Math.max(0, subtotalCents - discount + taxes + freight + otherCosts);
  return {
    subtotal: fromCents(subtotalCents),
    discount: fromCents(discount),
    taxes: fromCents(taxes),
    freight: fromCents(freight),
    otherCosts: fromCents(otherCosts),
    total: fromCents(totalCents),
  };
}

/**
 * Divide `total` em `n` parcelas iguais em centavos; a diferença do
 * arredondamento vai pra ÚLTIMA parcela (a soma sempre bate com o total).
 */
export function splitInstallments(total: number, n: number): number[] {
  const count = Math.max(1, Math.floor(n));
  const cents = toCents(total);
  const base = Math.floor(cents / count);
  const out = Array.from({ length: count }, () => base);
  out[count - 1] += cents - base * count;
  return out.map(fromCents);
}

/** Soma YYYY-MM-DD + dias, sem fuso (UTC). */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d + Math.floor(days)));
  return dt.toISOString().slice(0, 10);
}
