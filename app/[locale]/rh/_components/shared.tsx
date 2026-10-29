"use client";

import { useState, type ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import { Button, Input, Modal } from "@/app/components/ui";
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

// ── PIN de 4 dígitos: toda ação do RH pede o PIN do usuário logado ───────────
// O RhPinProvider (pinGate.tsx) registra o solicitador abaixo. O servidor
// confere o PIN de novo (header x-rh-pin) — a tela é só conveniência.
type Solicitador = () => Promise<string | null>;
let solicitador: Solicitador | null = null;
export function registrarSolicitadorPin(fn: Solicitador | null) { solicitador = fn; }
/** Janela curta pra encadear chamadas de UMA mesma ação (ex.: salvar e recarregar) sem pedir o PIN duas vezes. */
let ultimo: { pin: string; ate: number } | null = null;
export async function pedirPin(): Promise<string | null> {
  if (ultimo && ultimo.ate > Date.now()) return ultimo.pin;
  if (!solicitador) return null;
  const pin = await solicitador();
  ultimo = pin ? { pin, ate: Date.now() + 10_000 } : null;
  return pin;
}

/** `pin`: exigir o PIN. Padrão: qualquer método que grava; leituras sensíveis passam `pin: true`; cálculos sem gravação, `pin: false`. */
export async function rhFetch(path: string, init: { method?: string; body?: unknown } = {}, opts: { pin?: boolean } = {}): Promise<Response> {
  const method = init.method ?? (init.body ? "POST" : "GET");
  const headers: Record<string, string> = init.body ? { "Content-Type": "application/json" } : {};
  if (opts.pin ?? method !== "GET") {
    const pin = await pedirPin();
    if (!pin) throw new Error("Ação cancelada: o PIN de 4 dígitos é obrigatório.");
    headers["x-rh-pin"] = pin;
  }
  return authedFetch(path, { method, headers, body: init.body ? JSON.stringify(init.body) : undefined });
}

/** Chama as rotas /api/rh/** com o ID token; lança Error(mensagem em português). */
export async function rhApi<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}, opts: { pin?: boolean } = {}): Promise<T> {
  const res = await rhFetch(path, init, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if ((json as { pinInvalido?: boolean }).pinInvalido) ultimo = null;
    throw new Error((json as { error?: string }).error || "Erro inesperado.");
  }
  return json as T;
}

/** 00000000000 → 000.000.000-00 (formata enquanto digita). */
export function formatarCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
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
  const res = await rhFetch(path, {}, { pin: true });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error((j as { error?: string }).error || "Não foi possível gerar o documento.");
  }
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Modal do RH: o corpo do Modal base não tem padding; aqui ganha respiro e rolagem própria em formulários longos. */
export function RhModal({ children, ...props }: ComponentProps<typeof Modal>) {
  return (
    <Modal {...props}>
      <div className="max-h-[calc(100vh-9rem)] overflow-y-auto p-5 sm:p-7">{children}</div>
    </Modal>
  );
}

/** Editar + excluir de uma linha de histórico; excluir pede um segundo clique ("Confirmar"). */
export function AcoesLinha({ onEditar, onExcluir, disabled }: { onEditar?: () => void; onExcluir: () => void; disabled?: boolean }) {
  const t = useTranslations("rh.crud");
  const [confirma, setConfirma] = useState(false);
  return (
    <span className="flex items-center gap-1">
      {onEditar && <Button size="sm" variant="ghost" icon={Pencil} disabled={disabled} aria-label={t("editar")} onClick={onEditar} />}
      {confirma
        ? <Button size="sm" variant="danger" disabled={disabled} onClick={() => { setConfirma(false); onExcluir(); }}>{t("confirmar")}</Button>
        : <Button size="sm" variant="ghost" icon={Trash2} disabled={disabled} aria-label={t("excluir")} onClick={() => setConfirma(true)} />}
    </span>
  );
}

/** Campo + salvar/cancelar para corrigir um valor na própria linha. */
export function EdicaoInline({ inicial, sufixo, onSalvar, onCancelar, disabled }: { inicial: string; sufixo?: string; onSalvar: (v: string) => void; onCancelar: () => void; disabled?: boolean }) {
  const t = useTranslations("rh.crud");
  const [v, setV] = useState(inicial);
  return (
    <span className="flex items-center gap-1">
      <Input inputMode="decimal" aria-label={t("novoValor")} className="!w-28 !py-1.5 text-right" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      {sufixo && <span className="text-xs">{sufixo}</span>}
      <Button size="sm" disabled={disabled || !v} onClick={() => onSalvar(v)}>{t("salvar")}</Button>
      <Button size="sm" variant="ghost" onClick={onCancelar}>{t("cancelar")}</Button>
    </span>
  );
}
