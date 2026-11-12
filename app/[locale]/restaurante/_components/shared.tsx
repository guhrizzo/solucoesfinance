"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Field, Input, Modal } from "@/app/components/ui";
import { inputBaseStyle } from "@/app/components/ui/Input";
import { authedFetch } from "@/lib/authedFetch";
import type { Falta, Unidade, UnidadeBase } from "@/lib/restaurante/tipos";
import { deBase } from "@/lib/restaurante/unidades";

/** Erro das rotas /api/restaurante/** — carrega a lista de faltas quando houver. */
export class RestApiError extends Error {
  code?: string;
  faltas?: Falta[];
  constructor(message: string, code?: string, faltas?: Falta[]) {
    super(message);
    this.code = code;
    this.faltas = faltas;
  }
}

/** Chama as rotas do módulo com o ID token; lança RestApiError (mensagem em pt-BR do servidor). */
export async function restApi<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? (init.body ? "POST" : "GET");
  const res = await authedFetch(path, {
    method,
    headers: init.body ? { "Content-Type": "application/json" } : {},
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string; faltas?: Falta[] };
  if (!res.ok) throw new RestApiError(json.error || "Erro inesperado.", json.code, json.faltas);
  return json as T;
}

export const erroMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado.");

/** "1,5" → 1.5 (aceita vírgula). Vazio → NaN. */
export function lerNumero(s: string): number {
  const t = s.trim();
  if (!t) return NaN;
  // "1.234,5" (pt-BR) → 1234.5; "1234.5" → 1234.5
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}

/** Número para o campo (ponto → vírgula no pt-BR). */
export function paraCampo(n: number | undefined, locale: string): string {
  if (n === undefined || !Number.isFinite(n) || n === 0) return "";
  return locale === "pt-BR" || locale === "es" ? String(n).replace(".", ",") : String(n);
}

export function fmtNum(n: number, locale: string, max = 3): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: max }).format(n);
}

/** Quantidade guardada na base mostrada na unidade de exibição: "1,5 kg". */
export function fmtQtd(qtdBase: number, unidade: Unidade | UnidadeBase, locale: string): string {
  return `${fmtNum(deBase(qtdBase, unidade), locale)} ${unidade}`;
}

export const selectStyle: React.CSSProperties = { ...inputBaseStyle };
export const selectClass = "w-full rounded-xl px-3.5 py-2.5 text-sm outline-none";

/** Modal com respiro e rolagem própria (o corpo do Modal base não tem padding). */
export function RestModal({ children, ...props }: ComponentProps<typeof Modal>) {
  return (
    <Modal {...props}>
      <div className="p-5 sm:p-6">{children}</div>
    </Modal>
  );
}

export function Erro({ msg }: { msg: string }) {
  if (!msg) return null;
  return <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{msg}</p>;
}

/** Lista exata do que falta (ingrediente, necessário, disponível, falta). */
export function ListaFaltas({ faltas, unidades }: { faltas: Falta[]; unidades: Map<string, Unidade> }) {
  const t = useTranslations("restaurante.falta");
  const locale = useLocale();
  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: "var(--text-subtle)" }} className="text-left text-[11px] uppercase tracking-wider">
            <th className="px-3 py-2">{t("ingrediente")}</th>
            <th className="px-3 py-2 text-right">{t("necessario")}</th>
            <th className="px-3 py-2 text-right">{t("disponivel")}</th>
            <th className="px-3 py-2 text-right">{t("falta")}</th>
          </tr>
        </thead>
        <tbody>
          {faltas.map((f) => {
            const u = unidades.get(f.ingredienteId) ?? f.unidadeBase;
            return (
              <tr key={f.ingredienteId} style={{ borderTop: "1px solid var(--border)" }}>
                <td className="px-3 py-2 font-medium">{f.nome}</td>
                <td className="mono px-3 py-2 text-right">{fmtQtd(f.necessario, u, locale)}</td>
                <td className="mono px-3 py-2 text-right">{fmtQtd(f.disponivel, u, locale)}</td>
                <td className="mono px-3 py-2 text-right font-semibold" style={{ color: "var(--neg)" }}>{fmtQtd(f.falta, u, locale)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Faltou insumo: mostra a lista exata e deixa o gestor FORÇAR (saldo pode
 * ficar negativo) com motivo obrigatório — o servidor confere de novo.
 */
export function FaltaForcarModal({
  aberto, titulo, faltas, unidades, onFechar, onForcar,
}: {
  aberto: boolean;
  titulo: string;
  faltas: Falta[];
  unidades: Map<string, Unidade>;
  onFechar: () => void;
  onForcar: (motivo: string) => Promise<void>;
}) {
  const t = useTranslations("restaurante");
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  async function forcar() {
    setBusy(true); setErro("");
    try { await onForcar(motivo.trim()); setMotivo(""); }
    catch (e) { setErro(erroMsg(e)); }
    finally { setBusy(false); }
  }
  return (
    <RestModal open={aberto} onClose={onFechar} title={titulo} size="lg" closeDisabled={busy}>
      <div className="space-y-4">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("falta.desc")}</p>
        <ListaFaltas faltas={faltas} unidades={unidades} />
        <div className="space-y-2 rounded-lg p-3" style={{ background: "var(--warn-weak)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--warn)" }}>{t("falta.forcarTitulo")}</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("falta.forcarHint")}</p>
          <Field label={t("comum.motivo")}>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} placeholder={t("falta.motivoPlaceholder")} />
          </Field>
        </div>
        <Erro msg={erro} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onFechar} disabled={busy}>{t("comum.voltar")}</Button>
          <Button variant="danger" onClick={forcar} loading={busy} disabled={busy || motivo.trim().length < 3}>{t("falta.forcar")}</Button>
        </div>
      </div>
    </RestModal>
  );
}

/** Relógio que atualiza a cada `ms` (tempo decorrido dos pedidos). */
export function useAgora(ms = 30_000): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return agora;
}
