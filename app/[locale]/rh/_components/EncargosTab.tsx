"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Card, Field, Input, Pill } from "@/app/components/ui";
import { ENCARGOS_PATRONAIS } from "@/lib/rh/custo";
import { AcoesLinha, EdicaoInline, fmtData, hojeISO, rhApi, type Vigencia } from "./shared";

const CAMPOS_VAZIOS = { inssPatronal: "", rat: "", terceiros: "", outros: "" };

export function EncargosTab() {
  const t = useTranslations("rh");
  const locale = useLocale();
  const [vigs, setVigs] = useState<Vigencia[]>([]);
  const [campos, setCampos] = useState(CAMPOS_VAZIOS);
  const [desde, setDesde] = useState(hojeISO());
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [corrigindo, setCorrigindo] = useState<string | null>(null);

  async function chamar(body: Record<string, unknown>) {
    setBusy(true); setErro("");
    try {
      await rhApi("/api/rh/vigencias", { body });
      cancelarEdicao();
      await carregar();
    }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro"); }
    finally { setBusy(false); }
  }

  const carregar = useCallback(async () => {
    try {
      setVigs((await rhApi<{ vigencias: Vigencia[] }>("/api/rh/vigencias?colaboradorId=_empresa", {}, { pin: true })).vigencias);
    } catch (e) {
      setErro(e instanceof Error ? e.message : t("comum.erroCarregar"));
    }
  }, [t]);
  useEffect(() => { carregar(); }, [carregar]);

  const hoje = hojeISO();
  const vigente = vigs.find((v) => v.inicio <= hoje && (!v.fim || v.fim >= hoje));
  const editando = vigs.find((v) => v.id === corrigindo);
  const editandoDetalhe = !!editando?.aliquotas;
  const exibirPct = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 });

  function cancelarEdicao() {
    setCorrigindo(null);
    setCampos(CAMPOS_VAZIOS);
  }

  function editar(v: Vigencia) {
    setCorrigindo(v.id);
    setCampos(v.aliquotas ? {
      inssPatronal: exibirPct.format(v.aliquotas.inssPatronal),
      rat: exibirPct.format(v.aliquotas.rat),
      terceiros: exibirPct.format(v.aliquotas.terceiros),
      outros: exibirPct.format(v.aliquotas.outros),
    } : CAMPOS_VAZIOS);
  }

  function aplicar() {
    const aliquotas = Object.fromEntries(ENCARGOS_PATRONAIS.map((k) => [k, Number(campos[k].replace(",", "."))]));
    return chamar(editandoDetalhe
      ? { acao: "atualizar", id: corrigindo, aliquotas }
      : { tipo: "encargos", inicio: desde, aliquotas });
  }

  function resumo(v: Vigencia) {
    const aliquotas = v.aliquotas;
    return aliquotas
      ? ENCARGOS_PATRONAIS.map((k) => `${t(`encargos.tipos.${k}`)} ${exibirPct.format(aliquotas[k])}%`).join(" · ")
      : `${t("encargos.consolidado")} ${exibirPct.format(v.pct ?? 0)}%`;
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("encargos.titulo")}</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{t("encargos.desc")}</p>
      </div>
      <p className="text-sm">
        {t("encargos.atual")}: {vigente ? <Pill tone="info"><span className="whitespace-normal">{resumo(vigente)}</span></Pill> : <span style={{ color: "var(--text-subtle)" }}>{t("encargos.nenhum")}</span>}
      </p>
      {(!editando || editandoDetalhe) && (
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ENCARGOS_PATRONAIS.map((k) => (
            <Field key={k} label={`${t(`encargos.tipos.${k}`)} (%)`}>
              <Input inputMode="decimal" value={campos[k]} onChange={(e) => setCampos({ ...campos, [k]: e.target.value })} placeholder="0" />
            </Field>
          ))}
          <Field label={t("encargos.aPartirDe")}>
            <Input type="date" value={editandoDetalhe ? editando.inicio : desde} disabled={editandoDetalhe} onChange={(e) => setDesde(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            {editandoDetalhe && <Button variant="secondary" disabled={busy} onClick={cancelarEdicao}>{t("form.cancelar")}</Button>}
            <Button onClick={aplicar} loading={busy} disabled={busy || (!editandoDetalhe && !desde) || ENCARGOS_PATRONAIS.some((k) => !campos[k].trim())}>
              {t(editandoDetalhe ? "form.salvar" : "encargos.aplicar")}
            </Button>
          </div>
        </div>
      )}
      {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      {vigs.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t("encargos.historico")}</h3>
          <ul className="divide-y rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}>
            {vigs.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" style={{ borderColor: "var(--border)" }}>
                <span style={{ color: "var(--text-muted)" }}>
                  {t("rem.de")} {fmtData(v.inicio, locale)} · {v.fim ? `${t("rem.ate")} ${fmtData(v.fim, locale)}` : t("rem.emAberto")}
                </span>
                {corrigindo === v.id && !v.aliquotas ? (
                  <EdicaoInline inicial={String(v.pct ?? "").replace(".", ",")} sufixo="%" disabled={busy} onCancelar={cancelarEdicao}
                    onSalvar={(x) => chamar({ acao: "atualizar", id: v.id, pct: Number(x.replace(",", ".")) })} />
                ) : (
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-semibold">{resumo(v)}</span>
                    <AcoesLinha disabled={busy} onEditar={() => editar(v)} onExcluir={() => chamar({ acao: "excluir", id: v.id })} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
