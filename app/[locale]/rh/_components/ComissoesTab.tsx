"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Percent } from "lucide-react";
import { Button, EmptyState, KpiTile, Input, MoneyInput, Pill, Table, parseAmount, type Column } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { usePeriod } from "@/app/hooks/usePeriod";
import { rhApi } from "./shared";

interface Linha {
  colaboradorId: string;
  nome: string;
  ativo: boolean;
  lancado: boolean;
  base: number;
  pct: number;
  comissao: number;
}

interface Resposta {
  comp: string;
  status: "aberta" | "fechada";
  colaboradores: Linha[];
}

const emTexto = (n: number) => (n ? n.toFixed(2).replace(".", ",") : "");

/** Comissão lançada à mão (base e valor), por colaborador e mês. Independe de vendas. */
export function ComissoesTab() {
  const t = useTranslations("rh");
  const locale = useLocale();
  const { monthKey, label } = usePeriod();
  const [data, setData] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [reload, setReload] = useState(0);
  const [edit, setEdit] = useState<Record<string, { base: string; pct: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const recarregar = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    rhApi<Resposta>(`/api/rh/comissoes/manual?comp=${monthKey}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setEdit(Object.fromEntries(d.colaboradores.map((c) => [c.colaboradorId, { base: emTexto(c.base), pct: emTexto(c.pct) }])));
        setErro("");
      })
      .catch((e) => { if (!cancelled) setErro(e instanceof Error ? e.message : t("comum.erroCarregar")); });
    return () => { cancelled = true; };
  }, [monthKey, reload, t]);

  const money = (n: number) => formatMoney(n, locale);
  const fechada = data?.status === "fechada";
  const total = (data?.colaboradores ?? []).reduce((s, c) => s + c.comissao, 0);
  const lancadas = (data?.colaboradores ?? []).filter((c) => c.lancado).length;

  async function salvar(c: Linha) {
    const e = edit[c.colaboradorId];
    setBusy(c.colaboradorId); setErro("");
    try {
      await rhApi("/api/rh/comissoes/manual", { body: { comp: monthKey, colaboradorId: c.colaboradorId, base: parseAmount(e.base), pct: parseAmount(e.pct) } });
      recarregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function limpar(c: Linha) {
    setBusy(c.colaboradorId); setErro("");
    try {
      await rhApi("/api/rh/comissoes/manual", { body: { comp: monthKey, colaboradorId: c.colaboradorId, acao: "remover" } });
      recarregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  const cols: Column[] = [
    { key: "nome", header: t("comissoes.manual.colaborador") },
    { key: "base", header: t("comissoes.manual.base"), align: "right" },
    { key: "pct", header: t("comissoes.manual.pct"), align: "right" },
    { key: "valor", header: t("comissoes.manual.valor"), align: "right" },
    { key: "acoes", header: "", align: "right" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label={`${t("comissoes.manual.total")} · ${label}`} value={data ? money(total) : "—"} icon={Percent} />
        <KpiTile label={t("comissoes.manual.lancadas")} value={data ? `${lancadas}/${data.colaboradores.length}` : "—"} />
        <KpiTile label={t("custo.situacao")} value={data ? <Pill tone={fechada ? "info" : "warn"} dot>{t(fechada ? "custo.fechada" : "custo.aberta")}</Pill> : "—"} />
      </div>

      {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      {fechada && <p role="status" className="text-sm" style={{ color: "var(--text-subtle)" }}>{t("comissoes.manual.fechada")}</p>}

      <div className="space-y-2">
        <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("comissoes.manual.titulo")}</h2>
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("comissoes.manual.nota")}</p>
        {data && (
          <Table
            columns={cols}
            rows={data.colaboradores}
            rowKey={(c) => c.colaboradorId}
            empty={<EmptyState icon={Percent} title={t("comissoes.manual.vazio")} />}
            renderCell={(c, key) => {
              const e = edit[c.colaboradorId] ?? { base: "", pct: "" };
              const set = (patch: Partial<typeof e>) => setEdit((p) => ({ ...p, [c.colaboradorId]: { ...e, ...patch } }));
              const sujo = e.base !== emTexto(c.base) || e.pct !== emTexto(c.pct);
              switch (key) {
                case "nome":
                  return (
                    <span className="font-semibold">
                      {c.nome}
                      {!c.lancado && <Pill tone="muted" className="ml-2">{t("comissoes.manual.naoLancado")}</Pill>}
                    </span>
                  );
                case "base":
                  return <div className="ml-auto w-36"><MoneyInput aria-label={t("comissoes.manual.base")} value={e.base} onValueChange={(v) => set({ base: v })} disabled={fechada} /></div>;
                case "pct":
                  return <div className="ml-auto w-28"><Input aria-label={t("comissoes.manual.pct")} inputMode="decimal" placeholder="0" value={e.pct} onChange={(ev) => set({ pct: ev.target.value.replace(/[^\d,.]/g, "") })} disabled={fechada} /></div>;
                case "valor":
                  return <strong>{money(Math.round(parseAmount(e.base) * parseAmount(e.pct)) / 100)}</strong>;
                default:
                  return (
                    <div className="flex justify-end gap-2">
                      <Button size="sm" disabled={fechada || !sujo || busy === c.colaboradorId} loading={busy === c.colaboradorId} onClick={() => salvar(c)}>{t("comissoes.manual.salvar")}</Button>
                      {c.lancado && <Button size="sm" variant="ghost" disabled={fechada || busy === c.colaboradorId} onClick={() => limpar(c)}>{t("comissoes.manual.remover")}</Button>}
                    </div>
                  );
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
