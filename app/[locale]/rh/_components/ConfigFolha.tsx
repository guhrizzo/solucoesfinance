"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, Input, Pill } from "@/app/components/ui";
import { AcoesLinha, fmtData, hojeISO, rhApi, selectClass, selectStyle, RhModal as Modal } from "./shared";

export interface RubricaUI {
  id: string;
  codigo: string;
  nome: string;
  natureza: "provento" | "desconto";
  tipo: string;
  incidencia: { inss: boolean; irrf: boolean; fgts: boolean };
  ativa: boolean;
}

interface TabelaUI {
  id: string;
  inicio: string;
  fim: string | null;
  obs: string;
  dados: { faixas: { ate: number | null; aliquota: number; deduzir?: number }[]; deducaoDependente?: number; descontoSimplificado?: number };
}

interface Config {
  parametros: Record<string, number | null>;
  rubricas: RubricaUI[];
  tabelas: { inss: TabelaUI[]; irrf: TabelaUI[] };
  folhasFechadas: string[];
}

const PARAMS = ["horasMes", "diasBaseMes", "pctHE50", "pctHE100", "pctAdNoturno", "pctVT", "aliquotaFgts", "pctTercoFerias", "pct1aParcela13"] as const;
const TIPOS_RUBRICA = ["salario", "he50", "he100", "adnoturno", "dsr", "faltas", "atrasos", "comissao", "bonus", "inss", "irrf", "vt", "manual"] as const;

/** Aba "Tabelas e parâmetros": parâmetros da empresa, rubricas e tabelas de INSS/IRRF com vigência. */
export function ConfigFolha() {
  const t = useTranslations("rh");
  const locale = useLocale();
  const [cfg, setCfg] = useState<Config | null>(null);
  const [erro, setErro] = useState("");
  const [reload, setReload] = useState(0);
  const recarregar = useCallback(() => setReload((n) => n + 1), []);
  const [par, setPar] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    rhApi<Config>("/api/rh/folha/config")
      .then((c) => {
        if (cancelled) return;
        setCfg(c); setErro("");
        setPar(Object.fromEntries(PARAMS.map((k) => [k, c.parametros[k] === null || c.parametros[k] === undefined ? "" : String(c.parametros[k])])));
      })
      .catch((e) => { if (!cancelled) setErro(e instanceof Error ? e.message : t("comum.erroCarregar")); });
    return () => { cancelled = true; };
  }, [reload, t]);

  // ── Parâmetros ───────────────────────────────────────────────────────────
  const [parMsg, setParMsg] = useState("");
  async function salvarPar() {
    setParMsg("");
    try {
      await rhApi("/api/rh/folha/config", { body: { acao: "parametros", parametros: Object.fromEntries(PARAMS.map((k) => [k, par[k] === "" ? null : Number(par[k].replace(",", "."))])) } });
      setParMsg(t("comum.salvo"));
      recarregar();
    } catch (e) { setParMsg(e instanceof Error ? e.message : "Erro"); }
  }

  // ── Rubricas ─────────────────────────────────────────────────────────────
  const [rub, setRub] = useState<(Partial<RubricaUI> & { _novo?: boolean }) | null>(null);
  const [rubErro, setRubErro] = useState("");
  async function salvarRub() {
    setRubErro("");
    try {
      await rhApi("/api/rh/folha/config", { body: { acao: "rubrica", rubrica: rub } });
      setRub(null);
      recarregar();
    } catch (e) { setRubErro(e instanceof Error ? e.message : "Erro"); }
  }
  async function chamar(body: Record<string, unknown>) {
    try { await rhApi("/api/rh/folha/config", { body }); recarregar(); } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); }
  }

  // ── Tabelas ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<{ tipo: "inss" | "irrf"; id?: string; inicio: string; faixas: { ate: string; aliquota: string; deduzir: string }[]; dep: string; simp: string; obs: string } | null>(null);
  const [tabErro, setTabErro] = useState("");
  function abrirTabela(tipo: "inss" | "irrf", t0?: TabelaUI) {
    setTabErro("");
    setTab({
      tipo, id: t0?.id, inicio: t0?.inicio ?? hojeISO(),
      faixas: t0 ? t0.dados.faixas.map((f) => ({ ate: f.ate === null ? "" : String(f.ate), aliquota: String(f.aliquota), deduzir: String(f.deduzir ?? 0) })) : [{ ate: "", aliquota: "", deduzir: "0" }],
      dep: String(t0?.dados.deducaoDependente ?? 0), simp: String(t0?.dados.descontoSimplificado ?? 0), obs: t0?.obs ?? "",
    });
  }
  async function salvarTabela() {
    if (!tab) return;
    setTabErro("");
    const n = (s: string) => Number(s.replace(",", "."));
    try {
      await rhApi("/api/rh/folha/config", {
        body: {
          acao: "tabela",
          tabela: {
            tipo: tab.tipo, id: tab.id, inicio: tab.inicio, obs: tab.obs,
            faixas: tab.faixas.map((f) => ({ ate: f.ate === "" ? null : n(f.ate), aliquota: n(f.aliquota), deduzir: n(f.deduzir || "0") })),
            deducaoDependente: n(tab.dep || "0"), descontoSimplificado: n(tab.simp || "0"),
          },
        },
      });
      setTab(null);
      recarregar();
    } catch (e) { setTabErro(e instanceof Error ? e.message : "Erro"); }
  }
  const setFaixa = (i: number, p: Partial<{ ate: string; aliquota: string; deduzir: string }>) =>
    setTab((x) => (x ? { ...x, faixas: x.faixas.map((f, k) => (k === i ? { ...f, ...p } : f)) } : x));

  const hoje = hojeISO();
  const vigente = (l: TabelaUI[]) => l.find((x) => x.inicio <= hoje && (!x.fim || x.fim >= hoje));

  if (!cfg) return erro ? <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p> : <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{t("comum.carregando")}</p>;

  return (
    <div className="space-y-6">
      {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}

      <Card className="space-y-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("folha.tabelas.titulo")}</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.tabelas.nota")}</p>
        </div>
        {(["inss", "irrf"] as const).map((tipo) => {
          const lista = cfg.tabelas[tipo];
          const vig = vigente(lista);
          return (
            <div key={tipo} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                  {t(`folha.tabelas.${tipo}`)}{" "}
                  {vig ? <Pill tone="pos" dot>{t("folha.tabelas.vigente", { data: fmtData(vig.inicio, locale) })}</Pill> : <Pill tone="neg" dot>{t("folha.tabelas.naoCadastrada")}</Pill>}
                </h3>
                <Button size="sm" icon={Plus} onClick={() => abrirTabela(tipo)}>{t("folha.tabelas.nova")}</Button>
              </div>
              {lista.length === 0 && (
                <p className="flex items-start gap-2 text-xs" style={{ color: "var(--warn)" }}>
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />{t("folha.tabelas.vazio")}
                </p>
              )}
              {lista.length > 0 && (
                <ul className="divide-y rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}>
                  {lista.map((x) => (
                    <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" style={{ borderColor: "var(--border)" }}>
                      <span style={{ color: "var(--text-muted)" }}>
                        {t("rem.de")} {fmtData(x.inicio, locale)} · {x.fim ? `${t("rem.ate")} ${fmtData(x.fim, locale)}` : t("rem.emAberto")} · {t("folha.tabelas.faixas", { n: x.dados.faixas.length })}
                        {x.obs && <span className="ml-2 text-xs" style={{ color: "var(--text-subtle)" }}>{x.obs}</span>}
                      </span>
                      <span className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => abrirTabela(tipo, x)}>{t("colab.editar")}</Button>
                        <AcoesLinha onExcluir={() => chamar({ acao: "tabelaExcluir", id: x.id })} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </Card>

      <Card className="space-y-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("folha.parametros.titulo")}</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.parametros.nota")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PARAMS.map((k) => (
            <Field key={k} label={t(`folha.parametros.campos.${k}`)}>
              <Input inputMode="decimal" value={par[k] ?? ""} onChange={(e) => setPar({ ...par, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={salvarPar}>{t("form.salvar")}</Button>
          {parMsg && <span role="status" className="text-xs" style={{ color: "var(--text-muted)" }}>{parMsg}</span>}
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("folha.rubricas.titulo")}</h2>
            <p className="mt-1 text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.rubricas.nota")}</p>
          </div>
          <span className="flex gap-2">
            {cfg.rubricas.length === 0 && <Button size="sm" variant="secondary" onClick={() => chamar({ acao: "rubricasPadrao" })}>{t("folha.rubricas.padrao")}</Button>}
            <Button size="sm" icon={Plus} onClick={() => { setRubErro(""); setRub({ _novo: true, codigo: "", nome: "", natureza: "provento", tipo: "manual", incidencia: { inss: false, irrf: false, fgts: false }, ativa: true }); }}>{t("folha.rubricas.nova")}</Button>
          </span>
        </div>
        {cfg.rubricas.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{t("folha.rubricas.vazio")}</p>
        ) : (
          <ul className="divide-y rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}>
            {cfg.rubricas.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" style={{ borderColor: "var(--border)" }}>
                <span>
                  <span className="mono mr-2 text-xs" style={{ color: "var(--text-subtle)" }}>{r.codigo}</span>
                  <span className="font-semibold">{r.nome}</span>
                  <Pill tone={r.natureza === "provento" ? "pos" : "neg"} className="ml-2">{t(`folha.rubricas.naturezas.${r.natureza}`)}</Pill>
                  {!r.ativa && <Pill tone="muted" className="ml-1">{t("comissoes.regras.inativa")}</Pill>}
                  <span className="ml-2 text-xs" style={{ color: "var(--text-subtle)" }}>
                    {t(`folha.rubricas.tipos.${r.tipo}`)} · {[r.incidencia.inss && "INSS", r.incidencia.irrf && "IRRF", r.incidencia.fgts && "FGTS"].filter(Boolean).join("/") || t("folha.rubricas.semIncidencia")}
                  </span>
                </span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => { setRubErro(""); setRub(r); }}>{t("colab.editar")}</Button>
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label={t("comissoes.regras.remover")} onClick={() => chamar({ acao: "rubricaRemover", id: r.id })} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={!!rub} onClose={() => setRub(null)} size="md" title={rub?._novo ? t("folha.rubricas.nova") : t("folha.rubricas.editar")}>
        {rub && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("folha.rubricas.codigo")}><Input value={rub.codigo ?? ""} maxLength={10} onChange={(e) => setRub({ ...rub, codigo: e.target.value })} /></Field>
              <Field label={t("folha.rubricas.nome")}><Input value={rub.nome ?? ""} maxLength={60} onChange={(e) => setRub({ ...rub, nome: e.target.value })} /></Field>
              <Field label={t("folha.rubricas.natureza")}>
                <select className={selectClass} style={selectStyle} value={rub.natureza} onChange={(e) => setRub({ ...rub, natureza: e.target.value as "provento" | "desconto" })}>
                  <option value="provento">{t("folha.rubricas.naturezas.provento")}</option>
                  <option value="desconto">{t("folha.rubricas.naturezas.desconto")}</option>
                </select>
              </Field>
              <Field label={t("folha.rubricas.tipo")}>
                <select className={selectClass} style={selectStyle} value={rub.tipo} onChange={(e) => setRub({ ...rub, tipo: e.target.value })}>
                  {TIPOS_RUBRICA.map((k) => <option key={k} value={k}>{t(`folha.rubricas.tipos.${k}`)}</option>)}
                </select>
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-semibold">{t("folha.rubricas.incidencia")}</legend>
              <div className="flex flex-wrap gap-4 text-sm">
                {(["inss", "irrf", "fgts"] as const).map((k) => (
                  <label key={k} className="flex cursor-pointer items-center gap-2">
                    <input type="checkbox" checked={!!rub.incidencia?.[k]} onChange={(e) => setRub({ ...rub, incidencia: { inss: false, irrf: false, fgts: false, ...rub.incidencia, [k]: e.target.checked } })} />
                    {k.toUpperCase()}
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={rub.ativa !== false} onChange={(e) => setRub({ ...rub, ativa: e.target.checked })} />{t("comissoes.regras.ativa")}</label>
              </div>
              <p className="mt-1 text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.rubricas.incidenciaNota")}</p>
            </fieldset>
            {rubErro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{rubErro}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRub(null)}>{t("form.cancelar")}</Button>
              <Button onClick={salvarRub} disabled={!rub.codigo || !rub.nome}>{t("form.salvar")}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!tab} onClose={() => setTab(null)} size="lg" title={tab ? `${tab.id ? t("colab.editar") : t("folha.tabelas.nova")} — ${t(`folha.tabelas.${tab.tipo}`)}` : ""}>
        {tab && (
          <div className="space-y-4">
            <p className="flex items-start gap-2 rounded-lg p-3 text-xs" style={{ background: "var(--warn-weak)", color: "var(--text)" }}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} aria-hidden />{t("folha.tabelas.aviso")}
            </p>
            {!tab.id && <Field label={t("folha.tabelas.inicio")} className="max-w-xs"><Input type="date" value={tab.inicio} onChange={(e) => setTab({ ...tab, inicio: e.target.value })} /></Field>}
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t(tab.tipo === "inss" ? "folha.tabelas.notaInss" : "folha.tabelas.notaIrrf")}</p>
            {tab.faixas.map((f, i) => (
              <div key={i} className={`grid items-end gap-2 ${tab.tipo === "irrf" ? "sm:grid-cols-[1fr_1fr_1fr_auto]" : "sm:grid-cols-[1fr_1fr_auto]"}`}>
                <Field label={i === 0 ? t("folha.tabelas.ate") : undefined}><Input inputMode="decimal" aria-label={t("folha.tabelas.ate")} value={f.ate} placeholder={tab.tipo === "irrf" && i === tab.faixas.length - 1 ? t("folha.tabelas.semTeto") : ""} onChange={(e) => setFaixa(i, { ate: e.target.value })} /></Field>
                <Field label={i === 0 ? t("folha.tabelas.aliquota") : undefined}><Input inputMode="decimal" aria-label={t("folha.tabelas.aliquota")} value={f.aliquota} onChange={(e) => setFaixa(i, { aliquota: e.target.value })} /></Field>
                {tab.tipo === "irrf" && <Field label={i === 0 ? t("folha.tabelas.deduzir") : undefined}><Input inputMode="decimal" aria-label={t("folha.tabelas.deduzir")} value={f.deduzir} onChange={(e) => setFaixa(i, { deduzir: e.target.value })} /></Field>}
                <Button size="sm" variant="ghost" icon={Trash2} aria-label={t("alocacao.remover")} disabled={tab.faixas.length === 1} onClick={() => setTab({ ...tab, faixas: tab.faixas.filter((_, k) => k !== i) })} />
              </div>
            ))}
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setTab({ ...tab, faixas: [...tab.faixas, { ate: "", aliquota: "", deduzir: "0" }] })}>{t("comissoes.regras.faixaAdd")}</Button>
            {tab.tipo === "irrf" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("folha.tabelas.deducaoDependente")}><Input inputMode="decimal" value={tab.dep} onChange={(e) => setTab({ ...tab, dep: e.target.value })} /></Field>
                <Field label={t("folha.tabelas.simplificado")} hint={t("folha.tabelas.simplificadoHint")}><Input inputMode="decimal" value={tab.simp} onChange={(e) => setTab({ ...tab, simp: e.target.value })} /></Field>
              </div>
            )}
            <Field label={t("folha.tabelas.obs")}><Input value={tab.obs} maxLength={200} onChange={(e) => setTab({ ...tab, obs: e.target.value })} /></Field>
            {tabErro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{tabErro}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setTab(null)}>{t("form.cancelar")}</Button>
              <Button onClick={salvarTabela}>{t("form.salvar")}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
