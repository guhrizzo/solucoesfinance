"use client";

import { inputBaseStyle } from "@/app/components/ui/Input";
import { authedFetch } from "@/lib/authedFetch";

export type Vinculo = "CLT" | "PJ" | "estagio" | "outro";

export interface Colaborador {
  id: string;
  nome: string;
  cargo: string;
  vinculo: Vinculo;
  dataEntrada: string;
  dataSaida: string | null;
  status: "ativo" | "inativo";
  dependentes: number;
  comissionado: boolean;
  cpfMascarado: string;
  temBanco: boolean;
  alocacao: { centroId: string; centroNome: string; pct: number }[];
  semAlocacao: boolean;
  membroUid: string | null;
}

export interface Centro {
  id: string;
  nome: string;
  ativo: boolean;
  rhAlocados: number;
}

export interface Vigencia {
  id: string;
  tipo: "salario" | "beneficio" | "encargos" | "alocacao";
  itens?: { centroId: string; centroNome?: string; pct: number }[];
  inicio: string;
  fim: string | null;
  valor?: number;
  pct?: number;
  nome?: string;
  tipoBeneficio?: string;
}

export interface CustoMes {
  diasAtivos: number;
  diasMes: number;
  salario: number;
  prov13: number;
  provFerias: number;
  comissao: number;
  bonus: number;
  encargosPct: number;
  encargos: number;
  beneficiosTotal: number;
  total: number;
  semSalario: boolean;
  salarioDaFolha?: boolean;
}

/** Chama as rotas /api/rh/** com o ID token; lança Error(mensagem em português). */
export async function rhApi<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await authedFetch(path, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: init.body ? { "Content-Type": "application/json" } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "Erro inesperado.");
  return json as T;
}

export const selectStyle: React.CSSProperties = { ...inputBaseStyle };
export const selectClass = "w-full rounded-xl px-3.5 py-2.5 text-sm outline-none";

export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtData(iso: string | null, locale: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale);
}

/** Baixa o PDF autenticado e abre numa nova aba. */
export async function abrirPdf(path: string): Promise<void> {
  const res = await authedFetch(path);
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || "Não foi possível gerar o documento.");
  }
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
