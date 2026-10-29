"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, Input, Modal, Pill } from "@/app/components/ui";
import { fmtData, hojeISO, rhApi, selectClass, selectStyle } from "./shared";

export interface Regra {
  id: string;
  nome: string;
  escopo: "todos" | "lista";
  colaboradorIds: string[];
  tipo: "fixo" | "faixa";
  base: "receita" | "margem";
  pct: number;
  faixas: { de: number; pct: number }[];
  faixaModo: "marginal" | "total";
  inicio: string;
  fim: string | null;
  ativa: boolean;
}

interface Props {
  colaboradores: { id: string; nome: string }[];
  /** Avisa a tela pai pra recarregar a apuração. */
  onChanged: () => void;
}

const VAZIA = { nome: "", escopo: "todos", colaboradorIds: [] as string[], tipo: "fixo", base: "receita", pct: "", faixas: [{ de: "0", pct: "" }], faixaModo: "marginal", inicio: "", fim: "", ativa: true };

/** Regras de comissão + premissas da margem. */
export function RegrasSection({ colaboradores, onChanged }: Props) {
  const t = useTranslations("rh");
  const locale = useLocale();
  const [regras, setRegras] = useState<Regra[]>([]);
  const [editando, setEditando] = useState<Regra | null | undefined>(undefined);
  const [f, setF] = useState({ ...VAZIA, inicio: hojeISO() });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmaRemover, setConfirmaRemover] = useState<string | null>(null);

  const [cfg, setCfg] = useState({ aliquotaImpostoPct: "0", taxaDebitoPct: "0", taxaCreditoPct: "0", outrosCustosPct: "0" });
  const [cfgMsg, setCfgMsg] = useState("");

  const carregar = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        rhApi<{ regras: Regra[] }>("/api/rh/comissoes/regras"),
        rhApi<Record<string, number>>("/api/rh/comissoes/config"),
      ]);
      setRegras(r.regras);
      setCfg({
        aliquotaImpostoPct: String(c.aliquotaImpostoPct ?? 0), taxaDebitoPct: String(c.taxaDebitoPct ?? 0),
        taxaCreditoPct: String(c.taxaCreditoPct ?? 0), outrosCustosPct: String(c.outrosCustosPct ?? 0),
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : t("comum.erroCarregar"));
    }
  }, [t]);

  useEffect(() => { carregar(); }, [carregar]);

  function abrir(r: Regra | null) {
    setErro("");
    setF(r
      ? { nome: r.nome, escopo: r.escopo, colaboradorIds: r.colaboradorIds, tipo: r.tipo, base: r.base, pct: String(r.pct || ""),
          faixas: r.faixas.length ? r.faixas.map((x) => ({ de: String(x.de), pct: String(x.pct) })) : [{ de: "0", pct: "" }],
          faixaModo: r.faixaModo, inicio: r.inicio, fim: r.fim ?? "", ativa: r.ativa }
      : { ...VAZIA, inicio: hojeISO() });
    setEditando(r);
  }

  const num = (s: string) => Number(s.replace(",", "."));

  async function salvar() {
    setBusy(true); setErro("");
    try {
      await rhApi("/api/rh/comissoes/regras", {
        body: {
          id: editando?.id, nome: f.nome, escopo: f.escopo, colaboradorIds: f.colaboradorIds, tipo: f.tipo, base: f.base,
          pct: num(f.pct), faixas: f.faixas.map((x) => ({ de: num(x.de), pct: num(x.pct) })), faixaModo: f.faixaModo,
          inicio: f.inicio, fim: f.fim || null, ativa: f.ativa,
        },
      });
      setEditando(undefined);
      await carregar();
      onChanged();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function remover(id: string) {
    setBusy(true);
    try {
      await rhApi("/api/rh/comissoes/regras", { body: { acao: "remover", id } });
      setConfirmaRemover(null);
      await carregar();
      onChanged();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function salvarCfg() {
    setBusy(true); setCfgMsg("");
    try {
      await rhApi("/api/rh/comissoes/config", {
        method: "PUT",
        body: {
          aliquotaImpostoPct: num(cfg.aliquotaImpostoPct), taxaDebitoPct: num(cfg.taxaDebitoPct),
          taxaCreditoPct: num(cfg.taxaCreditoPct), outrosCustosPct: num(cfg.outrosCustosPct),
        },
      });
      setCfgMsg(t("comum.salvo"));
      onChanged();
    } catch (e) {
      setCfgMsg(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  const setFaixa = (i: number, patch: Partial<{ de: string; pct: string }>) =>
    setF((p) => ({ ...p, faixas: p.faixas.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("comissoes.regras.titulo")}</h2>
            <p className="mt-1 text-xs" style={{ color: "var(--text-subtle)" }}>{t("comissoes.regras.nota")}</p>
          </div>
          <Button size="sm" icon={Plus} onClick={() => abrir(null)}>{t("comissoes.regras.nova")}</Button>
        </div>
        {regras.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{t("comissoes.regras.vazio")}</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}>
            {regras.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5" style={{ borderColor: "var(--border)" }}>
                <span className="min-w-0">
                  <span className="font-semibold" style={{ color: "var(--text)" }}>{r.nome}</span>
                  {!r.ativa && <Pill tone="muted" className="ml-2">{t("comissoes.regras.inativa")}</Pill>}
                  <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                    {r.tipo === "fixo"
                      ? t("comissoes.regras.resumoFixo", { pct: r.pct, base: t(`comissoes.regras.bases.${r.base}`) })
                      : t("comissoes.regras.resumoFaixa", { modo: t(`comissoes.regras.modos.${r.faixaModo}`), base: t(`comissoes.regras.bases.${r.base}`) })}
                    {" · "}
                    {r.escopo === "todos" ? t("comissoes.regras.todos") : r.colaboradorIds.map((id) => colaboradores.find((c) => c.id === id)?.nome ?? "—").join(", ")}
                    {" · "}{t("rem.de")} {fmtData(r.inicio, locale)}{r.fim ? ` ${t("rem.ate")} ${fmtData(r.fim, locale)}` : ""}
                  </span>
                </span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => abrir(r)}>{t("colab.editar")}</Button>
                  {confirmaRemover === r.id
                    ? <Button size="sm" variant="danger" disabled={busy} onClick={() => remover(r.id)}>{t("comissoes.regras.confirmarRemover")}</Button>
                    : <Button size="sm" variant="ghost" icon={Trash2} aria-label={t("comissoes.regras.remover")} onClick={() => setConfirmaRemover(r.id)} />}
                </span>
              </li>
            ))}
          </ul>
        )}
        {erro && editando === undefined && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("comissoes.premissas.titulo")}</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-subtle)" }}>{t("comissoes.premissas.nota")}</p>
        </div>
        {([
          ["aliquotaImpostoPct", "imposto"], ["taxaDebitoPct", "debito"], ["taxaCreditoPct", "credito"], ["outrosCustosPct", "outros"],
        ] as const).map(([k, rot]) => (
          <Field key={k} label={t(`comissoes.premissas.${rot}`)}>
            <Input inputMode="decimal" value={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} />
          </Field>
        ))}
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={salvarCfg} disabled={busy}>{t("form.salvar")}</Button>
          {cfgMsg && <span role="status" className="text-xs" style={{ color: "var(--text-muted)" }}>{cfgMsg}</span>}
        </div>
      </Card>

      <Modal open={editando !== undefined} onClose={() => setEditando(undefined)} size="lg" title={editando ? t("comissoes.regras.editar") : t("comissoes.regras.nova")} closeDisabled={busy}>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("comissoes.regras.nome")} className="sm:col-span-2"><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} maxLength={60} /></Field>
            <Field label={t("comissoes.regras.tipo")}>
              <select className={selectClass} style={selectStyle} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
                <option value="fixo">{t("comissoes.regras.fixo")}</option>
                <option value="faixa">{t("comissoes.regras.faixa")}</option>
              </select>
            </Field>
            <Field label={t("comissoes.regras.base")}>
              <select className={selectClass} style={selectStyle} value={f.base} onChange={(e) => setF({ ...f, base: e.target.value })}>
                <option value="receita">{t("comissoes.regras.bases.receita")}</option>
                <option value="margem">{t("comissoes.regras.bases.margem")}</option>
              </select>
            </Field>
          </div>

          {f.tipo === "fixo" ? (
            <Field label={t("comissoes.regras.percentual")} className="max-w-xs"><Input inputMode="decimal" value={f.pct} onChange={(e) => setF({ ...f, pct: e.target.value })} /></Field>
          ) : (
            <div className="space-y-2">
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("comissoes.regras.faixasNota")}</p>
              {f.faixas.map((x, i) => (
                <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <Field label={i === 0 ? t("comissoes.regras.faixaDe") : undefined}>
                    <Input inputMode="decimal" aria-label={t("comissoes.regras.faixaDe")} value={x.de} disabled={i === 0} onChange={(e) => setFaixa(i, { de: e.target.value })} />
                  </Field>
                  <Field label={i === 0 ? t("comissoes.regras.percentual") : undefined}>
                    <Input inputMode="decimal" aria-label={t("comissoes.regras.percentual")} value={x.pct} onChange={(e) => setFaixa(i, { pct: e.target.value })} />
                  </Field>
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label={t("alocacao.remover")} disabled={i === 0} onClick={() => setF((p) => ({ ...p, faixas: p.faixas.filter((_, k) => k !== i) }))} />
                </div>
              ))}
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => setF((p) => ({ ...p, faixas: [...p.faixas, { de: "", pct: "" }] }))}>{t("comissoes.regras.faixaAdd")}</Button>
              <Field label={t("comissoes.regras.faixaModo")} className="max-w-sm">
                <select className={selectClass} style={selectStyle} value={f.faixaModo} onChange={(e) => setF({ ...f, faixaModo: e.target.value })}>
                  <option value="marginal">{t("comissoes.regras.modos.marginal")} — {t("comissoes.regras.modosHint.marginal")}</option>
                  <option value="total">{t("comissoes.regras.modos.total")} — {t("comissoes.regras.modosHint.total")}</option>
                </select>
              </Field>
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{t("comissoes.regras.aplicaA")}</legend>
            <select className={selectClass} style={selectStyle} aria-label={t("comissoes.regras.aplicaA")} value={f.escopo} onChange={(e) => setF({ ...f, escopo: e.target.value })}>
              <option value="todos">{t("comissoes.regras.todos")}</option>
              <option value="lista">{t("comissoes.regras.lista")}</option>
            </select>
            {f.escopo === "lista" && (
              <div className="flex flex-wrap gap-4">
                {colaboradores.length === 0 && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("comissoes.atribuicao.semComissionados")}</p>}
                {colaboradores.map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" checked={f.colaboradorIds.includes(c.id)}
                      onChange={(e) => setF((p) => ({ ...p, colaboradorIds: e.target.checked ? [...p.colaboradorIds, c.id] : p.colaboradorIds.filter((x) => x !== c.id) }))} />
                    {c.nome}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("rem.aPartirDe")}><Input type="date" value={f.inicio} onChange={(e) => setF({ ...f, inicio: e.target.value })} /></Field>
            <Field label={t("comissoes.regras.fim")}><Input type="date" value={f.fim} onChange={(e) => setF({ ...f, fim: e.target.value })} /></Field>
            <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={f.ativa} onChange={(e) => setF({ ...f, ativa: e.target.checked })} />
              {t("comissoes.regras.ativa")}
            </label>
          </div>

          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("comissoes.regras.efeito")}</p>
          {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditando(undefined)} disabled={busy}>{t("form.cancelar")}</Button>
            <Button onClick={salvar} loading={busy} disabled={busy || f.nome.trim().length < 2}>{t("form.salvar")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
