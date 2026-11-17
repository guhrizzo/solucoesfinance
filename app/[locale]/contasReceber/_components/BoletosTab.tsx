"use client";

// Aba "Boletos" de Contas a Receber (Banco Inter): resumo em 4 cartões, filtros
// (situação, período por vencimento, busca por pagador), lista com ações por
// linha (PDF, copiar linha digitável / Pix, reenviar cobrança, cancelar) e o
// botão Atualizar (consulta de segurança no Inter). Os dados vêm de
// useBoletos (somente leitura); toda escrita passa pelas rotas /api/inter/boletos.

import { useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  AlertTriangle, Ban, Barcode, FileText, Landmark, Lock, Plus, QrCode, RefreshCw, Search, Send, Sparkles, X,
} from "lucide-react";
import { Button, EmptyState, KpiTile, Modal, Pill, Table, type Column, type PillTone } from "@/app/components/ui";
import { Link } from "@/i18n/navigation";
import { authedFetch } from "@/lib/authedFetch";
import { formatDate, formatMoney } from "@/lib/format";
import { grupoDe, resumo, type BoletoDoc, type BoletoGrupo } from "@/lib/interBoletoRegras";
import type { BoletosEstado } from "@/lib/interBoletosEstado";
import { erroVisivel, filtrarBoletos, hojeSP, podeDescartar } from "@/lib/boletoTela";
import { PinGate, hasPin } from "./PinGate";

type Toast = (msg: string, type?: "ok" | "err" | "warn") => void;
type Filtro = "todos" | BoletoGrupo;
const FILTROS: Filtro[] = ["todos", "aguardando", "vencido", "pago", "outros"];

const dataBR = (iso: string, locale: string) => formatDate(`${iso}T12:00:00`, locale);

function tomDe(b: BoletoDoc, hoje: string): PillTone {
  if (b.situacao === "PROTESTO") return "neg";
  switch (grupoDe(b, hoje)) {
    case "aguardando": return b.situacao === "EM_PROCESSAMENTO" ? "muted" : "info";
    case "vencido": return "neg";
    case "pago": return "pos";
    default: return "muted";
  }
}

type CancelEtapa = "confirmar" | "pin" | "enviando";

export function BoletosTab({
  boletos,
  loading,
  error,
  isPro,
  estado,
  isOwner,
  pinUid,
  onToast,
  onEmitAvulso,
  onResend,
  resendableIds,
  focusReceivableId,
  onClearFocus,
}: {
  boletos: BoletoDoc[];
  loading: boolean;
  error?: string;
  isPro: boolean;
  /** Estado da cobrança no Inter; null enquanto carrega. */
  estado: BoletosEstado | null;
  /** Só o dono pode descartar à força um boleto sem confirmação do banco. */
  isOwner: boolean;
  /** uid do login atual (dono do PIN). */
  pinUid: string | null;
  onToast: Toast;
  onEmitAvulso: () => void;
  /** Reusa o envio de cobrança por e-mail da própria página. */
  onResend: (receivableId: string) => Promise<void>;
  /**
   * Ids dos BOLETOS que podem ser reenviados por e-mail: conta a receber com e-mail
   * do cliente, ainda não recebida (Pro), e boleto com linha digitável no mesmo
   * valor (saldo) e vencimento da conta — senão o e-mail sairia só com Pix.
   */
  resendableIds: ReadonlySet<string>;
  /** Mostra só os boletos desta conta a receber (vindo do "Boleto emitido"). */
  focusReceivableId: string;
  onClearFocus: () => void;
}) {
  const t = useTranslations("contasReceber.boletos");
  const locale = useLocale();
  const hoje = hojeSP();
  const brl = (n: number) => formatMoney(n, locale);

  const [situacao, setSituacao] = useState<Filtro>("todos");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [busca, setBusca] = useState("");
  const [atualizando, setAtualizando] = useState(false);
  const [resending, setResending] = useState<string | null>(null);

  // Cancelamento: confirmar → PIN → enviar. `falhou` libera o "descartar" do dono.
  const [alvoId, setAlvoId] = useState<string | null>(null);
  const cancelBusy = useRef(false);
  // Sempre o boleto vivo da lista (podeDescartar e mensagens acompanham as atualizações).
  const alvo = alvoId ? boletos.find((x) => x.id === alvoId) ?? null : null;
  const [etapa, setEtapa] = useState<CancelEtapa>("confirmar");
  const [descartando, setDescartando] = useState(false);
  const [falhou, setFalhou] = useState(false);
  const [erroCancel, setErroCancel] = useState("");
  const [aviso, setAviso] = useState("");

  const cards = useMemo(() => resumo(boletos, hoje), [boletos, hoje]);
  const lista = useMemo(
    () => filtrarBoletos(boletos, { situacao, de, ate, busca, receivableId: focusReceivableId, hoje }),
    [boletos, situacao, de, ate, busca, focusReceivableId, hoje],
  );
  const filtrando = situacao !== "todos" || !!de || !!ate || !!busca.trim() || !!focusReceivableId;

  if (!isPro) {
    return (
      <Link
        href="/assinatura"
        className="flex items-center gap-3 rounded-xl px-4 py-4 transition-opacity hover:opacity-90"
        style={{ border: "1px dashed var(--border-strong)", background: "var(--sunken)" }}
      >
        <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--brand-weak)" }}>
          <Lock size={16} style={{ color: "var(--brand)" }} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold" style={{ color: "var(--text)" }}>{t("locked.title")}</span>
          <span className="block text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{t("locked.body")}</span>
        </span>
        <span className="text-xs font-bold flex items-center gap-1 shrink-0" style={{ color: "var(--brand)" }}>
          <Sparkles size={13} aria-hidden="true" /> {t("locked.cta")}
        </span>
      </Link>
    );
  }

  async function atualizar() {
    if (atualizando) return;
    setAtualizando(true);
    try {
      const res = await authedFetch("/api/inter/boletos/atualizar", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string; consultados?: number; pagos?: number };
      if (!res.ok) onToast(json.error || t("toast.refreshError"), "err");
      else onToast(t("toast.refreshDone", { checked: json.consultados ?? 0, paid: json.pagos ?? 0 }));
    } catch (e) {
      onToast((e as Error)?.message || t("toast.refreshError"), "err");
    } finally {
      setAtualizando(false);
    }
  }

  async function abrirPdf(b: BoletoDoc) {
    // Abre a aba já no clique (antes do await) para o bloqueador de pop-up não barrar.
    const w = window.open("", "_blank");
    if (w) w.opener = null;
    try {
      const res = await authedFetch(`/api/inter/boletos/${b.id}/pdf`);
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        w?.close();
        onToast(json.error || t("toast.pdfError"), "err");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      if (w) {
        w.location.href = url;
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `boleto-${b.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      w?.close();
      onToast((e as Error)?.message || t("toast.pdfError"), "err");
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      onToast(t("toast.copied"));
    } catch {
      onToast(t("toast.copyError"), "err");
    }
  }

  async function reenviar(b: BoletoDoc) {
    if (!b.receivableId || resending) return;
    setResending(b.id);
    try {
      await onResend(b.receivableId);
    } finally {
      setResending(null);
    }
  }

  function abrirCancelar(b: BoletoDoc) {
    setAlvoId(b.id);
    setEtapa("confirmar");
    setFalhou(false);
    setErroCancel("");
    setAviso("");
    setDescartando(false);
  }

  function fecharCancelar() {
    if (etapa === "enviando") return;
    setAlvoId(null);
  }

  async function pedirPin(forcar: boolean) {
    if (!pinUid || !(await hasPin(pinUid))) {
      setErroCancel(t("emit.errors.noPin"));
      return;
    }
    setErroCancel("");
    setDescartando(forcar);
    setEtapa("pin");
  }

  async function cancelar() {
    // Guarda síncrona: o PinModal pode confirmar duas vezes (Enter/clique rápidos).
    if (!alvo || cancelBusy.current || etapa !== "pin") return;
    cancelBusy.current = true;
    const forcar = descartando;
    setEtapa("enviando");
    setErroCancel("");
    try {
      const res = await authedFetch(`/api/inter/boletos/${alvo.id}/cancelar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forcar ? { forcarDescarte: true } : {}),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; aviso?: string };
      if (!res.ok) {
        setErroCancel(json.error || t("cancel.error"));
        setFalhou(true);
        setEtapa("confirmar");
        return;
      }
      onToast(forcar ? t("cancel.discardSuccess") : t("cancel.success"));
      if (json.aviso) {
        setAviso(json.aviso);
        setEtapa("confirmar");
      } else {
        setAlvoId(null);
      }
    } catch (e) {
      setErroCancel((e as Error)?.message || t("cancel.error"));
      setFalhou(true);
      setEtapa("confirmar");
    } finally {
      cancelBusy.current = false;
    }
  }

  // ── Peças da linha ─────────────────────────────────────────────────────────

  const situacaoPill = (b: BoletoDoc) => {
    const g = grupoDe(b, hoje);
    const rotulo = b.situacao === "A_RECEBER" && g === "vencido" ? t("situacao.vencido") : t(`situacao.${b.situacao}`);
    return <Pill tone={tomDe(b, hoje)} dot>{rotulo}</Pill>;
  };

  const avisos = (b: BoletoDoc) => {
    // Último erro do servidor (mensagem em português), só onde ainda pede ação.
    const erro = erroVisivel(b);
    return b.revisarCaixa || b.pagoAposCancelamento || erro ? (
      <>
        {(b.revisarCaixa || b.pagoAposCancelamento) && (
          <span className="flex flex-wrap gap-1.5 mt-1">
            {b.revisarCaixa && (
              <Pill tone="warn"><AlertTriangle size={11} aria-hidden="true" /> {t("warn.revisarCaixa")}</Pill>
            )}
            {b.pagoAposCancelamento && (
              <Pill tone="warn"><AlertTriangle size={11} aria-hidden="true" /> {t("warn.pagoAposCancelamento")}</Pill>
            )}
          </span>
        )}
        {erro && (
          <span className="block mt-1 text-xs leading-snug whitespace-normal break-words max-w-[22rem]" style={{ color: "var(--text-muted)" }}>
            {erro}
          </span>
        )}
      </>
    ) : null;
  };

  const acoes = (b: BoletoDoc) => {
    const vigente = b.situacao === "EM_PROCESSAMENTO" || b.situacao === "A_RECEBER" || b.situacao === "ATRASADO";
    const pode = !!b.receivableId && vigente && resendableIds.has(b.id);
    return (
      <span className="inline-flex items-center gap-1 flex-wrap justify-end">
        {b.codigoSolicitacao && b.situacao !== "EM_PROCESSAMENTO" && b.situacao !== "FALHA_EMISSAO" && (
          <Button variant="ghost" size="sm" icon={FileText} aria-label={t("actions.pdf")} title={t("actions.pdf")} onClick={() => void abrirPdf(b)} />
        )}
        {b.linhaDigitavel && (
          <Button variant="ghost" size="sm" icon={Barcode} aria-label={t("actions.copyLine")} title={t("actions.copyLine")} onClick={() => void copiar(b.linhaDigitavel!)} />
        )}
        {b.pixCopiaECola && (
          <Button variant="ghost" size="sm" icon={QrCode} aria-label={t("actions.copyPix")} title={t("actions.copyPix")} onClick={() => void copiar(b.pixCopiaECola!)} />
        )}
        {pode && (
          <Button
            variant="ghost" size="sm" icon={Send} loading={resending === b.id}
            aria-label={t("actions.resend")} title={t("actions.resend")} onClick={() => void reenviar(b)}
          />
        )}
        {vigente && (
          <Button variant="danger" size="sm" icon={Ban} aria-label={t("actions.cancel")} title={t("actions.cancel")} onClick={() => abrirCancelar(b)} />
        )}
      </span>
    );
  };

  const colunas: Column[] = [
    { key: "payer", header: t("columns.payer") },
    { key: "amount", header: t("columns.amount"), align: "right" },
    { key: "due", header: t("columns.due") },
    { key: "status", header: t("columns.status") },
    { key: "actions", header: <span className="sr-only">{t("columns.actions")}</span>, align: "right" },
  ];

  const vazio = (
    <EmptyState
      icon={Landmark}
      title={filtrando ? t("empty.noResults") : t("empty.title")}
      description={filtrando ? t("empty.adjustFilters") : t("empty.description")}
      action={!filtrando && estado === "ativo" ? <Button icon={Plus} onClick={onEmitAvulso}>{t("actions.emitAvulso")}</Button> : undefined}
    />
  );

  return (
    <div className="space-y-4">
      {/* Ações do topo */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {/* Habilitado com o Inter conectado mesmo sem a cobrança ativa: cobre boletos abertos após
            reconexão; sem o escopo, o servidor devolve a mensagem do 403 em vez de um botão morto. */}
        <Button variant="secondary" icon={RefreshCw} loading={atualizando} onClick={() => void atualizar()} disabled={estado === null || estado === "indisponivel"}>
          {atualizando ? t("actions.refreshing") : t("actions.refresh")}
        </Button>
        <Button icon={Plus} onClick={onEmitAvulso}>{t("actions.emitAvulso")}</Button>
      </div>

      {estado !== null && estado !== "ativo" && (
        <div
          role="status"
          className="rounded-xl px-4 py-3 text-sm flex items-start gap-2"
          style={{ background: "var(--warn-weak)", color: "var(--warn)" }}
        >
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t(`estado.${estado}`)}
        </div>
      )}

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label={t("cards.aguardando")} value={brl(cards.aguardando.total)} delta={t("cards.count", { count: cards.aguardando.qtd })} />
        <KpiTile label={t("cards.vencido")} value={brl(cards.vencido.total)} valueTone="neg" delta={t("cards.count", { count: cards.vencido.qtd })} />
        <KpiTile label={t("cards.pago")} value={brl(cards.pago.total)} valueTone="pos" delta={t("cards.count", { count: cards.pago.qtd })} />
        <div className="rounded-[var(--radius-card)] ring-2 ring-[var(--brand)]">
          <KpiTile label={t("cards.aReceber")} value={brl(cards.aReceber.total)} valueTone="pos" delta={t("cards.count", { count: cards.aReceber.qtd })} />
        </div>
      </div>

      {/* Filtros */}
      <div className="space-y-3 rounded-xl p-3.5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-subtle)" }} aria-hidden="true" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t("filters.searchPlaceholder")}
            aria-label={t("filters.searchAria")}
            className="w-full rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none"
            style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t("filters.situacao")} className="flex items-center gap-2 overflow-x-auto">
            {FILTROS.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={situacao === f}
                title={f === "outros" ? t("filters.outrosHint") : undefined}
                onClick={() => setSituacao(f)}
                className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer transition-colors"
                style={situacao === f
                  ? { background: "var(--brand-weak)", color: "var(--brand)", borderColor: "var(--brand)" }
                  : { background: "transparent", color: "var(--text-muted)", borderColor: "var(--border)" }}
              >
                {t(`filters.${f}`)}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <label className="flex items-center gap-1.5">
              {t("filters.from")}
              <input
                type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)}
                className="rounded-lg px-2 py-1.5 text-xs"
                style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </label>
            <label className="flex items-center gap-1.5">
              {t("filters.to")}
              <input
                type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)}
                className="rounded-lg px-2 py-1.5 text-xs"
                style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </label>
            {(de || ate) && (
              <button type="button" onClick={() => { setDe(""); setAte(""); }} className="underline cursor-pointer" style={{ color: "var(--brand)" }}>
                {t("filters.clearPeriod")}
              </button>
            )}
            <span className="font-medium" style={{ color: "var(--text-subtle)" }}>{t("filters.resultCount", { count: lista.length })}</span>
          </div>
        </div>

        {focusReceivableId && (
          <div className="flex items-center gap-2 text-xs">
            <Pill tone="info">{t("filters.onlyReceivable")}</Pill>
            <button type="button" onClick={onClearFocus} className="inline-flex items-center gap-1 underline cursor-pointer" style={{ color: "var(--brand)" }}>
              <X size={12} aria-hidden="true" /> {t("filters.clearReceivable")}
            </button>
          </div>
        )}
      </div>

      {/* Lista */}
      {loading ? (
        <p role="status" className="text-sm py-10 text-center" style={{ color: "var(--text-muted)" }}>{t("state.loading")}</p>
      ) : error ? (
        <div role="alert" className="rounded-xl px-4 py-3 text-sm flex items-start gap-2" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>
          <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t("state.error")}
        </div>
      ) : lista.length === 0 ? (
        vazio
      ) : (
        <>
          {/* Celular: cartões empilhados */}
          <ul className="md:hidden space-y-2.5 m-0 p-0 list-none" aria-label={t("columns.table")}>
            {lista.map((b) => (
              <li key={b.id} className="rounded-xl p-3.5 space-y-2" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{b.payer.nome}</p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("columns.due")}: {dataBR(b.dueDate, locale)}</p>
                  </div>
                  <p className="mono text-sm font-medium shrink-0" style={{ color: "var(--text)" }}>{brl(b.amount)}</p>
                </div>
                {situacaoPill(b)}
                {avisos(b)}
                <div className="flex justify-end pt-1">{acoes(b)}</div>
              </li>
            ))}
          </ul>

          {/* Tela larga: tabela (rola na horizontal) */}
          <div className="hidden md:block">
            <Table
              columns={colunas}
              rows={lista}
              rowKey={(b) => b.id}
              renderCell={(b, key) => {
                switch (key) {
                  case "payer":
                    return (
                      <span className="block min-w-0">
                        <span className="block font-medium truncate max-w-[16rem]">{b.payer.nome}</span>
                        {avisos(b)}
                      </span>
                    );
                  case "amount": return brl(b.amount);
                  case "due": return dataBR(b.dueDate, locale);
                  case "status": return situacaoPill(b);
                  default: return acoes(b);
                }
              }}
            />
          </div>
        </>
      )}

      {/* Cancelar boleto */}
      <Modal open={!!alvo} onClose={fecharCancelar} title={t("cancel.title")} size="sm" closeDisabled={etapa === "enviando"}>
        {alvo && (
          <div className="p-5 space-y-4">
            {aviso ? (
              <>
                <div role="status" className="rounded-xl px-4 py-3 text-sm" style={{ background: "var(--warn-weak)", color: "var(--warn)" }}>{aviso}</div>
                <div className="flex justify-end"><Button onClick={() => setAlvoId(null)}>{t("emit.close")}</Button></div>
              </>
            ) : (
              <>
                <p className="text-sm" style={{ color: "var(--text)" }}>
                  {t("cancel.message", { payer: alvo.payer.nome, amount: brl(alvo.amount), due: dataBR(alvo.dueDate, locale) })}
                </p>
                {erroCancel && (
                  <div role="alert" className="rounded-xl px-4 py-3 text-xs flex items-start gap-2" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {erroCancel}
                  </div>
                )}
                {falhou && isOwner && podeDescartar(alvo, Date.now()) && (
                  <div className="rounded-xl p-3 space-y-2" style={{ border: "1px solid var(--border-strong)" }}>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("cancel.discardHint")}</p>
                    <Button variant="danger" size="sm" disabled={etapa !== "confirmar"} onClick={() => void pedirPin(true)}>
                      {t("cancel.discard")}
                    </Button>
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={fecharCancelar} disabled={etapa === "enviando"}>{t("cancel.back")}</Button>
                  <Button variant="danger" loading={etapa === "enviando"} disabled={etapa !== "confirmar"} onClick={() => void pedirPin(false)}>
                    {t("cancel.confirm")}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {pinUid && (
        <PinGate
          open={etapa === "pin" && !!alvo}
          title={descartando ? t("cancel.discardPinTitle") : t("cancel.pinTitle")}
          subtitle={descartando ? t("cancel.discardPinSubtitle") : t("cancel.pinSubtitle")}
          pinUid={pinUid}
          onClose={() => setEtapa((e) => (e === "pin" ? "confirmar" : e))}
          onVerified={() => void cancelar()}
          onError={(m) => { setErroCancel(m); setEtapa("confirmar"); }}
        />
      )}
    </div>
  );
}
