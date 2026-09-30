"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileText, Lock, Printer } from "lucide-react";
import { Button, Card, MoneyInput, parseAmount } from "@/app/components/ui";
import { formatDateTime, formatMoney, formatNumber } from "@/lib/format";
import { UNIDADES, r2, r3, type Caixa, type PdvItem, type PdvVenda, type Unidade } from "@/lib/pdv";
import type { ProdutoEstoque } from "../../_components/shared";
import { PdvHeader } from "./PdvHeader";
import { PagamentoModal } from "./PagamentoModal";
import { ComprovanteModal } from "./ComprovanteModal";
import { FecharCaixaModal } from "./FecharCaixaModal";
import { formaLabel, imprimirComprovante, imprimirRelatorioCaixa } from "./print";

type ItemCarrinho = PdvItem & { key: string };

const fmtPreco = (n: number) => (Number(n) || 0).toFixed(2).replace(".", ",");

/** Terminal de venda: itens → pagamento → comprovante; e o fechamento do caixa. */
export function PdvTerminal({
  caixa, vendas, produtos, empresa, authUid, proximoNumero, onToast, onClosed,
}: {
  caixa: Caixa;
  vendas: PdvVenda[];
  produtos: ProdutoEstoque[];
  empresa: string;
  authUid: string;
  proximoNumero: number;
  onToast: (msg: string, type?: "success" | "error") => void;
  onClosed: (caixaId: string) => void;
}) {
  const t = useTranslations("vendas.pdv");
  const locale = useLocale();
  const money = (n: number) => formatMoney(n, locale);
  const qtyFmt = (n: number) => formatNumber(n, locale, { maximumFractionDigits: 3 });

  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [desc, setDesc] = useState("");
  const [descSku, setDescSku] = useState("");
  const [qtd, setQtd] = useState("1");
  const [unid, setUnid] = useState<Unidade>("UN");
  const [preco, setPreco] = useState("");
  const [aviso, setAviso] = useState("");

  const [pagando, setPagando] = useState(false);
  const [comprovante, setComprovante] = useState<PdvVenda | null>(null);
  const [fechando, setFechando] = useState(false);

  const buscaRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLInputElement>(null);
  const precoRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const buscaId = useId();
  const descId = useId();
  const qtdId = useId();
  const unidId = useId();
  const precoId = useId();

  const total = useMemo(() => r2(itens.reduce((s, i) => s + i.subtotal, 0)), [itens]);
  const destaque = itens.find((i) => i.key === selecionado) ?? itens[itens.length - 1] ?? null;

  // "Nome · SKU" (sugestão da lista), o SKU puro ou o nome exato.
  const acharProduto = (texto: string): ProdutoEstoque | null => {
    const s = texto.trim();
    if (!s) return null;
    const up = s.toUpperCase();
    const low = s.toLowerCase();
    return produtos.find((p) => `${p.name} · ${p.sku}` === s)
      ?? produtos.find((p) => p.sku.toUpperCase() === up)
      ?? produtos.find((p) => (p.name || "").trim().toLowerCase() === low)
      ?? null;
  };

  function adicionar(item: Omit<PdvItem, "subtotal">) {
    const quantidade = item.sku ? Math.max(1, Math.round(item.quantidade)) : r3(item.quantidade);
    if (!item.descricao.trim() || quantidade <= 0) { setAviso(t("terminal.invalidItem")); return false; }
    const precoUnitario = r2(item.precoUnitario);
    if (item.sku) {
      const p = produtos.find((x) => x.sku === item.sku);
      const jaNoCarrinho = itens.filter((i) => i.sku === item.sku).reduce((s, i) => s + i.quantidade, 0);
      if (p && jaNoCarrinho + quantidade > (p.quantity || 0)) {
        setAviso(t("terminal.lowStock", { name: p.name || p.sku, available: p.quantity || 0 }));
      } else {
        setAviso("");
      }
    } else {
      setAviso("");
    }
    const novo: ItemCarrinho = {
      ...item,
      quantidade,
      precoUnitario,
      subtotal: r2(quantidade * precoUnitario),
      key: (crypto as Crypto).randomUUID(),
    };
    setItens((l) => [...l, novo]);
    setSelecionado(null);
    return true;
  }

  // Campo de cima: Enter adiciona o produto do estoque (1 un, preço de cadastro);
  // texto que não é do estoque desce pro formulário de item avulso.
  function onBuscaEnter() {
    const p = acharProduto(busca);
    if (p) {
      adicionar({ sku: p.sku, descricao: p.name || p.sku, quantidade: 1, unidade: "UN", precoUnitario: Number(p.price) || 0 });
      setBusca("");
      return;
    }
    if (!busca.trim()) return;
    setDesc(busca.trim());
    setDescSku("");
    setBusca("");
    setTimeout(() => precoRef.current?.focus(), 0);
  }

  function onDescChange(v: string) {
    const p = acharProduto(v);
    if (p) {
      setDesc(p.name || p.sku);
      setDescSku(p.sku);
      setUnid("UN");
      setPreco(fmtPreco(p.price));
    } else {
      setDesc(v);
      setDescSku("");
    }
  }

  function onAdicionarClick() {
    const ok = adicionar({
      sku: descSku,
      descricao: desc.trim(),
      quantidade: parseAmount(qtd),
      unidade: descSku ? "UN" : unid,
      precoUnitario: parseAmount(preco),
    });
    if (!ok) return;
    setDesc(""); setDescSku(""); setQtd("1"); setUnid("UN"); setPreco("");
    buscaRef.current?.focus();
  }

  function cancelarItem() {
    const alvo = selecionado ?? itens[itens.length - 1]?.key;
    if (!alvo) return;
    setItens((l) => l.filter((i) => i.key !== alvo));
    setSelecionado(null);
    setAviso("");
  }

  function limparVenda() {
    if (itens.length > 0 && !window.confirm(t("terminal.confirmClear"))) return;
    setItens([]); setSelecionado(null); setAviso("");
  }

  function finalizar() {
    if (itens.length === 0 || total <= 0) { setAviso(t("terminal.emptyCart")); return; }
    setPagando(true);
  }

  // Atalhos: F2 = buscar produto, F4 = finalizar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pagando || comprovante || fechando) return;
      if (e.key === "F2") { e.preventDefault(); buscaRef.current?.focus(); }
      if (e.key === "F4") { e.preventDefault(); finalizar(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onVendaConcluida(v: PdvVenda) {
    setPagando(false);
    setItens([]); setSelecionado(null); setAviso("");
    setComprovante(v);
  }

  const imprimirVenda = (v: PdvVenda) => {
    if (!imprimirComprovante(v, empresa, t, locale)) onToast(t("popupBlocked"), "error");
  };

  const statusVenda = pagando ? t("status.paying") : itens.length > 0 ? t("status.open") : t("status.idle");

  const campo = { background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text)" } as const;
  const rotulo = "text-[11px] font-semibold";

  return (
    <>
      <PdvHeader
        operador={caixa.operador}
        acoes={
          <>
            <Button
              variant="secondary"
              icon={FileText}
              onClick={() => { if (!imprimirRelatorioCaixa(caixa, vendas, empresa, t, locale)) onToast(t("popupBlocked"), "error"); }}
            >
              {t("terminal.partialReport")}
            </Button>
            <Button variant="danger" icon={Lock} onClick={() => setFechando(true)}>
              {t("close.cta")}
            </Button>
          </>
        }
      />

      <datalist id={listId}>
        {produtos.map((p) => (
          <option key={p.id} value={`${p.name} · ${p.sku}`}>{t("terminal.stockOption", { qty: p.quantity, price: money(Number(p.price) || 0) })}</option>
        ))}
      </datalist>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* ── Itens ── */}
        <Card padding="none" className="flex min-w-0 flex-col lg:col-span-2">
          <div className="space-y-1 p-4">
            <label htmlFor={buscaId} className={rotulo} style={{ color: "var(--text-muted)" }}>{t("terminal.searchLabel")}</label>
            <input
              id={buscaId}
              ref={buscaRef}
              list={listId}
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onBuscaEnter(); } }}
              placeholder={t("terminal.searchPlaceholder")}
              className="w-full rounded-xl px-3.5 py-3 text-sm outline-none"
              style={campo}
            />
          </div>

          <div className="overflow-x-auto" style={{ borderTop: "1px solid var(--border)" }}>
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider" style={{ background: "var(--sunken)", color: "var(--text-muted)", borderBottom: "2px solid var(--brand)" }}>
                  <th className="px-4 py-2.5">{t("terminal.colSeq")}</th>
                  <th className="px-2 py-2.5">{t("terminal.colDescription")}</th>
                  <th className="px-2 py-2.5 text-right">{t("terminal.colQty")}</th>
                  <th className="px-2 py-2.5 text-right">{t("terminal.colPrice")}</th>
                  <th className="px-4 py-2.5 text-right">{t("terminal.colSubtotal")}</th>
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center" style={{ color: "var(--text-subtle)" }}>
                      {t("terminal.emptyTitle")}
                      <br />
                      <span style={{ color: "var(--text-muted)" }}>{t("terminal.emptyHint")}</span>
                    </td>
                  </tr>
                ) : itens.map((it, i) => {
                  const ativo = it.key === selecionado;
                  return (
                    <tr
                      key={it.key}
                      onClick={() => setSelecionado(ativo ? null : it.key)}
                      aria-selected={ativo}
                      className="cursor-pointer"
                      style={{ background: ativo ? "var(--brand-weak)" : undefined, borderBottom: "1px solid var(--border)" }}
                    >
                      <td className="mono px-4 py-2" style={{ color: "var(--text-subtle)" }}>{String(i + 1).padStart(3, "0")}</td>
                      <td className="px-2 py-2" style={{ color: "var(--text)" }}>
                        {it.descricao}
                        {it.sku && <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-subtle)" }}>{it.sku}</span>}
                      </td>
                      <td className="mono px-2 py-2 text-right" style={{ color: "var(--text)" }}>{qtyFmt(it.quantidade)} {it.unidade}</td>
                      <td className="mono px-2 py-2 text-right" style={{ color: "var(--text)" }}>{money(it.precoUnitario)}</td>
                      <td className="mono px-4 py-2 text-right font-semibold" style={{ color: "var(--text)" }}>{money(it.subtotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-auto space-y-3 p-4" style={{ borderTop: "1px solid var(--border)" }}>
            {aviso && (
              <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--warn-weak)", color: "var(--warn)" }}>{aviso}</p>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_90px_80px_120px_auto] sm:items-end">
              <div className="col-span-2 space-y-1 sm:col-span-1">
                <label htmlFor={descId} className={rotulo} style={{ color: "var(--text-muted)" }}>{t("terminal.description")}</label>
                <input
                  id={descId}
                  ref={descRef}
                  list={listId}
                  value={desc}
                  onChange={(e) => onDescChange(e.target.value)}
                  placeholder={t("terminal.descriptionPlaceholder")}
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={campo}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={qtdId} className={rotulo} style={{ color: "var(--text-muted)" }}>{t("terminal.quantity")}</label>
                <input
                  id={qtdId}
                  inputMode="decimal"
                  value={qtd}
                  onChange={(e) => setQtd(e.target.value)}
                  className="mono w-full rounded-xl px-3 py-2.5 text-sm outline-none"
                  style={campo}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor={unidId} className={rotulo} style={{ color: "var(--text-muted)" }}>{t("terminal.unit")}</label>
                <select
                  id={unidId}
                  value={descSku ? "UN" : unid}
                  disabled={!!descSku}
                  onChange={(e) => setUnid(e.target.value as Unidade)}
                  className="w-full cursor-pointer rounded-xl px-2 py-2.5 text-sm outline-none"
                  style={campo}
                >
                  {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor={precoId} className={rotulo} style={{ color: "var(--text-muted)" }}>{t("terminal.unitPrice")}</label>
                <MoneyInput
                  id={precoId}
                  ref={precoRef}
                  value={preco}
                  onValueChange={setPreco}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdicionarClick(); } }}
                  style={campo}
                />
              </div>
              <Button variant="success" onClick={onAdicionarClick} className="col-span-2 h-[42px] sm:col-span-1">
                {t("terminal.add")}
              </Button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" onClick={cancelarItem} disabled={itens.length === 0}>{t("terminal.cancelItem")}</Button>
              <Button variant="secondary" onClick={limparVenda} disabled={itens.length === 0}>{t("terminal.clearSale")}</Button>
              <Button variant="success" onClick={finalizar} disabled={itens.length === 0}>{t("terminal.finalize")}</Button>
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{t("terminal.shortcuts")}</p>
          </div>
        </Card>

        {/* ── Visor ── */}
        <Card padding="none" className="flex flex-col overflow-hidden">
          {[
            { label: t("display.quantity"), value: destaque ? `${qtyFmt(destaque.quantidade)} ${destaque.unidade}` : `0 UN`, color: "var(--warn)" },
            { label: t("display.unitPrice"), value: money(destaque?.precoUnitario ?? 0), color: "var(--warn)" },
            { label: t("display.value"), value: money(destaque?.subtotal ?? 0), color: "var(--warn)" },
            { label: t("display.items"), value: qtyFmt(itens.length), color: "var(--pos)" },
          ].map((b) => (
            <div key={b.label} className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>{b.label}</div>
              <div className="mono text-2xl font-bold" style={{ color: b.color }}>{b.value}</div>
            </div>
          ))}
          <div className="flex-1 px-5 py-4" style={{ background: "color-mix(in srgb, var(--pos) 8%, transparent)" }}>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>{t("display.total")}</div>
            <div className="mono text-4xl font-bold" style={{ color: "var(--pos)" }}>{money(total)}</div>
          </div>
        </Card>
      </div>

      {/* ── Barra de status ── */}
      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl sm:grid-cols-4" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
        {[
          { label: t("status.operator"), value: caixa.operador, color: "var(--text)" },
          { label: t("status.saleNo"), value: String(proximoNumero), color: "var(--text)" },
          { label: t("status.items"), value: String(itens.length), color: "var(--text)" },
          { label: t("status.status"), value: statusVenda, color: itens.length > 0 || pagando ? "var(--pos)" : "var(--text-muted)" },
        ].map((s, i) => (
          <div key={s.label} className="px-4 py-2.5" style={{ borderLeft: i > 0 ? "1px solid var(--border)" : undefined }}>
            <div className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{s.label}</div>
            <div className="mono truncate text-sm font-bold uppercase" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Vendas deste caixa (relatório do turno) ── */}
      <Card padding="none" className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="font-display text-base font-bold" style={{ color: "var(--text)" }}>
            {t("sales.title", { n: caixa.qtdVendas })}
          </h2>
          <span className="mono text-sm font-bold" style={{ color: "var(--pos)" }}>{money(caixa.totalVendas)}</span>
        </div>
        {vendas.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm" style={{ color: "var(--text-subtle)" }}>{t("sales.empty")}</p>
        ) : (
          <ul>
            {vendas.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="min-w-0 text-sm">
                  <span className="mono font-bold" style={{ color: "var(--text)" }}>#{v.numero}</span>
                  <span className="ml-2" style={{ color: "var(--text-muted)" }}>
                    {formatDateTime(v.createdAt, locale)} · {t("sales.itemsCount", { n: v.itens.length })} · {formaLabel(t, v.forma, v.parcelas)}
                  </span>
                  {!v.lancarNoCaixa && <span className="ml-2 text-[11px]" style={{ color: "var(--warn)" }}>{t("sales.offCashflow")}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="mono text-sm font-bold" style={{ color: "var(--text)" }}>{money(v.total)}</span>
                  <Button size="sm" variant="ghost" icon={Printer} onClick={() => imprimirVenda(v)} aria-label={t("sales.reprint", { n: v.numero })} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <PagamentoModal
        open={pagando}
        onClose={() => setPagando(false)}
        caixaId={caixa.id}
        operador={caixa.operador}
        itens={itens}
        total={total}
        onDone={onVendaConcluida}
        onError={(m) => onToast(m, "error")}
      />

      <ComprovanteModal
        venda={comprovante}
        onPrint={imprimirVenda}
        onClose={() => { setComprovante(null); setTimeout(() => buscaRef.current?.focus(), 0); }}
      />

      <FecharCaixaModal
        open={fechando}
        onClose={() => setFechando(false)}
        caixa={caixa}
        authUid={authUid}
        onClosed={() => { setFechando(false); onClosed(caixa.id); }}
        onToast={onToast}
      />
    </>
  );
}
