"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Plus, Trash2, UtensilsCrossed } from "lucide-react";
import { Button, Card, EmptyState, Field, Input, Pill, Table } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import type { Alertas } from "@/lib/restaurante/alertas";
import { custoPrato } from "@/lib/restaurante/ficha";
import type { Prato } from "@/lib/restaurante/tipos";
import type { RestauranteData } from "./useRestauranteData";
import { FichaEditor, fichaParaForm, fichaParaPayload, type LinhaFichaForm } from "./FichaEditor";
import { Erro, RestModal, erroMsg, lerNumero, paraCampo, restApi } from "./shared";

/** Cardápio + ficha técnica, com custo/margem calculados pela ficha. */
export function PratosTab({ dados, alertas }: { dados: RestauranteData; alertas: Alertas }) {
  const t = useTranslations("restaurante");
  const locale = useLocale();
  const [modal, setModal] = useState<{ prato: Prato | null } | null>(null);
  const [confirmaExcluir, setConfirmaExcluir] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  const porId = useMemo(() => new Map(dados.ingredientes.map((i) => [i.id, i])), [dados.ingredientes]);
  const indisp = useMemo(() => new Map(alertas.pratosIndisponiveis.map((p) => [p.pratoId, p.faltam])), [alertas]);

  async function excluir(p: Prato) {
    setBusy(true); setErro("");
    try { await restApi(`/api/restaurante/pratos?id=${encodeURIComponent(p.id)}`, { method: "DELETE" }); }
    catch (e) { setErro(erroMsg(e)); }
    finally { setBusy(false); setConfirmaExcluir(null); }
  }

  async function alternarAtivo(p: Prato) {
    setBusy(true); setErro("");
    try {
      await restApi("/api/restaurante/pratos", { method: "PATCH", body: { id: p.id, nome: p.nome, preco: p.preco, categoria: p.categoria, rendimento: p.rendimento, ficha: p.ficha, ativo: !p.ativo } });
    } catch (e) { setErro(erroMsg(e)); }
    finally { setBusy(false); }
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("pratos.titulo")}</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{t("pratos.desc")}</p>
        </div>
        <Button icon={Plus} onClick={() => setModal({ prato: null })}>{t("pratos.novo")}</Button>
      </div>
      <Erro msg={erro} />
      <Table
        columns={[
          { key: "nome", header: t("pratos.nome") },
          { key: "preco", header: t("pratos.preco"), align: "right" },
          { key: "custo", header: t("pratos.custoPorcao"), align: "right" },
          { key: "margem", header: t("pratos.margem"), align: "right" },
          { key: "status", header: t("pratos.status") },
          { key: "acoes", header: "", align: "right", width: "1px" },
        ]}
        rows={dados.pratos}
        rowKey={(p) => p.id}
        empty={<EmptyState icon={UtensilsCrossed} title={t("pratos.vazio")} description={t("pratos.vazioDesc")} />}
        renderCell={(p, key) => {
          const c = custoPrato(p, porId);
          switch (key) {
            case "nome":
              return (
                <span>
                  <span className="font-semibold">{p.nome}</span>
                  {p.categoria && <span className="block text-xs" style={{ color: "var(--text-subtle)" }}>{p.categoria}</span>}
                </span>
              );
            case "preco": return formatMoney(p.preco, locale);
            case "custo": return p.ficha.length ? formatMoney(c.custoPorcao, locale) : "—";
            case "margem":
              return c.margem.margemPct === null || !p.ficha.length ? "—" : (
                <span style={{ color: c.margem.margemPct < 0 ? "var(--neg)" : undefined }}>
                  {c.margem.margemPct}% <span className="text-xs" style={{ color: "var(--text-subtle)" }}>({t("pratos.cmv")} {c.margem.cmvPct}%)</span>
                </span>
              );
            case "status":
              return (
                <span className="flex flex-wrap gap-1">
                  <Pill tone={p.ativo ? "pos" : "muted"}>{p.ativo ? t("comum.ativo") : t("comum.inativo")}</Pill>
                  {p.ficha.length === 0 && <Pill tone="warn">{t("pratos.semFicha")}</Pill>}
                  {indisp.has(p.id) && (
                    <span title={indisp.get(p.id)!.map((f) => f.nome).join(", ")}><Pill tone="neg">{t("pratos.indisponivel")}</Pill></span>
                  )}
                </span>
              );
            case "acoes":
              return (
                <span className="flex items-center justify-end gap-1">
                  <Button size="sm" variant="ghost" disabled={busy || (!p.ativo && p.ficha.length === 0)} onClick={() => alternarAtivo(p)}>
                    {p.ativo ? t("comum.inativar") : t("comum.ativar")}
                  </Button>
                  <Button size="sm" variant="ghost" icon={Pencil} aria-label={t("comum.editar")} onClick={() => setModal({ prato: p })} />
                  {confirmaExcluir === p.id
                    ? <Button size="sm" variant="danger" disabled={busy} onClick={() => excluir(p)}>{t("comum.confirmar")}</Button>
                    : <Button size="sm" variant="ghost" icon={Trash2} aria-label={t("comum.excluir")} onClick={() => setConfirmaExcluir(p.id)} />}
                </span>
              );
            default: return null;
          }
        }}
      />
      {modal && <PratoModal prato={modal.prato} dados={dados} onFechar={() => setModal(null)} locale={locale} />}
    </Card>
  );
}

function PratoModal({ prato, dados, onFechar, locale }: { prato: Prato | null; dados: RestauranteData; onFechar: () => void; locale: string }) {
  const t = useTranslations("restaurante");
  const [nome, setNome] = useState(prato?.nome ?? "");
  const [preco, setPreco] = useState(paraCampo(prato?.preco, locale));
  const [categoria, setCategoria] = useState(prato?.categoria ?? "");
  const [rendimento, setRendimento] = useState(paraCampo(prato?.rendimento ?? 1, locale));
  const [ativo, setAtivo] = useState(prato?.ativo ?? true);
  const [ficha, setFicha] = useState<LinhaFichaForm[]>(fichaParaForm(prato?.ficha, locale));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const porId = new Map(dados.ingredientes.map((i) => [i.id, i]));
  const payloadFicha = fichaParaPayload(ficha).filter((f) => Number.isFinite(f.quantidade) && f.quantidade > 0);
  const previa = custoPrato({ ficha: payloadFicha, rendimento: lerNumero(rendimento) || 1, preco: lerNumero(preco) || 0 }, porId);

  async function salvar() {
    setBusy(true); setErro("");
    try {
      const body = { nome, preco: lerNumero(preco), categoria, rendimento: lerNumero(rendimento) || 1, ativo, ficha: fichaParaPayload(ficha) };
      if (prato) await restApi("/api/restaurante/pratos", { method: "PATCH", body: { id: prato.id, ...body } });
      else await restApi("/api/restaurante/pratos", { body });
      onFechar();
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <RestModal open onClose={onFechar} title={prato ? t("pratos.editarTitulo") : t("pratos.novoTitulo")} size="lg" closeDisabled={busy}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("pratos.nome")}><Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} /></Field>
          <Field label={t("pratos.categoria")}><Input value={categoria} onChange={(e) => setCategoria(e.target.value)} maxLength={40} /></Field>
          <Field label={t("pratos.preco")}><Input inputMode="decimal" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="0,00" /></Field>
          <Field label={t("pratos.rendimento")} hint={t("pratos.rendimentoHint")}><Input inputMode="decimal" value={rendimento} onChange={(e) => setRendimento(e.target.value)} /></Field>
        </div>
        <FichaEditor linhas={ficha} onChange={setFicha} ingredientes={dados.ingredientes} rotulo={t("pratos.ficha")} />
        <div className="grid grid-cols-3 gap-2 rounded-lg p-3 text-sm" style={{ background: "var(--sunken)" }}>
          <span><span className="block text-xs" style={{ color: "var(--text-muted)" }}>{t("pratos.custoPorcao")}</span><span className="mono font-semibold">{formatMoney(previa.custoPorcao, locale)}</span></span>
          <span><span className="block text-xs" style={{ color: "var(--text-muted)" }}>{t("pratos.lucro")}</span><span className="mono font-semibold">{formatMoney(previa.margem.lucro, locale)}</span></span>
          <span><span className="block text-xs" style={{ color: "var(--text-muted)" }}>{t("pratos.margem")}</span><span className="mono font-semibold">{previa.margem.margemPct ?? "—"}%</span></span>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          {t("pratos.ativoLabel")}
        </label>
        {ativo && payloadFicha.length === 0 && <p className="text-xs" style={{ color: "var(--warn)" }}>{t("pratos.fichaObrigatoria")}</p>}
        <Erro msg={erro} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onFechar} disabled={busy}>{t("comum.cancelar")}</Button>
          <Button onClick={salvar} loading={busy} disabled={busy || nome.trim().length < 2}>{t("comum.salvar")}</Button>
        </div>
      </div>
    </RestModal>
  );
}
