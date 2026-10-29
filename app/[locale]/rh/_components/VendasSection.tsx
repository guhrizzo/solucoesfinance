"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, ShoppingCart, Trash2, Undo2 } from "lucide-react";
import { Button, EmptyState, Field, Input, Modal, MoneyInput, Pill, Table, parseAmount, type Column } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { fmtData, hojeISO, rhApi, selectClass, selectStyle } from "./shared";

export interface VendaLinha {
  key: string;
  origem: "cashflow" | "vendas";
  refId: string;
  date: string;
  descricao: string;
  canal: string;
  valor: number;
  foraDoCaixa: boolean;
  atribuicao: { colaboradorId: string; pct: number; nome: string }[] | null;
  estornado: number;
  margem: number | null;
}

export interface EstornoLinha {
  id: string;
  vendaKey: string;
  data: string;
  valor: number;
  tipo: "estorno" | "cancelamento" | "devolucao";
  motivo: string;
  incluidoEm?: string;
}

interface Props {
  vendas: VendaLinha[];
  estornos: EstornoLinha[];
  colaboradores: { id: string; nome: string; ativo: boolean }[];
  fechada: boolean;
  truncado: boolean;
  onChanged: () => void;
}

export function VendasSection({ vendas, estornos, colaboradores, fechada, truncado, onChanged }: Props) {
  const t = useTranslations("rh");
  const locale = useLocale();
  const [atribuindo, setAtribuindo] = useState<VendaLinha | null>(null);
  const [estornando, setEstornando] = useState<VendaLinha | null>(null);
  const money = (n: number) => formatMoney(n, locale);

  const cols: Column[] = [
    { key: "data", header: t("comissoes.vendas.cols.data") },
    { key: "venda", header: t("comissoes.vendas.cols.venda") },
    { key: "valor", header: t("comissoes.vendas.cols.valor"), align: "right" },
    { key: "margem", header: t("comissoes.vendas.cols.margem"), align: "right" },
    { key: "vendedores", header: t("comissoes.vendas.cols.vendedores") },
    { key: "acoes", header: t("comissoes.vendas.cols.acoes"), align: "right" },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("comissoes.vendas.titulo")}</h2>
        <p className="mt-1 text-xs" style={{ color: "var(--text-subtle)" }}>{t("comissoes.vendas.nota")}</p>
      </div>
      <Table
        columns={cols}
        rows={vendas}
        rowKey={(r) => r.key}
        empty={<EmptyState icon={ShoppingCart} title={t("comissoes.vendas.vazio")} />}
        renderCell={(r, key) => {
          switch (key) {
            case "data": return fmtData(r.date, locale);
            case "venda": return (
              <span>
                {r.descricao}
                {r.foraDoCaixa && <Pill tone="muted" className="ml-2">{t("comissoes.vendas.foraDoCaixa")}</Pill>}
              </span>
            );
            case "valor": return (
              <span>
                {money(r.valor)}
                {r.estornado > 0 && <span className="block text-xs" style={{ color: "var(--neg)" }}>{t("comissoes.vendas.estornado", { valor: money(r.estornado) })}</span>}
              </span>
            );
            case "margem": return r.margem === null ? <Pill tone="warn">{t("comissoes.vendas.semCusto")}</Pill> : money(r.margem);
            case "vendedores": return r.atribuicao
              ? <span className="text-xs">{r.atribuicao.map((a) => `${a.nome} ${a.pct}%`).join(" · ")}</span>
              : <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("comissoes.vendas.naoAtribuida")}</span>;
            default: return (
              <span className="flex justify-end gap-1">
                {!fechada && <Button size="sm" variant="ghost" onClick={() => setAtribuindo(r)}>{r.atribuicao ? t("comissoes.vendas.editar") : t("comissoes.vendas.atribuir")}</Button>}
                {r.atribuicao && <Button size="sm" variant="ghost" icon={Undo2} onClick={() => setEstornando(r)}>{t("comissoes.vendas.estorno")}</Button>}
              </span>
            );
          }
        }}
      />
      {truncado && <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("comissoes.vendas.truncado")}</p>}

      <AtribuicaoModal venda={atribuindo} colaboradores={colaboradores.filter((c) => c.ativo)} onClose={() => setAtribuindo(null)} onSaved={onChanged} />
      <EstornoModal venda={estornando} estornos={estornos.filter((e) => e.vendaKey === estornando?.key)} onClose={() => setEstornando(null)} onSaved={onChanged} />
    </div>
  );
}

// ── Atribuição ───────────────────────────────────────────────────────────────

function AtribuicaoModal({ venda, colaboradores, onClose, onSaved }: {
  venda: VendaLinha | null; colaboradores: { id: string; nome: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations("rh");
  const [linhas, setLinhas] = useState<{ colaboradorId: string; pct: string }[]>([]);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!venda) return;
    setErro("");
    setLinhas(venda.atribuicao ? venda.atribuicao.map((a) => ({ colaboradorId: a.colaboradorId, pct: String(a.pct) })) : [{ colaboradorId: "", pct: "100" }]);
  }, [venda]);

  if (!venda) return null;
  const soma = Math.round(linhas.reduce((s, l) => s + (Number(l.pct.replace(",", ".")) || 0), 0) * 100) / 100;
  const fecha = Math.abs(soma - 100) <= 0.01 && linhas.every((l) => l.colaboradorId);
  const usados = new Set(linhas.map((l) => l.colaboradorId));
  const set = (i: number, p: Partial<{ colaboradorId: string; pct: string }>) => setLinhas((x) => x.map((l, k) => (k === i ? { ...l, ...p } : l)));

  async function enviar(itens: { colaboradorId: string; pct: number }[]) {
    setBusy(true); setErro("");
    try {
      await rhApi("/api/rh/comissoes/atribuicao", { body: { origem: venda!.origem, refId: venda!.refId, itens } });
      onSaved();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="md" title={t("comissoes.atribuicao.titulo")} closeDisabled={busy}>
      <div className="space-y-4">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{venda.descricao}</p>
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("comissoes.atribuicao.nota")}</p>
        {colaboradores.length === 0 && <p className="text-sm font-medium" style={{ color: "var(--warn)" }}>{t("comissoes.atribuicao.semComissionados")}</p>}
        {linhas.map((l, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_110px_auto]">
            <Field label={i === 0 ? t("comissoes.atribuicao.vendedor") : undefined}>
              <select className={selectClass} style={selectStyle} aria-label={t("comissoes.atribuicao.vendedor")} value={l.colaboradorId} onChange={(e) => set(i, { colaboradorId: e.target.value })}>
                <option value="">{t("alocacao.escolha")}</option>
                {colaboradores.map((c) => <option key={c.id} value={c.id} disabled={usados.has(c.id) && l.colaboradorId !== c.id}>{c.nome}</option>)}
              </select>
            </Field>
            <Field label={i === 0 ? t("alocacao.percentual") : undefined}>
              <Input inputMode="decimal" aria-label={t("alocacao.percentual")} value={l.pct} onChange={(e) => set(i, { pct: e.target.value })} />
            </Field>
            <Button size="sm" variant="ghost" icon={Trash2} aria-label={t("alocacao.remover")} disabled={linhas.length === 1} onClick={() => setLinhas((x) => x.filter((_, k) => k !== i))} />
          </div>
        ))}
        <div className="flex items-center justify-between">
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => setLinhas((x) => [...x, { colaboradorId: "", pct: "" }])}>{t("comissoes.atribuicao.adicionar")}</Button>
          <Pill tone={Math.abs(soma - 100) <= 0.01 ? "pos" : "neg"} dot>{t("alocacao.soma", { valor: soma })}</Pill>
        </div>
        {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
        <div className="flex flex-wrap justify-between gap-2">
          {venda.atribuicao ? <Button variant="danger" disabled={busy} onClick={() => enviar([])}>{t("comissoes.atribuicao.remover")}</Button> : <span />}
          <span className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>{t("form.cancelar")}</Button>
            <Button loading={busy} disabled={busy || !fecha} onClick={() => enviar(linhas.map((l) => ({ colaboradorId: l.colaboradorId, pct: Number(l.pct.replace(",", ".")) })))}>{t("form.salvar")}</Button>
          </span>
        </div>
      </div>
    </Modal>
  );
}

// ── Estorno / cancelamento / devolução ──────────────────────────────────────

function EstornoModal({ venda, estornos, onClose, onSaved }: {
  venda: VendaLinha | null; estornos: EstornoLinha[]; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations("rh");
  const locale = useLocale();
  const [tipo, setTipo] = useState("devolucao");
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!venda) return;
    setErro(""); setTipo("devolucao"); setData(hojeISO()); setMotivo("");
    setValor(Math.max(0, venda.valor - venda.estornado).toFixed(2).replace(".", ","));
  }, [venda]);

  if (!venda) return null;
  const restante = Math.round((venda.valor - venda.estornado) * 100) / 100;

  async function chamar(body: Record<string, unknown>) {
    setBusy(true); setErro("");
    try {
      await rhApi("/api/rh/comissoes/estornos", { body });
      onSaved();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="md" title={t("comissoes.estorno.titulo")} closeDisabled={busy}>
      <div className="space-y-4">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{venda.descricao} · {formatMoney(venda.valor, locale)}</p>
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("comissoes.estorno.nota")}</p>

        {estornos.length > 0 && (
          <ul className="divide-y rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}>
            {estornos.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2" style={{ borderColor: "var(--border)" }}>
                <span>
                  {t(`comissoes.estorno.tipos.${e.tipo}`)} · {fmtData(e.data, locale)} · <strong>{formatMoney(e.valor, locale)}</strong>
                  {e.motivo && <span className="block text-xs" style={{ color: "var(--text-subtle)" }}>{e.motivo}</span>}
                </span>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => chamar({ acao: "desfazer", id: e.id })}>{t("comissoes.estorno.desfazer")}</Button>
              </li>
            ))}
          </ul>
        )}

        {restante > 0 && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("comissoes.estorno.tipo")}>
                <select className={selectClass} style={selectStyle} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {(["devolucao", "cancelamento", "estorno"] as const).map((k) => <option key={k} value={k}>{t(`comissoes.estorno.tipos.${k}`)}</option>)}
                </select>
              </Field>
              <Field label={t("comissoes.estorno.data")}><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></Field>
              <Field label={t("comissoes.estorno.valor")} hint={t("comissoes.estorno.restante", { valor: formatMoney(restante, locale) })}>
                <MoneyInput value={valor} onValueChange={setValor} />
              </Field>
              <Field label={t("comissoes.estorno.motivo")}><Input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} /></Field>
            </div>
            {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose} disabled={busy}>{t("form.cancelar")}</Button>
              <Button loading={busy} disabled={busy || !valor} onClick={() => chamar({ vendaKey: venda.key, tipo, data, valor: parseAmount(valor), motivo })}>{t("comissoes.estorno.registrar")}</Button>
            </div>
          </>
        )}
        {restante <= 0 && erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      </div>
    </Modal>
  );
}
