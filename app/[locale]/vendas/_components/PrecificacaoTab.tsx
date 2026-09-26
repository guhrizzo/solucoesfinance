"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Calculator } from "lucide-react";
import { toBRL } from "./shared";

// ─── Aba Precificação ─────────────────────────────────────────────────────────
//
// Markup por dentro. O custo do produto e o custo variável (embalagem, frete
// fixo por envio, comissão já convertida em R$…) são valores em reais e somam
// no numerador; impostos e margem desejada são % sobre o preço de venda e
// entram no divisor:
//
//   preço = (custo do produto + custo variável) ÷ (1 − (impostos% + margem%) / 100)
//
// Assim, no preço sugerido: impostos e lucro são exatamente os percentuais
// informados, e o que sobra cobre o custo do produto + o custo variável.

export function PrecificacaoTab() {
  const t = useTranslations("vendas.pricing");
  const locale = useLocale();
  const [custo, setCusto] = useState<number | "">("");
  const [impostos, setImpostos] = useState<number | "">("");
  const [custoVar, setCustoVar] = useState<number | "">("");
  const [margem, setMargem] = useState<number | "">("");

  const calc = useMemo(() => {
    const c = Number(custo) || 0;
    const v = Number(custoVar) || 0;
    const iPct = Number(impostos) || 0;
    const mPct = Number(margem) || 0;

    const custoTotal = c + v;
    const deducoes = (iPct + mPct) / 100;
    const inviavel = deducoes >= 1;
    const preco = custoTotal > 0 && !inviavel ? custoTotal / (1 - deducoes) : 0;

    return {
      c, v, iPct, mPct,
      custoTotal,
      inviavel,
      preco,
      valorImpostos: preco * (iPct / 100),
      lucro: preco * (mPct / 100),
      markup: custoTotal > 0 && preco > 0 ? preco / custoTotal : 0,
    };
  }, [custo, impostos, custoVar, margem]);

  const setNum = (fn: (v: number | "") => void) => (e: React.ChangeEvent<HTMLInputElement>) =>
    fn(e.target.value === "" ? "" : Number(e.target.value));

  const field = (
    label: string, hint: string,
    value: number | "", onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
    suffix: string,
  ) => (
    <div>
      <label className="block text-xs font-bold mb-1" style={{ color: "var(--text)" }}>{label}</label>
      <p className="text-[11px] mb-1.5" style={{ color: "var(--text-subtle)" }}>{hint}</p>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold pointer-events-none" style={{ color: "var(--text-subtle)" }}>
          {suffix === "R$" ? "R$" : ""}
        </span>
        <input
          type="number"
          min="0"
          inputMode="decimal"
          value={value}
          onChange={onChange}
          placeholder="0"
          className={`w-full py-2.5 rounded-lg border outline-none font-mono text-sm ${suffix === "R$" ? "pl-9 pr-3" : "pl-3 pr-9"}`}
          style={{ background: "var(--sunken)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        {suffix === "%" && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold pointer-events-none" style={{ color: "var(--text-subtle)" }}>%</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Entradas */}
      <div className="p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)" }}>
        <div className="flex items-center gap-3 mb-2">
          <Calculator size={22} style={{ color: "var(--brand)" }} />
          <h2 className="font-display text-lg font-bold" style={{ color: "var(--text)" }}>
            {t("title")}
          </h2>
        </div>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          {t("intro")}
        </p>
        <div className="space-y-4">
          {field(t("productCost"), t("productCostHint"), custo, setNum(setCusto), "R$")}
          {field(t("variableCost"), t("variableCostHint"), custoVar, setNum(setCustoVar), "R$")}
          {field(t("taxes"), t("taxesHint"), impostos, setNum(setImpostos), "%")}
          {field(t("margin"), t("marginHint"), margem, setNum(setMargem), "%")}
        </div>
      </div>

      {/* Resultado */}
      <div className="p-6 flex flex-col" style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-card)" }}>
        <h3 className="font-display text-sm font-bold mb-1" style={{ color: "var(--text)" }}>{t("suggestedPrice")}</h3>

        {calc.inviavel ? (
          <div className="flex-1 flex items-center">
            <div className="w-full text-sm font-semibold p-4 rounded-xl" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>
              {t("infeasible")}
            </div>
          </div>
        ) : (
          <>
            <div className="text-4xl md:text-5xl font-extrabold mono my-4" style={{ color: "var(--brand)" }}>
              {toBRL(calc.preco, locale)}
            </div>
            {calc.markup > 0 && (
              <p className="text-[11px] mb-4" style={{ color: "var(--text-subtle)" }}>
                {t.rich("markupNote", { markup: calc.markup.toFixed(2), b: (c) => <span className="font-bold mono">{c}</span> })}
              </p>
            )}

            <div className="space-y-2.5 mt-auto pt-4 text-sm" style={{ borderTop: "1px solid var(--border)" }}>
              <Linha label={t("rowProductCost")} value={toBRL(calc.c, locale)} />
              <Linha label={t("rowVariableCost")} value={toBRL(calc.v, locale)} color="var(--neg)" />
              <Linha label={t("rowTaxes", { pct: calc.iPct || 0 })} value={toBRL(calc.valorImpostos, locale)} color="var(--neg)" />
              <Linha label={t("rowProfit", { pct: calc.mPct || 0 })} value={toBRL(calc.lucro, locale)} color="var(--pos)" bold />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Linha({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : ""}`}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="mono font-semibold" style={{ color: color ?? "var(--text)" }}>{value}</span>
    </div>
  );
}
