"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, FileText, Lock, LockOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Button, EmptyState, Field, Input, KpiTile, Pill, Table, type Column } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { usePeriod } from "@/app/hooks/usePeriod";
import { abrirPdf, rhApi, RhModal as Modal } from "./shared";
import type { RubricaUI } from "./ConfigFolha";

interface Resultado {
  proventos: number; descontos: number; liquido: number; inss: number; irrf: number; fgts: number; erros: string[];
}
interface Lanc { he50: number; he100: number; noturnas: number; faltasDias: number; atrasosHoras: number; extras: { rubricaId: string; valor: number; obs?: string }[] }
interface Linha { colaboradorId: string; nome: string; cargo: string; lanc: Lanc; resultado: Resultado; conferido: boolean; conferidoPorNome?: string }
interface Folha {
  comp: string; fechada: boolean; cabecalho: { diasUteis: number; domingosFeriados: number }; linhas: Linha[]; erros: string[]; foraDaFolha: number;
  fechadaPorNome?: string | null; reaberturas: { em: number; porNome: string; motivo: string }[];
}

const CONTAS = ["salarios", "fgts", "inss", "irrf"] as const;

export function FolhaMes() {
  const t = useTranslations("rh");
  const locale = useLocale();
  const { monthKey, label } = usePeriod();
  const [folha, setFolha] = useState<Folha | null>(null);
  const [rubricas, setRubricas] = useState<RubricaUI[]>([]);
  const [erro, setErro] = useState("");
  const [reload, setReload] = useState(0);
  const recarregar = useCallback(() => setReload((n) => n + 1), []);
  const [cab, setCab] = useState({ diasUteis: "", domingosFeriados: "" });
  const [lanc, setLanc] = useState<{ linha: Linha; f: { he50: string; he100: string; noturnas: string; faltasDias: string; atrasosHoras: string }; extras: { rubricaId: string; valor: string; obs: string }[] } | null>(null);
  const [lancErro, setLancErro] = useState("");
  const [modal, setModal] = useState<"fechar" | "reabrir" | null>(null);
  const [venc, setVenc] = useState<Record<string, string>>({});
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([rhApi<Folha>(`/api/rh/folha/mes?comp=${monthKey}`), rhApi<{ rubricas: RubricaUI[] }>("/api/rh/folha/config")])
      .then(([f, c]) => {
        if (cancelled) return;
        setFolha(f); setRubricas(c.rubricas); setErro("");
        setCab({ diasUteis: String(f.cabecalho.diasUteis || ""), domingosFeriados: String(f.cabecalho.domingosFeriados || "") });
      })
      .catch((e) => { if (!cancelled) setErro(e instanceof Error ? e.message : t("comum.erroCarregar")); });
    return () => { cancelled = true; };
  }, [monthKey, reload, t]);

  const money = (n: number) => formatMoney(n, locale);
  const post = async (body: Record<string, unknown>) => rhApi("/api/rh/folha/mes", { body: { comp: monthKey, ...body } });

  async function salvarCab() {
    if (!folha || folha.fechada) return;
    try { await post({ acao: "cabecalho", diasUteis: Number(cab.diasUteis) || 0, domingosFeriados: Number(cab.domingosFeriados) || 0 }); recarregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro"); }
  }

  function abrirLanc(l: Linha) {
    setLancErro("");
    setLanc({
      linha: l,
      f: { he50: String(l.lanc.he50 || ""), he100: String(l.lanc.he100 || ""), noturnas: String(l.lanc.noturnas || ""), faltasDias: String(l.lanc.faltasDias || ""), atrasosHoras: String(l.lanc.atrasosHoras || "") },
      extras: l.lanc.extras.map((x) => ({ rubricaId: x.rubricaId, valor: String(x.valor), obs: x.obs ?? "" })),
    });
  }
  async function salvarLanc() {
    if (!lanc) return;
    setBusy(true); setLancErro("");
    const n = (s: string) => Number(s.replace(",", ".")) || 0;
    try {
      await post({
        acao: "lancamento", colaboradorId: lanc.linha.colaboradorId,
        lanc: { he50: n(lanc.f.he50), he100: n(lanc.f.he100), noturnas: n(lanc.f.noturnas), faltasDias: n(lanc.f.faltasDias), atrasosHoras: n(lanc.f.atrasosHoras), extras: lanc.extras.map((x) => ({ rubricaId: x.rubricaId, valor: n(x.valor), obs: x.obs })) },
      });
      setLanc(null); recarregar();
    } catch (e) { setLancErro(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  }

  async function limparLanc() {
    if (!lanc) return;
    setBusy(true); setLancErro("");
    try { await post({ acao: "lancamentoLimpar", colaboradorId: lanc.linha.colaboradorId }); setLanc(null); recarregar(); }
    catch (e) { setLancErro(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  }

  async function conferir(l: Linha) {
    try { await post({ acao: "conferir", colaboradorId: l.colaboradorId, conferido: !l.conferido }); recarregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro"); }
  }
  async function pdf(l: Linha) {
    try { await abrirPdf(`/api/rh/holerite?comp=${monthKey}&colaboradorId=${l.colaboradorId}`); }
    catch (e) { setErro(e instanceof Error ? e.message : "Erro"); }
  }
  async function acao(a: "fechar" | "reabrir") {
    setBusy(true); setErro("");
    try {
      await post({ acao: a, vencimentos: venc, motivo });
      setModal(null); setMotivo(""); recarregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro"); setModal(null); } finally { setBusy(false); }
  }

  const soma = (f: (r: Resultado) => number) => (folha?.linhas ?? []).reduce((s, l) => s + f(l.resultado), 0);
  const totais = { liquido: soma((r) => r.liquido), fgts: soma((r) => r.fgts), inss: soma((r) => r.inss), irrf: soma((r) => r.irrf), proventos: soma((r) => r.proventos) };
  const pendentes = (folha?.linhas ?? []).filter((l) => !l.conferido).length;
  const comErro = !!folha && (folha.erros.length > 0 || folha.linhas.some((l) => l.resultado.erros.length > 0));
  const pronta = !!folha && !folha.fechada && folha.linhas.length > 0 && !comErro && pendentes === 0;

  const cols: Column[] = [
    { key: "nome", header: t("folha.mes.cols.colaborador") },
    { key: "proventos", header: t("folha.mes.cols.proventos"), align: "right" },
    { key: "descontos", header: t("folha.mes.cols.descontos"), align: "right" },
    { key: "inss", header: "INSS", align: "right" },
    { key: "irrf", header: "IRRF", align: "right" },
    { key: "fgts", header: "FGTS", align: "right" },
    { key: "liquido", header: t("folha.mes.cols.liquido"), align: "right" },
    { key: "conf", header: t("folha.mes.cols.conferencia") },
    { key: "acoes", header: t("colab.cols.acoes"), align: "right" },
  ];

  const contasFechar = CONTAS.map((c) => ({ id: c, valor: c === "salarios" ? totais.liquido : totais[c] })).filter((c) => c.valor > 0);

  return (
    <div className="space-y-4">
      <p role="note" className="flex items-start gap-2 rounded-lg p-3 text-sm font-semibold" style={{ background: "var(--warn-weak)", color: "var(--text)" }}>
        <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} aria-hidden />{t("folha.aviso")}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label={`${t("folha.mes.liquidoTotal")} · ${label}`} value={folha ? money(totais.liquido) : "—"} />
        <KpiTile label={t("folha.mes.proventosTotal")} value={folha ? money(totais.proventos) : "—"} />
        <KpiTile label={t("folha.mes.fgtsTotal")} value={folha ? money(totais.fgts) : "—"} />
        <KpiTile
          label={t("custo.situacao")}
          value={folha ? <Pill tone={folha.fechada ? "info" : "warn"} dot>{t(folha.fechada ? "custo.fechada" : "custo.aberta")}</Pill> : "—"}
          delta={folha?.fechada && folha.fechadaPorNome ? t("custo.fechadaPor", { nome: folha.fechadaPorNome }) : undefined}
        />
      </div>

      {folha && !folha.fechada && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("folha.mes.diasUteis")}><Input inputMode="numeric" className="!w-28" value={cab.diasUteis} onChange={(e) => setCab({ ...cab, diasUteis: e.target.value })} onBlur={salvarCab} /></Field>
          <Field label={t("folha.mes.domingosFeriados")}><Input inputMode="numeric" className="!w-28" value={cab.domingosFeriados} onChange={(e) => setCab({ ...cab, domingosFeriados: e.target.value })} onBlur={salvarCab} /></Field>
          <p className="max-w-md pb-2 text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.mes.dsrNota")}</p>
        </div>
      )}

      {folha && folha.erros.length > 0 && (
        <ul role="alert" className="space-y-1 rounded-lg p-3 text-sm" style={{ background: "var(--neg-weak)", color: "var(--text)" }}>
          {folha.erros.map((e) => <li key={e}>• {e}</li>)}
        </ul>
      )}
      {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      {folha && folha.foraDaFolha > 0 && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.mes.foraDaFolha", { count: folha.foraDaFolha })}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{folha && !folha.fechada && pendentes > 0 ? t("folha.mes.faltaConferir", { count: pendentes }) : ""}</p>
        {folha && (folha.fechada
          ? <Button variant="secondary" icon={LockOpen} onClick={() => { setMotivo(""); setModal("reabrir"); }}>{t("folha.mes.reabrir")}</Button>
          : <Button icon={Lock} disabled={!pronta} onClick={() => { setVenc({}); setModal("fechar"); }}>{t("folha.mes.fechar")}</Button>)}
      </div>

      {folha && (
        <Table
          columns={cols}
          rows={folha.linhas}
          rowKey={(r) => r.colaboradorId}
          empty={<EmptyState icon={FileText} title={t("folha.mes.vazioTitulo")} description={t("folha.mes.vazioDesc")} />}
          renderCell={(r, key) => {
            const x = r.resultado;
            switch (key) {
              case "nome": return (
                <span>
                  <span className="font-semibold">{r.nome}</span>
                  <span className="block text-xs" style={{ color: "var(--text-subtle)" }}>{r.cargo || "—"}</span>
                  {x.erros.length > 0 && <span className="block text-xs" style={{ color: "var(--neg)" }}>{x.erros[0]}{x.erros.length > 1 ? ` (+${x.erros.length - 1})` : ""}</span>}
                </span>
              );
              case "proventos": return money(x.proventos);
              case "descontos": return money(x.descontos);
              case "inss": return money(x.inss);
              case "irrf": return money(x.irrf);
              case "fgts": return money(x.fgts);
              case "liquido": return <strong>{money(x.liquido)}</strong>;
              case "conf": return r.conferido
                ? <Pill tone="pos" dot>{folha.fechada ? t("folha.mes.conferida") : t("folha.mes.conferidaPor", { nome: r.conferidoPorNome ?? "—" })}</Pill>
                : <Pill tone="warn" dot>{t("folha.mes.pendente")}</Pill>;
              default: return (
                <span className="flex justify-end gap-1">
                  {!folha.fechada && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => abrirLanc(r)}>{t("folha.mes.lancamentos")}</Button>}
                  {!folha.fechada && <Button size="sm" variant="ghost" icon={CheckCircle2} disabled={!r.conferido && x.erros.length > 0} onClick={() => conferir(r)}>{r.conferido ? t("folha.mes.desfazerConferencia") : t("folha.mes.conferir")}</Button>}
                  <Button size="sm" variant="ghost" icon={FileText} onClick={() => pdf(r)}>{folha.fechada ? t("folha.mes.holerite") : t("folha.mes.previa")}</Button>
                </span>
              );
            }
          }}
        />
      )}

      {folha && folha.reaberturas.length > 0 && (
        <details className="text-sm" style={{ color: "var(--text-muted)" }}>
          <summary className="cursor-pointer font-semibold">{t("custo.reaberturas")} ({folha.reaberturas.length})</summary>
          <ul className="mt-2 space-y-1">{folha.reaberturas.map((r) => <li key={r.em}>{new Date(r.em).toLocaleDateString(locale)} · {r.porNome} — {r.motivo}</li>)}</ul>
        </details>
      )}

      {/* Lançamentos variáveis do colaborador */}
      <Modal open={!!lanc} onClose={() => setLanc(null)} size="lg" title={lanc ? t("folha.lanc.titulo", { nome: lanc.linha.nome }) : ""} closeDisabled={busy}>
        {lanc && (
          <div className="space-y-4">
            <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.lanc.nota")}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["he50", "he100", "noturnas", "faltasDias", "atrasosHoras"] as const).map((k) => (
                <Field key={k} label={t(`folha.lanc.campos.${k}`)}><Input inputMode="decimal" value={lanc.f[k]} onChange={(e) => setLanc({ ...lanc, f: { ...lanc.f, [k]: e.target.value } })} /></Field>
              ))}
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("folha.lanc.extras")}</h3>
              {lanc.extras.map((x, i) => (
                <div key={i} className="grid items-end gap-2 sm:grid-cols-[1.4fr_1fr_1.2fr_auto]">
                  <select className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none" style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text)" }} aria-label={t("folha.lanc.rubrica")}
                    value={x.rubricaId} onChange={(e) => setLanc({ ...lanc, extras: lanc.extras.map((y, k) => (k === i ? { ...y, rubricaId: e.target.value } : y)) })}>
                    <option value="">{t("alocacao.escolha")}</option>
                    {rubricas.filter((r) => r.ativa && r.tipo === "manual").map((r) => <option key={r.id} value={r.id}>{r.codigo} — {r.nome} ({t(`folha.rubricas.naturezas.${r.natureza}`)})</option>)}
                  </select>
                  <Input inputMode="decimal" aria-label={t("folha.lanc.valor")} placeholder={t("folha.lanc.valor")} value={x.valor} onChange={(e) => setLanc({ ...lanc, extras: lanc.extras.map((y, k) => (k === i ? { ...y, valor: e.target.value } : y)) })} />
                  <Input aria-label={t("folha.lanc.obs")} placeholder={t("folha.lanc.obs")} maxLength={80} value={x.obs} onChange={(e) => setLanc({ ...lanc, extras: lanc.extras.map((y, k) => (k === i ? { ...y, obs: e.target.value } : y)) })} />
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label={t("alocacao.remover")} onClick={() => setLanc({ ...lanc, extras: lanc.extras.filter((_, k) => k !== i) })} />
                </div>
              ))}
              {rubricas.filter((r) => r.ativa && r.tipo === "manual").length === 0 && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.lanc.semManuais")}</p>}
              <Button size="sm" variant="secondary" icon={Plus} onClick={() => setLanc({ ...lanc, extras: [...lanc.extras, { rubricaId: "", valor: "", obs: "" }] })}>{t("folha.lanc.addExtra")}</Button>
            </div>
            {lancErro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{lancErro}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={limparLanc} disabled={busy}>{t("crud.limparLancamentos")}</Button>
              <Button variant="secondary" onClick={() => setLanc(null)} disabled={busy}>{t("form.cancelar")}</Button>
              <Button onClick={salvarLanc} loading={busy}>{t("form.salvar")}</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Fechamento */}
      <Modal open={modal === "fechar"} onClose={() => setModal(null)} size="md" title={t("folha.mes.fechar")} closeDisabled={busy}>
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("folha.mes.confirmarFechar", { comp: label })}</p>
          <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>{t("folha.mes.contasGeradas")}</p>
          {contasFechar.map((c) => (
            <Field key={c.id} label={`${t(`folha.mes.contas.${c.id}`)} — ${money(c.valor)}`}>
              <Input type="date" value={venc[c.id] ?? ""} onChange={(e) => setVenc({ ...venc, [c.id]: e.target.value })} />
            </Field>
          ))}
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.mes.fecharNota")}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)} disabled={busy}>{t("form.cancelar")}</Button>
            <Button onClick={() => acao("fechar")} loading={busy} disabled={busy || contasFechar.some((c) => !venc[c.id])}>{t("folha.mes.fechar")}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "reabrir"} onClose={() => setModal(null)} size="sm" title={t("custo.confirmarReabrir", { comp: label })} closeDisabled={busy}>
        <div className="space-y-4">
          <Field label={t("custo.motivo")}><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={t("custo.motivoPh")} maxLength={300} /></Field>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.mes.reabrirNota")}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)} disabled={busy}>{t("form.cancelar")}</Button>
            <Button variant="danger" onClick={() => acao("reabrir")} loading={busy} disabled={busy || motivo.trim().length < 5}>{t("folha.mes.reabrir")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
