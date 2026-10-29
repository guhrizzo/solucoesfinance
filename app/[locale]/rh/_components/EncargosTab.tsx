"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Card, Field, Input, Pill } from "@/app/components/ui";
import { AcoesLinha, EdicaoInline, fmtData, hojeISO, rhApi, type Vigencia } from "./shared";

/** Percentual de encargos da empresa (valor único, com vigência). */
export function EncargosTab() {
  const t = useTranslations("rh");
  const locale = useLocale();
  const [vigs, setVigs] = useState<Vigencia[]>([]);
  const [pct, setPct] = useState("");
  const [desde, setDesde] = useState(hojeISO());
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [corrigindo, setCorrigindo] = useState<string | null>(null);

  async function chamar(body: Record<string, unknown>) {
    setBusy(true); setErro("");
    try { await rhApi("/api/rh/vigencias", { body }); setCorrigindo(null); await carregar(); }
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

  async function aplicar() {
    setBusy(true); setErro("");
    try {
      await rhApi("/api/rh/vigencias", { body: { tipo: "encargos", pct: Number(pct.replace(",", ".")), inicio: desde } });
      setPct("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("encargos.titulo")}</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{t("encargos.desc")}</p>
      </div>
      <p className="text-sm">
        {t("encargos.atual")}: {vigente ? <Pill tone="info">{vigente.pct}%</Pill> : <span style={{ color: "var(--text-subtle)" }}>{t("encargos.nenhum")}</span>}
      </p>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field label={t("encargos.pct")}><Input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="0,00" /></Field>
        <Field label={t("encargos.aPartirDe")}><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></Field>
        <Button onClick={aplicar} loading={busy} disabled={busy || !pct}>{t("encargos.aplicar")}</Button>
      </div>
      {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      {vigs.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">{t("encargos.historico")}</h3>
          <ul className="divide-y rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}>
            {vigs.map((v) => (
              <li key={v.id} className="flex justify-between px-3 py-2" style={{ borderColor: "var(--border)" }}>
                <span style={{ color: "var(--text-muted)" }}>
                  {t("rem.de")} {fmtData(v.inicio, locale)} · {v.fim ? `${t("rem.ate")} ${fmtData(v.fim, locale)}` : t("rem.emAberto")}
                </span>
                {corrigindo === v.id ? (
                  <EdicaoInline inicial={String(v.pct ?? "").replace(".", ",")} sufixo="%" disabled={busy} onCancelar={() => setCorrigindo(null)}
                    onSalvar={(x) => chamar({ acao: "atualizar", id: v.id, pct: Number(x.replace(",", ".")) })} />
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="mono font-semibold">{v.pct}%</span>
                    <AcoesLinha disabled={busy} onEditar={() => setCorrigindo(v.id)} onExcluir={() => chamar({ acao: "excluir", id: v.id })} />
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
