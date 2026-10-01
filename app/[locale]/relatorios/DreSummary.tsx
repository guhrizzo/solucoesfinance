"use client";

// Resumo do DRE em linguagem simples (análise vertical): quanto cada linha
// pesa sobre a receita do período, em texto + barra de composição.

import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@/lib/format";
import { categoryLabel } from "@/lib/cashflowCategories";

interface Cat { name: string; total: number }
interface DreSummaryProps {
  receita: number;
  cmv: number;
  despesas: number;
  impostos: number;
  lucroLiquido: number;
  cmvCats: Cat[];
  despesasCats: Cat[];
  impostosCats: Cat[];
}

export function DreSummary(p: DreSummaryProps) {
  const t = useTranslations("relatorios.dre.summary");
  const tCat = useTranslations("categories");
  const locale = useLocale();
  const pct = (v: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(v);

  if (p.receita <= 0) {
    return <p className="text-xs leading-relaxed" style={{ color: "var(--db-text-3)" }}>{t("noRevenue")}</p>;
  }

  const lines = [
    { key: "cmv", label: t("cmv"), value: p.cmv, cats: p.cmvCats, color: "var(--warn)" },
    { key: "despesas", label: t("opExpenses"), value: p.despesas, cats: p.despesasCats, color: "var(--neg)" },
    { key: "impostos", label: t("taxes"), value: p.impostos, cats: p.impostosCats, color: "var(--brand-400)" },
  ];
  const per100 = (v: number) => formatMoney((v / p.receita) * 100, locale);
  const share = (v: number) => (v / p.receita) * 100;
  const lucro = p.lucroLiquido;

  // barra: base = receita; com prejuízo, base = total de saídas (aí não há fatia de lucro)
  const custos = p.cmv + p.despesas + p.impostos;
  const base = Math.max(p.receita, custos);
  const segs = [
    ...lines.map((l) => ({ key: l.key, label: l.label, value: l.value, color: l.color })),
    ...(lucro > 0 ? [{ key: "lucro", label: t("profit"), value: lucro, color: "var(--pos)" }] : []),
  ].filter((s) => s.value > 0);

  const biggest = [...lines].sort((a, b) => b.value - a.value)[0];
  const topCat = biggest.cats[0];

  return (
    <div className="space-y-2.5">
      <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--db-text-2)" }}>{t("title")}</p>

      <p className="text-xs leading-relaxed" style={{ color: "var(--db-text-3)" }}>
        {t("per100", {
          base: formatMoney(100, locale),
          cmv: per100(p.cmv),
          despesas: per100(p.despesas),
          impostos: per100(p.impostos),
        })}{" "}
        {lucro >= 0
          ? t("resultProfit", { value: per100(lucro) })
          : t("resultLoss", { value: per100(-lucro), pct: pct(share(custos)), base100: formatMoney(100, locale) })}
      </p>

      {/* barra de composição: fatias proporcionais ao peso sobre a receita */}
      <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--db-border)" }} role="img"
        aria-label={segs.map((s) => `${s.label} ${pct(share(s.value))}%`).join(", ")}>
        {segs.map((s) => (
          <div key={s.key} style={{ width: `${(s.value / base) * 100}%`, background: s.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--db-text-3)" }}>
        {segs.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label} <b style={{ color: "var(--db-text-2)" }}>{pct(share(s.value))}%</b>
          </span>
        ))}
      </div>

      {biggest.value > 0 && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--db-text-3)" }}>
          {topCat
            ? t("biggest", { line: biggest.label, pct: pct(share(biggest.value)), cat: categoryLabel(topCat.name, tCat), catPct: pct((topCat.total / biggest.value) * 100) })
            : t("biggestNoCat", { line: biggest.label, pct: pct(share(biggest.value)) })}
        </p>
      )}
    </div>
  );
}
