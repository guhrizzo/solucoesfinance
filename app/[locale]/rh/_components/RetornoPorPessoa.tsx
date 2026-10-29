"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Trophy } from "lucide-react";
import { Card, EmptyState, Field, KpiTile, Sensitive, Table, type Column } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { rhApi, selectClass, selectStyle } from "./shared";

// Relatório "Retorno por pessoa" — mesmo desenho do relatório por produto
// (filtros no topo, KPIs, ranking em barras, tabela). Os números vêm de
// /api/rh/retorno (cálculo em lib/rh/retorno.ts). A margem de contribuição é o
// indicador principal; o resultado líquido atribuído é complementar.

type Faixa = "negativa" | "ate10" | "ate20" | "ate30" | "acima30" | "semCusto";
const FAIXAS: Faixa[] = ["negativa", "ate10", "ate20", "ate30", "acima30", "semCusto"];

interface Linha {
  colaboradorId: string;
  nome: string;
  receita: number;
  vendas: number;
  ticket: number | null;
  margemBruta: number;
  margemPct: number | null;
  comissao: number;
  contribuicao: number;
  custoAlocado: number | null;
  resultado: number | null;
  retornoComissao: number | null;
  semCusto: number;
  desconto: number;
  descontoPct: number | null;
  mix: Record<Faixa, { receita: number; vendas: number }>;
}

interface Resposta {
  selfOnly: boolean;
  linhas: Linha[];
  totais: Omit<Linha, "colaboradorId" | "nome">;
  opcoes: { colaboradores: { id: string; nome: string }[]; centros: { id: string; nome: string }[]; produtos: { sku: string; nome: string }[] };
}

const mesAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const somaMes = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

function Barras({ rows }: { rows: { key: string; label: string; value: number; display: React.ReactNode }[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0) || 1;
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate font-medium" style={{ color: "var(--text)" }} title={r.label}>{r.label}</span>
            <span className="mono shrink-0" style={{ color: r.value < 0 ? "var(--neg)" : "var(--text-muted)" }}>{r.display}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full" style={{ background: "var(--sunken)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, (Math.abs(r.value) / max) * 100)}%`, background: r.value < 0 ? "var(--neg)" : "var(--brand)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function RetornoPorPessoa({ hideValues = false }: { hideValues?: boolean }) {
  const t = useTranslations("rh.retorno");
  const locale = useLocale();
  const [from, setFrom] = useState(mesAtual());
  const [to, setTo] = useState(mesAtual());
  const [centroId, setCentroId] = useState("");
  const [colaboradorId, setColaboradorId] = useState("");
  const [sku, setSku] = useState("");
  const [data, setData] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({ from, to });
    if (centroId) q.set("centroId", centroId);
    if (colaboradorId) q.set("colaboradorId", colaboradorId);
    if (sku) q.set("sku", sku);
    rhApi<Resposta>(`/api/rh/retorno?${q}`)
      .then((d) => { if (!cancelled) { setData(d); setErro(""); } })
      .catch((e) => { if (!cancelled) { setErro(e instanceof Error ? e.message : t("erro")); setData(null); } });
    return () => { cancelled = true; };
  }, [from, to, centroId, colaboradorId, sku, t]);

  const money = (n: number) => <Sensitive hidden={hideValues}>{formatMoney(n, locale)}</Sensitive>;
  const pct = (n: number | null, d = 1) => (n === null ? "—" : `${new Intl.NumberFormat(locale, { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)}%`);
  const vezes = (n: number | null) => (n === null ? "—" : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n)}×`);
  const self = !!data?.selfOnly;

  const presets: { id: string; de: string; ate: string }[] = useMemo(() => {
    const m = mesAtual();
    return [
      { id: "mes", de: m, ate: m },
      { id: "mesAnterior", de: somaMes(m, -1), ate: somaMes(m, -1) },
      { id: "trimestre", de: somaMes(m, -2), ate: m },
      { id: "ano", de: `${m.slice(0, 4)}-01`, ate: m },
    ];
  }, []);

  const cols: Column[] = [
    { key: "nome", header: t("cols.colaborador") },
    { key: "receita", header: t("cols.receita"), align: "right" },
    { key: "vendas", header: t("cols.vendas"), align: "right" },
    { key: "ticket", header: t("cols.ticket"), align: "right" },
    { key: "margemBruta", header: t("cols.margemBruta"), align: "right" },
    { key: "comissao", header: t("cols.comissao"), align: "right" },
    { key: "contribuicao", header: t("cols.contribuicao"), align: "right" },
    ...(self ? [] : [
      { key: "custo", header: t("cols.custo"), align: "right" as const },
      { key: "resultado", header: t("cols.resultado"), align: "right" as const },
    ]),
    { key: "retorno", header: t("cols.retorno"), align: "right" },
    { key: "desconto", header: t("cols.desconto"), align: "right" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex gap-1" role="group" aria-label={t("filtros.periodo")}>
          {presets.map((p) => {
            const ativo = from === p.de && to === p.ate;
            return (
              <button
                key={p.id}
                onClick={() => { setFrom(p.de); setTo(p.ate); }}
                aria-pressed={ativo}
                className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: ativo ? "var(--brand)" : "var(--sunken)", color: ativo ? "var(--brand-on)" : "var(--text-muted)" }}
              >
                {t(`presets.${p.id}`)}
              </button>
            );
          })}
        </div>
        <Field label={t("filtros.de")}><input type="month" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className={selectClass} style={selectStyle} /></Field>
        <Field label={t("filtros.ate")}><input type="month" value={to} min={from} max={mesAtual()} onChange={(e) => e.target.value && setTo(e.target.value)} className={selectClass} style={selectStyle} /></Field>
        {!self && (
          <>
            <Field label={t("filtros.colaborador")}>
              <select className={selectClass} style={selectStyle} value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)}>
                <option value="">{t("filtros.todos")}</option>
                {data?.opcoes.colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
            <Field label={t("filtros.centro")}>
              <select className={selectClass} style={selectStyle} value={centroId} onChange={(e) => setCentroId(e.target.value)}>
                <option value="">{t("filtros.todos")}</option>
                {data?.opcoes.centros.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </Field>
          </>
        )}
        <Field label={t("filtros.produto")}>
          <select className={selectClass} style={selectStyle} value={sku} onChange={(e) => setSku(e.target.value)}>
            <option value="">{t("filtros.todos")}</option>
            {data?.opcoes.produtos.map((p) => <option key={p.sku} value={p.sku}>{p.sku}</option>)}
          </select>
        </Field>
      </div>

      {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      {!data && !erro && <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{t("carregando")}</p>}

      {data && (
        <>
          <div className={`grid gap-3 sm:grid-cols-2 ${self ? "lg:grid-cols-4" : "lg:grid-cols-5"}`}>
            <KpiTile label={t("kpi.receita")} value={money(data.totais.receita)} />
            <KpiTile label={t("kpi.contribuicao")} value={money(data.totais.contribuicao)} valueTone={data.totais.contribuicao >= 0 ? "pos" : "neg"} delta={t("kpi.principal")} />
            <KpiTile label={t("kpi.comissao")} value={money(data.totais.comissao)} />
            {!self && <KpiTile label={t("kpi.resultado")} value={data.totais.resultado === null ? "—" : money(data.totais.resultado)} valueTone={(data.totais.resultado ?? 0) >= 0 ? "pos" : "neg"} delta={t("kpi.complementar")} />}
            <KpiTile label={t("kpi.retorno")} value={vezes(data.totais.retornoComissao)} />
          </div>

          {data.totais.semCusto > 0 && <p role="status" className="text-sm" style={{ color: "var(--warn)" }}>{t("semCusto", { count: data.totais.semCusto })}</p>}

          <Table
            columns={cols}
            rows={data.linhas}
            rowKey={(r) => r.colaboradorId}
            empty={<EmptyState icon={Trophy} title={t("vazioTitulo")} description={t("vazioDesc")} />}
            renderCell={(r, key) => {
              switch (key) {
                case "nome": return <span className="font-semibold">{r.nome}</span>;
                case "receita": return money(r.receita);
                case "vendas": return String(r.vendas);
                case "ticket": return r.ticket === null ? "—" : money(r.ticket);
                case "margemBruta": return <span>{money(r.margemBruta)}<span className="block text-xs" style={{ color: "var(--text-subtle)" }}>{pct(r.margemPct)}</span></span>;
                case "comissao": return money(r.comissao);
                case "contribuicao": return <strong style={{ color: r.contribuicao < 0 ? "var(--neg)" : undefined }}>{money(r.contribuicao)}</strong>;
                case "custo": return r.custoAlocado === null ? "—" : money(r.custoAlocado);
                case "resultado": return r.resultado === null ? "—" : <span style={{ color: r.resultado < 0 ? "var(--neg)" : undefined }}>{money(r.resultado)}</span>;
                case "retorno": return vezes(r.retornoComissao);
                default: return <span>{money(r.desconto)}<span className="block text-xs" style={{ color: "var(--text-subtle)" }}>{pct(r.descontoPct)}</span></span>;
              }
            }}
          />

          {data.linhas.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="space-y-3">
                <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>{t("ranking")}</h3>
                <Barras rows={data.linhas.map((l) => ({ key: l.colaboradorId, label: l.nome, value: l.contribuicao, display: money(l.contribuicao) }))} />
              </Card>
              <Card className="space-y-3">
                <h3 className="text-sm font-bold" style={{ color: "var(--text)" }}>{t("mix.titulo")}</h3>
                <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("mix.nota")}</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: "var(--text-subtle)" }}>
                        <th className="py-1 pr-2 text-left font-semibold">{t("cols.colaborador")}</th>
                        {FAIXAS.map((f) => <th key={f} className="px-1 py-1 text-right font-semibold">{t(`mix.faixas.${f}`)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {data.linhas.map((l) => {
                        const total = FAIXAS.reduce((s, f) => s + l.mix[f].receita, 0);
                        return (
                          <tr key={l.colaboradorId} className="border-t" style={{ borderColor: "var(--border)" }}>
                            <td className="py-1.5 pr-2 font-medium" style={{ color: "var(--text)" }}>{l.nome}</td>
                            {FAIXAS.map((f) => (
                              <td key={f} className="mono px-1 py-1.5 text-right" style={{ color: f === "negativa" && l.mix[f].receita > 0 ? "var(--neg)" : "var(--text-muted)" }}>
                                {total > 0 && l.mix[f].receita > 0 ? pct((l.mix[f].receita / total) * 100, 0) : "—"}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          <details className="text-xs" style={{ color: "var(--text-muted)" }}>
            <summary className="cursor-pointer font-semibold">{t("definicoes.titulo")}</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {(["receita", "margem", "comissao", "contribuicao", "custo", "resultado", "retorno", "desconto", "filtros"] as const).map((k) => <li key={k}>{t(`definicoes.${k}`)}</li>)}
              {self && <li>{t("definicoes.proprio")}</li>}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
