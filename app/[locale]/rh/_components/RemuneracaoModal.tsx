"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Field, Input, Modal, MoneyInput, Pill, parseAmount } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { fmtData, hojeISO, rhApi, selectClass, selectStyle, type Colaborador, type Vigencia } from "./shared";

interface Props {
  colaborador: Colaborador | null;
  onClose: () => void;
}

/** Histórico de salário e benefícios, sempre com vigência (data de início). */
export function RemuneracaoModal({ colaborador, onClose }: Props) {
  const t = useTranslations("rh");
  const locale = useLocale();
  const [vigs, setVigs] = useState<Vigencia[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  const [novoSalario, setNovoSalario] = useState("");
  const [salarioDesde, setSalarioDesde] = useState(hojeISO());
  const [ben, setBen] = useState({ nome: "", tipo: "vr", valor: "", inicio: hojeISO() });
  const [encerrando, setEncerrando] = useState<{ id: string; fim: string } | null>(null);

  const carregar = useCallback(async () => {
    if (!colaborador) return;
    setLoading(true);
    try {
      const d = await rhApi<{ vigencias: Vigencia[] }>(`/api/rh/vigencias?colaboradorId=${colaborador.id}`);
      setVigs(d.vigencias);
    } catch (e) {
      setErro(e instanceof Error ? e.message : t("comum.erroCarregar"));
    } finally {
      setLoading(false);
    }
  }, [colaborador, t]);

  useEffect(() => {
    if (!colaborador) return;
    setErro(""); setNovoSalario(""); setSalarioDesde(hojeISO()); setEncerrando(null);
    setBen({ nome: "", tipo: "vr", valor: "", inicio: hojeISO() });
    carregar();
  }, [colaborador, carregar]);

  async function enviar(body: Record<string, unknown>) {
    setBusy(true); setErro("");
    try {
      await rhApi("/api/rh/vigencias", { body });
      await carregar();
      return true;
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!colaborador) return null;
  const salarios = vigs.filter((v) => v.tipo === "salario");
  const beneficios = vigs.filter((v) => v.tipo === "beneficio");
  const hoje = hojeISO();
  const vigente = salarios.find((v) => v.inicio <= hoje && (!v.fim || v.fim >= hoje));
  const beneficiosAtivos = beneficios.filter((v) => !v.fim || v.fim >= hoje);

  return (
    <Modal open onClose={onClose} size="lg" title={t("rem.titulo", { nome: colaborador.nome })} closeDisabled={busy}>
      <div className="space-y-6">
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("rem.nota")}</p>
        {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            {t("rem.salario")}{" "}
            {vigente?.valor != null && <Pill tone="info">{t("rem.atual")}: {formatMoney(vigente.valor, locale)}</Pill>}
          </h3>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field label={t("rem.novoSalario")}><MoneyInput value={novoSalario} onValueChange={setNovoSalario} /></Field>
            <Field label={t("rem.aPartirDe")}><Input type="date" value={salarioDesde} onChange={(e) => setSalarioDesde(e.target.value)} /></Field>
            <Button
              disabled={busy || !novoSalario}
              onClick={async () => {
                if (await enviar({ tipo: "salario", colaboradorId: colaborador.id, valor: parseAmount(novoSalario), inicio: salarioDesde })) setNovoSalario("");
              }}
            >{t("rem.aplicar")}</Button>
          </div>
          {loading ? <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{t("comum.carregando")}</p>
            : salarios.length === 0 ? <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{t("rem.semHistorico")}</p>
            : (
              <ul className="divide-y rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}>
                {salarios.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-3 py-2" style={{ borderColor: "var(--border)" }}>
                    <span style={{ color: "var(--text-muted)" }}>
                      {t("rem.de")} {fmtData(v.inicio, locale)} · {v.fim ? `${t("rem.ate")} ${fmtData(v.fim, locale)}` : t("rem.emAberto")}
                    </span>
                    <span className="mono font-semibold" style={{ color: "var(--text)" }}>{formatMoney(v.valor ?? 0, locale)}</span>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{t("rem.beneficios")}</h3>
          <div className="grid items-end gap-3 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto]">
            <Field label={t("rem.nomeBeneficio")}><Input value={ben.nome} onChange={(e) => setBen({ ...ben, nome: e.target.value })} maxLength={60} /></Field>
            <Field label={t("rem.tipoBeneficio")}>
              <select className={selectClass} style={selectStyle} value={ben.tipo} onChange={(e) => setBen({ ...ben, tipo: e.target.value })}>
                {(["vt", "vr", "saude", "outro"] as const).map((k) => <option key={k} value={k}>{t(`rem.tipos.${k}`)}</option>)}
              </select>
            </Field>
            <Field label={t("rem.valorMensal")}><MoneyInput value={ben.valor} onValueChange={(v) => setBen({ ...ben, valor: v })} /></Field>
            <Field label={t("rem.aPartirDe")}><Input type="date" value={ben.inicio} onChange={(e) => setBen({ ...ben, inicio: e.target.value })} /></Field>
            <Button
              disabled={busy || !ben.nome || !ben.valor}
              onClick={async () => {
                if (await enviar({ tipo: "beneficio", colaboradorId: colaborador.id, nome: ben.nome, tipoBeneficio: ben.tipo, valor: parseAmount(ben.valor), inicio: ben.inicio })) {
                  setBen({ ...ben, nome: "", valor: "" });
                }
              }}
            >{t("rem.adicionar")}</Button>
          </div>
          {beneficiosAtivos.length === 0 ? <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{t("rem.semBeneficios")}</p> : (
            <ul className="divide-y rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}>
              {beneficiosAtivos.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2" style={{ borderColor: "var(--border)" }}>
                  <span style={{ color: "var(--text)" }}>
                    {v.nome} <Pill tone="muted">{t(`rem.tipos.${(v.tipoBeneficio as "vt") ?? "outro"}`)}</Pill>
                    <span className="ml-2 text-xs" style={{ color: "var(--text-subtle)" }}>
                      {t("rem.de")} {fmtData(v.inicio, locale)}{v.fim ? ` · ${t("rem.ate")} ${fmtData(v.fim, locale)}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="mono font-semibold">{formatMoney(v.valor ?? 0, locale)}</span>
                    {encerrando?.id === v.id ? (
                      <>
                        <Input type="date" aria-label={t("rem.encerrarEm")} className="!w-40 !py-1.5" value={encerrando.fim} onChange={(e) => setEncerrando({ id: v.id, fim: e.target.value })} />
                        <Button size="sm" variant="danger" disabled={busy} onClick={async () => { if (await enviar({ acao: "encerrar", id: v.id, fim: encerrando.fim })) setEncerrando(null); }}>{t("rem.encerrar")}</Button>
                      </>
                    ) : !v.fim ? (
                      <Button size="sm" variant="ghost" onClick={() => setEncerrando({ id: v.id, fim: hoje })}>{t("rem.encerrar")}</Button>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>{t("rem.fechar")}</Button></div>
      </div>
    </Modal>
  );
}
