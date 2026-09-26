"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Download, Search, ShoppingCart } from "lucide-react";
import { Button, EmptyState, Table } from "@/app/components/ui";
import { CANAL_INFO, nomeDaVenda, toBRL, type Canal, type CashflowTx } from "./shared";

type SortKey = "date" | "qty" | "total";
const PAGE_SIZE = 20;

/** CSV com ";" e BOM — abre direto no Excel pt-BR sem assistente de importação. */
function baixarCsv(nome: string, linhas: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + linhas.map((l) => l.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Lista de vendas do período no estilo "List Report" do SAP: barra de
 * ferramentas (contagem, busca, exportar), colunas ordenáveis e paginação.
 */
export function SalesList({ vendas, mes }: { vendas: CashflowTx[]; mes: string }) {
  const t = useTranslations("vendas.salesList");
  const tCh = useTranslations("vendas.channels");
  const locale = useLocale();
  const [busca, setBusca] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [pageRaw, setPage] = useState(0);

  const canalLabel = (c: Canal) => (c === "manual" ? tCh("manual") : CANAL_INFO[c].label);
  const unit = (v: CashflowTx) => v.saleUnitPrice || (v.amount || 0) / (v.saleQty || 1);

  const linhas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtradas = q
      ? vendas.filter((v) =>
          [nomeDaVenda(v.description), v.saleSku, v.orderId].some((s) => (s || "").toLowerCase().includes(q)),
        )
      : vendas;
    const val = (v: CashflowTx) =>
      sort.key === "qty" ? v.saleQty || 1 : sort.key === "total" ? v.amount || 0 : `${v.date}|${v.createdAt}`;
    return [...filtradas].sort((a, b) => {
      const x = val(a), y = val(b);
      const r = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === "asc" ? r : -r;
    });
  }, [vendas, busca, sort]);

  const paginas = Math.max(1, Math.ceil(linhas.length / PAGE_SIZE));
  // Busca/ordenação voltam pra 1ª página nos handlers; se o filtro da página
  // encolher a lista, a página atual é só limitada à última existente.
  const page = Math.min(pageRaw, paginas - 1);
  const visiveis = linhas.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalFiltrado = linhas.reduce((s, v) => s + (v.amount || 0), 0);

  const header = (key: SortKey, text: string) => {
    const ativo = sort.key === key;
    const Icon = sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => { setSort({ key, dir: ativo && sort.dir === "desc" ? "asc" : "desc" }); setPage(0); }}
        className="inline-flex cursor-pointer items-center gap-1 uppercase tracking-wider"
        style={{ color: ativo ? "var(--text)" : "inherit" }}
        aria-label={t("sortBy", { col: text })}
      >
        {text}
        {ativo && <Icon size={11} />}
      </button>
    );
  };

  const exportar = () => {
    baixarCsv(`vendas-${mes}.csv`, [
      [t("colDate"), t("colChannel"), t("colProduct"), "SKU", t("colOrder"), t("colQty"), t("colUnit"), t("colTotal")],
      ...linhas.map((v) => [
        v.date,
        canalLabel((v.saleChannel || "manual") as Canal),
        nomeDaVenda(v.description),
        v.saleSku || "",
        v.orderId || "",
        v.saleQty || 1,
        unit(v).toFixed(2).replace(".", ","),
        (v.amount || 0).toFixed(2).replace(".", ","),
      ]),
    ]);
  };

  return (
    <section style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)" }}>
      <header className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>
          {t("title")} <span className="mono font-normal" style={{ color: "var(--text-subtle)" }}>({linhas.length})</span>
        </h2>
        {linhas.length > 0 && (
          <span className="mono text-xs" style={{ color: "var(--text-subtle)" }}>{toBRL(totalFiltrado, locale)}</span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="relative flex items-center">
            <span className="sr-only">{t("search")}</span>
            <Search size={14} className="pointer-events-none absolute left-2.5" style={{ color: "var(--text-subtle)" }} />
            <input
              type="search"
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPage(0); }}
              placeholder={t("searchPlaceholder")}
              className="h-8 w-56 rounded-lg pl-8 pr-2.5 text-[13px] outline-none"
              style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
            />
          </label>
          <Button variant="secondary" size="sm" icon={Download} onClick={exportar} disabled={linhas.length === 0}>
            {t("export")}
          </Button>
        </div>
      </header>

      <div className="px-1 pt-2">
        <Table
          columns={[
            { key: "date", header: header("date", t("colDate")), width: "96px" },
            { key: "canal", header: t("colChannel"), width: "130px" },
            { key: "produto", header: t("colProduct") },
            { key: "pedido", header: t("colOrder") },
            { key: "qty", header: header("qty", t("colQty")), align: "right", width: "64px" },
            { key: "unit", header: t("colUnit"), align: "right" },
            { key: "total", header: header("total", t("colTotal")), align: "right" },
          ]}
          rows={visiveis}
          rowKey={(v) => v.id}
          empty={
            <div className="p-3">
              <EmptyState
                icon={ShoppingCart}
                title={busca ? t("noResults") : t("empty")}
                description={busca ? undefined : t("emptyHint")}
              />
            </div>
          }
          renderCell={(v, key) => {
            const canal = (v.saleChannel || "manual") as Canal;
            switch (key) {
              case "date":
                return <span className="mono" style={{ color: "var(--text-muted)" }}>{new Date(v.date + "T12:00:00").toLocaleDateString(locale)}</span>;
              case "canal":
                return (
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <span className="h-2 w-2 rounded-sm" style={{ background: CANAL_INFO[canal].solid }} />
                    {canalLabel(canal)}
                  </span>
                );
              case "produto":
                return (
                  <div className="min-w-0">
                    <div className="font-medium">{nomeDaVenda(v.description)}</div>
                    {v.saleSku && <div className="mono text-[11px]" style={{ color: "var(--text-subtle)" }}>{v.saleSku}</div>}
                  </div>
                );
              case "pedido":
                return (
                  <span className="mono block max-w-[160px] truncate text-[12px]" style={{ color: "var(--text-subtle)" }} title={v.orderId}>
                    {v.orderId || "—"}
                  </span>
                );
              case "qty":
                return <span className="mono">{v.saleQty || 1}</span>;
              case "unit":
                return <span className="mono" style={{ color: "var(--text-muted)" }}>{toBRL(unit(v), locale)}</span>;
              default:
                return <span className="mono font-medium">{toBRL(v.amount || 0, locale)}</span>;
            }
          }}
        />
      </div>

      {paginas > 1 && (
        <footer className="flex items-center justify-between px-4 py-2.5 text-xs" style={{ color: "var(--text-subtle)" }}>
          <span>
            {t("pageInfo", {
              from: page * PAGE_SIZE + 1,
              to: Math.min(linhas.length, (page + 1) * PAGE_SIZE),
              total: linhas.length,
            })}
          </span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={() => setPage(page - 1)} disabled={page === 0} aria-label={t("prevPage")} />
            <span className="mono px-1">{page + 1}/{paginas}</span>
            <Button variant="ghost" size="sm" icon={ChevronRight} onClick={() => setPage(page + 1)} disabled={page >= paginas - 1} aria-label={t("nextPage")} />
          </div>
        </footer>
      )}
    </section>
  );
}
