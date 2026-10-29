"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Percent } from "lucide-react";
import { EmptyState, KpiTile, Pill, Table, type Column } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { usePeriod } from "@/app/hooks/usePeriod";
import { rhApi } from "./shared";
import { RegrasSection } from "./RegrasSection";
import { VendasSection, type EstornoLinha, type VendaLinha } from "./VendasSection";

interface ResumoLinha {
  colaboradorId: string;
  nome: string;
  regraNome: string | null;
  baseTipo: "receita" | "margem" | null;
  base: number;
  comissao: number;
  ajusteTotal: number;
  total: number;
  semCusto?: string[];
}

interface Resposta {
  comp: string;
  status: "aberta" | "fechada";
  vendas: VendaLinha[];
  truncado: boolean;
  resumo: ResumoLinha[];
  estornos: EstornoLinha[];
  colaboradores: { id: string; nome: string; ativo: boolean }[];
}

export function ComissoesTab() {
  const t = useTranslations("rh");
  const locale = useLocale();
  const { monthKey, label } = usePeriod();
  const [data, setData] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [reload, setReload] = useState(0);
  const recarregar = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    rhApi<Resposta>(`/api/rh/comissoes/vendas?comp=${monthKey}`)
      .then((d) => { if (!cancelled) { setData(d); setErro(""); } })
      .catch((e) => { if (!cancelled) setErro(e instanceof Error ? e.message : t("comum.erroCarregar")); });
    return () => { cancelled = true; };
  }, [monthKey, reload, t]);

  const money = (n: number) => formatMoney(n, locale);
  const totalComissao = (data?.resumo ?? []).reduce((s, r) => s + r.total, 0);
  const semCusto = (data?.resumo ?? []).reduce((s, r) => s + (r.semCusto?.length ?? 0), 0);

  const cols: Column[] = [
    { key: "nome", header: t("comissoes.resumo.cols.colaborador") },
    { key: "regra", header: t("comissoes.resumo.cols.regra") },
    { key: "base", header: t("comissoes.resumo.cols.base"), align: "right" },
    { key: "comissao", header: t("comissoes.resumo.cols.comissao"), align: "right" },
    { key: "ajuste", header: t("comissoes.resumo.cols.ajustes"), align: "right" },
    { key: "total", header: t("comissoes.resumo.cols.total"), align: "right" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label={`${t("comissoes.resumo.total")} · ${label}`} value={data ? money(totalComissao) : "—"} icon={Percent} />
        <KpiTile label={t("comissoes.resumo.vendasAtribuidas")} value={data ? `${data.vendas.filter((v) => v.atribuicao).length}/${data.vendas.length}` : "—"} />
        <KpiTile label={t("custo.situacao")} value={data ? <Pill tone={data.status === "fechada" ? "info" : "warn"} dot>{t(data.status === "fechada" ? "custo.fechada" : "custo.aberta")}</Pill> : "—"} />
      </div>

      {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      {semCusto > 0 && <p role="status" className="text-sm" style={{ color: "var(--warn)" }}>{t("comissoes.resumo.semCusto", { count: semCusto })}</p>}

      <div className="space-y-2">
        <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("comissoes.resumo.titulo")}</h2>
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("comissoes.resumo.nota")}</p>
        {data && (
          <Table
            columns={cols}
            rows={data.resumo}
            rowKey={(r) => r.colaboradorId}
            empty={<EmptyState icon={Percent} title={t("comissoes.resumo.vazio")} />}
            renderCell={(r, key) => {
              switch (key) {
                case "nome": return <span className="font-semibold">{r.nome}</span>;
                case "regra": return r.regraNome ? `${r.regraNome} (${t(`comissoes.regras.bases.${r.baseTipo ?? "receita"}`)})` : <Pill tone="warn">{t("comissoes.resumo.semRegra")}</Pill>;
                case "base": return money(r.base);
                case "comissao": return money(r.comissao);
                case "ajuste": return r.ajusteTotal ? <span style={{ color: "var(--neg)" }}>{money(r.ajusteTotal)}</span> : "—";
                default: return <strong>{money(r.total)}</strong>;
              }
            }}
          />
        )}
      </div>

      {data && (
        <VendasSection
          vendas={data.vendas}
          estornos={data.estornos}
          colaboradores={data.colaboradores}
          fechada={data.status === "fechada"}
          truncado={data.truncado}
          onChanged={recarregar}
        />
      )}

      <RegrasSection colaboradores={data?.colaboradores ?? []} onChanged={recarregar} />
    </div>
  );
}
