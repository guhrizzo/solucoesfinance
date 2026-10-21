"use client";

// Peças compartilhadas entre a tela interna de Compras e o portal do fornecedor.

import { useTranslations } from "next-intl";
import { Pill, type PillTone } from "@/app/components/ui";
import type { OrderStatus } from "@/lib/compras/types";
import { ComprasApiError } from "./api";

export const STATUS_TONE: Record<OrderStatus, PillTone> = {
  rascunho: "muted",
  enviado: "info",
  em_analise: "warn",
  aprovado: "pos",
  recusado: "neg",
  cancelado: "muted",
  concluido: "pos",
};

export function StatusPill({ status }: { status: OrderStatus }) {
  const t = useTranslations("compras.status");
  return <Pill tone={STATUS_TONE[status] ?? "muted"} dot>{t(status)}</Pill>;
}

type T = ReturnType<typeof useTranslations>;

/** Mensagem traduzida de um erro de API (pelo código), com fallback. */
export function errorText(tErr: T, err: unknown): string {
  const code = err instanceof ComprasApiError ? err.code : "generic";
  return tErr.has(code) ? tErr(code) : err instanceof Error && err.message ? err.message : tErr("generic");
}

/** Erros por campo traduzidos ({ campo: código } → { campo: texto }). */
export function fieldErrors(tErr: T, err: unknown): Record<string, string> {
  if (!(err instanceof ComprasApiError) || !err.fields) return {};
  return Object.fromEntries(Object.entries(err.fields).map(([k, code]) => [k, tErr.has(code) ? tErr(code) : code]));
}

/** Data ISO (YYYY-MM-DD) ou timestamp → texto local. */
export function fmtDate(v: string | number | null | undefined, locale: string): string {
  if (v === null || v === undefined || v === "") return "—";
  const d = typeof v === "number" ? new Date(v) : new Date(`${v}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(v: number | null | undefined, locale: string): string {
  if (!v) return "—";
  return new Date(v).toLocaleString(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const fmtCnpj = (d: string) =>
  d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d;

export const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Classes/estilos de controles nativos (select/textarea/date) alinhados ao <Input>. */
export const controlClass = "w-full rounded-xl px-3.5 py-2.5 text-sm outline-none";
export const controlStyle: React.CSSProperties = {
  background: "var(--sunken)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: "var(--radius-control)",
};
