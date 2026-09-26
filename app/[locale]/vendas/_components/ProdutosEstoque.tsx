"use client";

import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Boxes, DollarSign, AlertTriangle, Package } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Pill, Table } from "@/app/components/ui";
import { toBRL } from "./shared";

interface TopProduto {
  sku: string;
  name: string;
  qty: number;
  receita: number;
  estoque: number | null;
  minQuantity: number;
}

const card = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)" } as const;

/** Ranking de produtos no período × estoque atual. */
export function TopProdutos({ rows }: { rows: TopProduto[] }) {
  const t = useTranslations("vendas.topProducts");
  const locale = useLocale();

  return (
    <section className="min-w-0 p-4" style={card}>
      <header className="mb-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{t("title")}</h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-subtle)" }}>{t("subtitle")}</p>
      </header>
      <Table
        columns={[
          { key: "produto", header: t("colProduct") },
          { key: "qty", header: t("colQty"), align: "right" },
          { key: "receita", header: t("colRevenue"), align: "right" },
          { key: "estoque", header: t("colStock"), align: "right" },
        ]}
        rows={rows}
        rowKey={(r) => r.sku}
        empty={<p className="py-8 text-center text-xs" style={{ color: "var(--text-subtle)" }}>{t("empty")}</p>}
        renderCell={(p, key) => {
          if (key === "produto") return (
            <div className="min-w-0">
              <div className="truncate font-medium">{p.name}</div>
              <div className="mono text-[11px]" style={{ color: "var(--text-subtle)" }}>{p.sku}</div>
            </div>
          );
          if (key === "qty") return <span className="mono">{p.qty}</span>;
          if (key === "receita") return <span className="mono font-medium">{toBRL(p.receita, locale)}</span>;
          if (p.estoque === null) return <span style={{ color: "var(--text-subtle)" }}>—</span>;
          const ruptura = p.estoque <= 0;
          const baixo = !ruptura && p.estoque <= p.minQuantity;
          return (
            <Pill tone={ruptura ? "neg" : baixo ? "warn" : "muted"}>
              {ruptura ? t("noStock") : t("unitsShort", { count: p.estoque })}
            </Pill>
          );
        }}
      />
    </section>
  );
}

/** Resumo do estoque central com atalho pra tela de Estoque. */
export function ResumoEstoque({ r }: { r: { unidades: number; baixo: number; zerado: number; valor: number; itens: number } }) {
  const t = useTranslations("vendas.stockControl");
  const locale = useLocale();

  const linhas = [
    { icon: Boxes, label: t("units"), value: `${r.unidades}`, tone: undefined },
    { icon: DollarSign, label: t("immobilized"), value: toBRL(r.valor, locale), tone: undefined },
    { icon: AlertTriangle, label: t("lowStock"), value: `${r.baixo}`, tone: r.baixo > 0 ? "var(--warn)" : undefined },
    { icon: Package, label: t("noStock"), value: `${r.zerado}`, tone: r.zerado > 0 ? "var(--neg)" : undefined },
  ];

  return (
    <section className="flex flex-col p-4" style={card}>
      <header className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{t("title")}</h2>
        <Link href="/estoque" className="flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: "var(--brand)" }}>
          {t("manage")} <ArrowRight size={12} />
        </Link>
      </header>
      <dl className="flex-1">
        {linhas.map((l) => (
          <div key={l.label} className="flex items-center justify-between py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <dt className="flex items-center gap-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
              <l.icon size={14} style={{ color: "var(--text-subtle)" }} /> {l.label}
            </dt>
            <dd className="mono text-[13px] font-medium" style={{ color: l.tone ?? "var(--text)" }}>{l.value}</dd>
          </div>
        ))}
      </dl>
      <p className="pt-3 text-[11px] leading-relaxed" style={{ color: "var(--text-subtle)" }}>
        {t("footer", { count: r.itens })}
      </p>
    </section>
  );
}
