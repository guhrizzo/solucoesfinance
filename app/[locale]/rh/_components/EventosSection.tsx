"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, CalendarDays, CheckCircle2, FileText, Lock, LockOpen, Plus, Trash2 } from "lucide-react";
import { Button, EmptyState, Field, Input, Modal, Pill, Table, type Column } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { abrirPdf, rhApi, selectClass, selectStyle, type Colaborador } from "./shared";

type Tipo = "ferias" | "decimo1" | "decimo2" | "rescisao";
interface EventoLinha { id: string; tipo: Tipo; nome: string; comp: string; status: "rascunho" | "conferido" | "fechado"; liquido: number; conferidoPorNome: string | null }
interface Linha { codigo: string; descricao: string; natureza: "provento" | "desconto"; valor: number; inss: boolean; irrf: boolean; fgts: boolean; grupo: "normal" | "decimo"; informativo?: boolean; ref?: string }
interface Resultado { proventos: number; descontos: number; liquido: number; inss: number; irrf: number; fgts: number; erros?: string[] }

const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const CAMPOS: Record<Tipo, string[]> = {
  ferias: ["diasGozo", "diasAbono", "mediaVariaveis"],
  decimo1: ["avos", "mediaVariaveis"],
  decimo2: ["avos", "mediaVariaveis", "valor1aParcela"],
  rescisao: ["diasSaldoSalario", "diasAvisoIndenizado", "avosDecimo", "avosFerias", "periodosFeriasVencidas", "saldoFgts", "pctMultaFgts", "mediaVariaveis"],
};

/** Férias, 13º (1ª e 2ª parcelas) e rescisão — cada um é uma etapa: rascunho → conferido → fechado. */
export function EventosSection({ colaboradores }: { colaboradores: Colaborador[] }) {
  const t = useTranslations("rh");
  const locale = useLocale();
  const [lista, setLista] = useState<EventoLinha[] | null>(null);
  const [erro, setErro] = useState("");
  const [reload, setReload] = useState(0);
  const recarregar = useCallback(() => setReload((n) => n + 1), []);
  const [aberto, setAberto] = useState<string | "novo" | null>(null);

  useEffect(() => {
    let cancelled = false;
    rhApi<{ eventos: EventoLinha[] }>("/api/rh/folha/eventos")
      .then((d) => { if (!cancelled) { setLista(d.eventos); setErro(""); } })
      .catch((e) => { if (!cancelled) { setErro(e instanceof Error ? e.message : t("comum.erroCarregar")); setLista([]); } });
    return () => { cancelled = true; };
  }, [reload, t]);

  const cols: Column[] = [
    { key: "tipo", header: t("folha.eventos.cols.tipo") }, { key: "nome", header: t("folha.mes.cols.colaborador") },
    { key: "comp", header: t("custo.competencia") }, { key: "liquido", header: t("folha.mes.cols.liquido"), align: "right" },
    { key: "status", header: t("colab.cols.status") }, { key: "acoes", header: t("colab.cols.acoes"), align: "right" },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.eventos.nota")}</p>
      <div className="flex justify-end"><Button icon={Plus} onClick={() => setAberto("novo")}>{t("folha.eventos.novo")}</Button></div>
      {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      {lista && (
        <Table
          columns={cols} rows={lista} rowKey={(r) => r.id}
          empty={<EmptyState icon={CalendarDays} title={t("folha.eventos.vazio")} />}
          renderCell={(r, key) => {
            switch (key) {
              case "tipo": return t(`folha.eventos.tipos.${r.tipo}`);
              case "nome": return <span className="font-semibold">{r.nome}</span>;
              case "comp": return r.comp;
              case "liquido": return formatMoney(r.liquido, locale);
              case "status": return <Pill tone={r.status === "fechado" ? "info" : r.status === "conferido" ? "pos" : "warn"} dot>{t(`folha.eventos.status.${r.status}`)}</Pill>;
              default: return <Button size="sm" variant="ghost" onClick={() => setAberto(r.id)}>{t("folha.eventos.abrir")}</Button>;
            }
          }}
        />
      )}
      {aberto && <EventoModal id={aberto === "novo" ? null : aberto} colaboradores={colaboradores} onClose={() => setAberto(null)} onChanged={recarregar} />}
    </div>
  );
}

function EventoModal({ id: idInicial, colaboradores, onClose, onChanged }: { id: string | null; colaboradores: Colaborador[]; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("rh");
  const locale = useLocale();
  const [id, setId] = useState<string | null>(idInicial);
  const [tipo, setTipo] = useState<Tipo>("ferias");
  const [colaboradorId, setColaboradorId] = useState("");
  const [comp, setComp] = useState(mesAtual());
  const [inputs, setInputs] = useState<Record<string, string>>({ motivo: "sem_justa_causa" });
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [res, setRes] = useState<Resultado | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [status, setStatus] = useState<"rascunho" | "conferido" | "fechado">("rascunho");
  const [conferidoPor, setConferidoPor] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [venc, setVenc] = useState<Record<string, string>>({});
  const [fase, setFase] = useState<"form" | "fechar" | "reabrir">("form");
  const [motivo, setMotivo] = useState("");
  const [carregando, setCarregando] = useState(!!idInicial);

  useEffect(() => {
    if (!idInicial) return;
    rhApi<{ tipo: Tipo; colaboradorId: string; comp: string; inputs: Record<string, unknown>; linhas: Linha[]; resultado: Resultado; status: typeof status; conferencia?: { porNome: string } | null; erros?: string[] }>(`/api/rh/folha/eventos?id=${idInicial}`)
      .then((d) => {
        setTipo(d.tipo); setColaboradorId(d.colaboradorId); setComp(d.comp); setLinhas(d.linhas); setRes(d.resultado); setStatus(d.status);
        setConferidoPor(d.conferencia?.porNome ?? null); setErros(d.erros ?? []);
        setInputs(Object.fromEntries(Object.entries(d.inputs ?? {}).map(([k, v]) => [k, String(v)])));
      })
      .catch((e) => setMsg(e instanceof Error ? e.message : "Erro"))
      .finally(() => setCarregando(false));
  }, [idInicial]);

  const travado = status === "fechado";
  const dinheiro = (n: number) => formatMoney(n, locale);
  const corpoCalculo = () => ({ tipo, colaboradorId, comp, inputs: Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, k === "motivo" ? v : Number(String(v).replace(",", ".")) || 0])) });

  async function chamar<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true); setMsg("");
    try { return await fn(); } catch (e) { setMsg(e instanceof Error ? e.message : "Erro"); return null; } finally { setBusy(false); }
  }

  async function sugerir() {
    const r = await chamar(() => rhApi<{ linhas: Linha[]; resultado: Resultado; erros: string[] }>("/api/rh/folha/eventos", { body: { acao: "sugerir", ...corpoCalculo() } }));
    if (r) { setLinhas(r.linhas); setRes(r.resultado); setErros(r.erros); }
  }
  async function recalcular(novas: Linha[]) {
    setLinhas(novas);
    const r = await chamar(() => rhApi<{ resultado: Resultado; erros: string[] }>("/api/rh/folha/eventos", { body: { acao: "sugerir", ...corpoCalculo(), linhas: novas } }));
    if (r) { setRes(r.resultado); setErros(r.erros); }
  }
  async function salvar() {
    const r = await chamar(() => rhApi<{ id: string; resultado: Resultado }>("/api/rh/folha/eventos", { body: { acao: "salvar", id, ...corpoCalculo(), linhas } }));
    if (r) { setId(r.id); setRes(r.resultado); setStatus("rascunho"); setConferidoPor(null); setMsg(t("comum.salvo")); onChanged(); }
  }
  async function simples(acao: string, extra: Record<string, unknown> = {}) {
    const r = await chamar(() => rhApi("/api/rh/folha/eventos", { body: { acao, id, ...extra } }));
    if (r) { onChanged(); if (acao === "excluir") onClose(); else { setFase("form"); onClose(); } }
  }

  const editLinha = (i: number, p: Partial<Linha>) => recalcular(linhas.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const contas = res ? [{ id: "liquido", v: res.liquido }, { id: "encargos", v: Math.round((res.inss + res.irrf + res.fgts) * 100) / 100 }].filter((c) => c.v > 0) : [];

  return (
    <Modal open onClose={onClose} size="lg" title={id ? t("folha.eventos.titulo", { tipo: t(`folha.eventos.tipos.${tipo}`) }) : t("folha.eventos.novo")} closeDisabled={busy}>
      {carregando ? <p className="text-sm">{t("comum.carregando")}</p> : fase === "fechar" ? (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("folha.eventos.fecharNota")}</p>
          {contas.map((c) => (
            <Field key={c.id} label={`${t(`folha.eventos.contas.${c.id}`)} — ${dinheiro(c.v)}`}>
              <Input type="date" value={venc[c.id] ?? ""} onChange={(e) => setVenc({ ...venc, [c.id]: e.target.value })} />
            </Field>
          ))}
          {msg && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{msg}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFase("form")} disabled={busy}>{t("form.cancelar")}</Button>
            <Button loading={busy} disabled={busy || contas.some((c) => !venc[c.id])} onClick={() => simples("fechar", { vencimentos: venc })}>{t("folha.eventos.fechar")}</Button>
          </div>
        </div>
      ) : fase === "reabrir" ? (
        <div className="space-y-4">
          <Field label={t("custo.motivo")}><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={t("custo.motivoPh")} maxLength={300} /></Field>
          {msg && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{msg}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFase("form")} disabled={busy}>{t("form.cancelar")}</Button>
            <Button variant="danger" loading={busy} disabled={busy || motivo.trim().length < 5} onClick={() => simples("reabrir", { motivo })}>{t("folha.eventos.reabrir")}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <p role="note" className="flex items-start gap-2 rounded-lg p-3 text-xs font-semibold" style={{ background: "var(--warn-weak)", color: "var(--text)" }}>
            <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} aria-hidden />{t("folha.aviso")}
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("folha.eventos.cols.tipo")}>
              <select className={selectClass} style={selectStyle} value={tipo} disabled={!!id} onChange={(e) => { setTipo(e.target.value as Tipo); setLinhas([]); setRes(null); }}>
                {(["ferias", "decimo1", "decimo2", "rescisao"] as const).map((k) => <option key={k} value={k}>{t(`folha.eventos.tipos.${k}`)}</option>)}
              </select>
            </Field>
            <Field label={t("folha.mes.cols.colaborador")}>
              <select className={selectClass} style={selectStyle} value={colaboradorId} disabled={!!id} onChange={(e) => setColaboradorId(e.target.value)}>
                <option value="">{t("alocacao.escolha")}</option>
                {colaboradores.filter((c) => c.vinculo === "CLT").map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
            <Field label={t("folha.eventos.compPagamento")}><input type="month" className={selectClass} style={selectStyle} value={comp} disabled={!!id} onChange={(e) => e.target.value && setComp(e.target.value)} /></Field>
          </div>

          {!travado && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                {tipo === "rescisao" && (
                  <Field label={t("folha.eventos.campos.motivo")}>
                    <select className={selectClass} style={selectStyle} value={inputs.motivo ?? "sem_justa_causa"} onChange={(e) => setInputs({ ...inputs, motivo: e.target.value })}>
                      {(["sem_justa_causa", "pedido_demissao", "justa_causa", "acordo"] as const).map((k) => <option key={k} value={k}>{t(`folha.eventos.motivos.${k}`)}</option>)}
                    </select>
                  </Field>
                )}
                {CAMPOS[tipo].map((k) => (
                  <Field key={k} label={t(`folha.eventos.campos.${k}`)}><Input inputMode="decimal" value={inputs[k] ?? ""} onChange={(e) => setInputs({ ...inputs, [k]: e.target.value })} /></Field>
                ))}
              </div>
              <Button variant="secondary" size="sm" disabled={busy || !colaboradorId} onClick={sugerir}>{t("folha.eventos.sugerir")}</Button>
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.eventos.sugerirNota")}</p>
            </div>
          )}

          {linhas.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("folha.eventos.verbas")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs" style={{ color: "var(--text-subtle)" }}>
                      <th className="py-1 text-left font-semibold">{t("folha.eventos.descricao")}</th><th className="px-1 text-right font-semibold">{t("folha.lanc.valor")}</th>
                      <th className="px-1 font-semibold">INSS</th><th className="px-1 font-semibold">IRRF</th><th className="px-1 font-semibold">FGTS</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, i) => (
                      <tr key={i} className="border-t" style={{ borderColor: "var(--border)" }}>
                        <td className="py-1.5 pr-2">
                          <Input aria-label={t("folha.eventos.descricao")} value={l.descricao} disabled={travado} maxLength={120} onChange={(e) => editLinha(i, { descricao: e.target.value })} />
                          <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
                            {t(`folha.rubricas.naturezas.${l.natureza}`)}{l.grupo === "decimo" ? ` · ${t("folha.eventos.grupoDecimo")}` : ""}{l.informativo ? ` · ${t("folha.eventos.informativo")}` : ""}{l.ref ? ` · ${l.ref}` : ""}
                          </span>
                        </td>
                        <td className="px-1"><Input className="!w-28 text-right" inputMode="decimal" aria-label={t("folha.lanc.valor")} disabled={travado} defaultValue={String(l.valor).replace(".", ",")} onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (Number.isFinite(v) && v !== l.valor) editLinha(i, { valor: v }); }} /></td>
                        {(["inss", "irrf", "fgts"] as const).map((k) => (
                          <td key={k} className="px-1 text-center"><input type="checkbox" aria-label={k.toUpperCase()} disabled={travado || l.informativo} checked={l[k]} onChange={(e) => editLinha(i, { [k]: e.target.checked })} /></td>
                        ))}
                        <td>{!travado && <Button size="sm" variant="ghost" icon={Trash2} aria-label={t("alocacao.remover")} onClick={() => recalcular(linhas.filter((_, k) => k !== i))} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!travado && (
                <Button size="sm" variant="secondary" icon={Plus} onClick={() => recalcular([...linhas, { codigo: "X", descricao: "", natureza: "provento", valor: 0, inss: false, irrf: false, fgts: false, grupo: "normal" }])}>{t("folha.eventos.addVerba")}</Button>
              )}
            </div>
          )}

          {res && (
            <div className="grid gap-2 rounded-lg p-3 text-sm sm:grid-cols-5" style={{ background: "var(--sunken)" }}>
              {([["proventos", res.proventos], ["inss", res.inss], ["irrf", res.irrf], ["fgts", res.fgts], ["liquido", res.liquido]] as const).map(([k, v]) => (
                <span key={k}><span className="block text-xs" style={{ color: "var(--text-subtle)" }}>{t(`folha.eventos.res.${k}`)}</span><strong>{dinheiro(v)}</strong></span>
              ))}
            </div>
          )}
          {erros.length > 0 && <ul role="alert" className="space-y-1 text-sm" style={{ color: "var(--neg)" }}>{erros.map((e) => <li key={e}>• {e}</li>)}</ul>}
          {status === "conferido" && <p className="text-xs font-semibold" style={{ color: "var(--pos)" }}>{t("folha.mes.conferidaPor", { nome: conferidoPor ?? "—" })}</p>}
          {msg && <p role="status" className="text-sm" style={{ color: "var(--text-muted)" }}>{msg}</p>}

          <div className="flex flex-wrap justify-between gap-2">
            <span className="flex gap-2">
              {id && <Button variant="ghost" size="sm" icon={FileText} onClick={() => abrirPdf(`/api/rh/holerite?evento=${id}`).catch((e) => setMsg(e instanceof Error ? e.message : "Erro"))}>{status === "fechado" ? t("folha.mes.holerite") : t("folha.mes.previa")}</Button>}
              {id && status !== "fechado" && <Button variant="ghost" size="sm" icon={Trash2} disabled={busy} onClick={() => simples("excluir")}>{t("folha.eventos.excluir")}</Button>}
            </span>
            <span className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onClose} disabled={busy}>{t("rem.fechar")}</Button>
              {!travado && <Button variant="secondary" loading={busy} disabled={busy || linhas.length === 0 || !colaboradorId} onClick={salvar}>{t("folha.eventos.salvarRascunho")}</Button>}
              {id && status === "rascunho" && <Button icon={CheckCircle2} disabled={busy || erros.length > 0} onClick={() => simples("conferir")}>{t("folha.eventos.conferir")}</Button>}
              {id && status === "conferido" && <Button icon={Lock} disabled={busy} onClick={() => { setVenc({}); setMsg(""); setFase("fechar"); }}>{t("folha.eventos.fechar")}</Button>}
              {id && status === "fechado" && <Button variant="secondary" icon={LockOpen} onClick={() => { setMotivo(""); setMsg(""); setFase("reabrir"); }}>{t("folha.eventos.reabrir")}</Button>}
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}
