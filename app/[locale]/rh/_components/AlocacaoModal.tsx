"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button, Field, Input, Pill } from "@/app/components/ui";
import { CentroRapidoModal } from "./CentroRapidoModal";
import { AcoesLinha, fmtData, hojeISO, rhApi, selectClass, selectStyle, type Centro, type Colaborador, type Vigencia, RhModal as Modal } from "./shared";

interface Props {
  colaborador: Colaborador | null;
  centros: Centro[];
  onCentroCriado: (c: Centro) => void;
  onClose: () => void;
  onSaved: () => void;
}

const NOVO = "__novo__";
interface Linha { centroId: string; pct: string }

/** Distribui o colaborador entre centros por percentual (soma = 100%) com vigência. */
export function AlocacaoModal({ colaborador, centros, onCentroCriado, onClose, onSaved }: Props) {
  const t = useTranslations("rh");
  const locale = useLocale();
  const [linhas, setLinhas] = useState<Linha[]>([{ centroId: "", pct: "100" }]);
  const [desde, setDesde] = useState(hojeISO());
  const [historico, setHistorico] = useState<Vigencia[]>([]);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [criandoPara, setCriandoPara] = useState<number | null>(null);
  const [corrigindo, setCorrigindo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!colaborador) return;
    try {
      const d = await rhApi<{ vigencias: Vigencia[] }>(`/api/rh/vigencias?colaboradorId=${colaborador.id}`, {}, { pin: true });
      setHistorico(d.vigencias.filter((v) => v.tipo === "alocacao"));
    } catch { /* o histórico é só informativo */ }
  }, [colaborador]);

  useEffect(() => {
    if (!colaborador) return;
    setErro(""); setDesde(hojeISO()); setCorrigindo(null);
    setLinhas(colaborador.alocacao.length > 0
      ? colaborador.alocacao.map((a) => ({ centroId: a.centroId, pct: String(a.pct) }))
      : [{ centroId: "", pct: "100" }]);
    carregar();
  }, [colaborador, carregar]);

  if (!colaborador) return null;

  const soma = Math.round(linhas.reduce((s, l) => s + (Number(l.pct.replace(",", ".")) || 0), 0) * 100) / 100;
  const fecha = Math.abs(soma - 100) <= 0.01;
  const completo = linhas.every((l) => l.centroId && Number(l.pct.replace(",", ".")) > 0);
  const ativos = centros.filter((c) => c.ativo);
  const usados = new Set(linhas.map((l) => l.centroId));

  const setLinha = (i: number, patch: Partial<Linha>) => setLinhas((p) => p.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  async function salvar() {
    setBusy(true); setErro("");
    try {
      const itens = linhas.map((l) => ({ centroId: l.centroId, pct: Number(l.pct.replace(",", ".")) }));
      await rhApi("/api/rh/vigencias", {
        body: corrigindo
          ? { acao: "atualizar", id: corrigindo, itens }
          : { tipo: "alocacao", colaboradorId: colaborador!.id, inicio: desde, itens },
      });
      onSaved();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal open onClose={onClose} size="lg" title={t("alocacao.titulo", { nome: colaborador.nome })} closeDisabled={busy}>
        <div className="space-y-5">
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("alocacao.nota")}</p>

          <div className="space-y-2">
            {linhas.map((l, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_120px_auto]">
                <Field label={i === 0 ? t("alocacao.centro") : undefined}>
                  <select
                    className={selectClass}
                    style={selectStyle}
                    aria-label={t("alocacao.centro")}
                    value={l.centroId}
                    onChange={(e) => (e.target.value === NOVO ? setCriandoPara(i) : setLinha(i, { centroId: e.target.value }))}
                  >
                    <option value="">{t("alocacao.escolha")}</option>
                    {ativos.map((c) => (
                      <option key={c.id} value={c.id} disabled={usados.has(c.id) && l.centroId !== c.id}>{c.nome}</option>
                    ))}
                    {/* centro já usado que ficou inativo continua aparecendo na linha dele */}
                    {l.centroId && !ativos.some((c) => c.id === l.centroId) && (
                      <option value={l.centroId}>{centros.find((c) => c.id === l.centroId)?.nome ?? "—"} ({t("alocacao.inativo")})</option>
                    )}
                    <option value={NOVO}>{t("alocacao.criarNovo")}</option>
                  </select>
                </Field>
                <Field label={i === 0 ? t("alocacao.percentual") : undefined}>
                  <Input inputMode="decimal" aria-label={t("alocacao.percentual")} value={l.pct} onChange={(e) => setLinha(i, { pct: e.target.value })} />
                </Field>
                <Button
                  variant="ghost" size="sm" icon={Trash2}
                  aria-label={t("alocacao.remover")}
                  disabled={linhas.length === 1}
                  onClick={() => setLinhas((p) => p.filter((_, k) => k !== i))}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="secondary" size="sm" icon={Plus} onClick={() => setLinhas((p) => [...p, { centroId: "", pct: "" }])}>{t("alocacao.adicionar")}</Button>
            <Pill tone={fecha ? "pos" : "neg"} dot>{t("alocacao.soma", { valor: soma })}</Pill>
          </div>

          {corrigindo
            ? <p className="text-xs font-semibold" style={{ color: "var(--warn)" }}>{t("crud.corrigindoVigencia")} <button type="button" className="underline cursor-pointer" onClick={() => setCorrigindo(null)}>{t("crud.cancelar")}</button></p>
            : <Field label={t("rem.aPartirDe")} className="max-w-xs"><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Field>}

          {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}

          {historico.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("rem.historico")}</h3>
              <ul className="divide-y rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}>
                {historico.map((v) => (
                  <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" style={{ borderColor: "var(--border)" }}>
                    <span><span style={{ color: "var(--text-muted)" }}>
                      {t("rem.de")} {fmtData(v.inicio, locale)} · {v.fim ? `${t("rem.ate")} ${fmtData(v.fim, locale)}` : t("rem.emAberto")}
                    </span>
                    <span className="ml-2 font-semibold">{(v.itens ?? []).map((i) => `${i.centroNome ?? "—"} ${i.pct}%`).join(" · ")}</span></span>
                    <AcoesLinha disabled={busy}
                      onEditar={() => { setCorrigindo(v.id); setLinhas((v.itens ?? []).map((i) => ({ centroId: i.centroId, pct: String(i.pct) }))); }}
                      onExcluir={async () => { setBusy(true); setErro(""); try { await rhApi("/api/rh/vigencias", { body: { acao: "excluir", id: v.id } }); await carregar(); onSaved(); } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); } }} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>{t("form.cancelar")}</Button>
            <Button onClick={salvar} loading={busy} disabled={busy || !fecha || !completo}>{t("alocacao.salvar")}</Button>
          </div>
        </div>
      </Modal>

      <CentroRapidoModal
        open={criandoPara !== null}
        onClose={() => setCriandoPara(null)}
        onResolved={(c) => {
          if (c.criado) onCentroCriado({ id: c.id, nome: c.nome, ativo: true, rhAlocados: 0 });
          if (criandoPara !== null) setLinha(criandoPara, { centroId: c.id });
          setCriandoPara(null);
        }}
      />
    </>
  );
}
