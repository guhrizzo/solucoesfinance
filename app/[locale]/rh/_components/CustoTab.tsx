"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock, LockOpen, Users } from "lucide-react";
import { Button, EmptyState, Field, Input, KpiTile, Pill, Table, type Column } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { usePeriod } from "@/app/hooks/usePeriod";
import { fmtData, rhApi, type CustoMes, RhModal as Modal } from "./shared";

interface Rateio { itens: { centroId: string; centroNome: string; valor: number }[]; naoAlocado: number }
interface Linha { colaboradorId: string; nome: string; cargo: string; vinculo: string; custo: CustoMes; rateio?: Rateio }
interface Resposta {
  comp: string;
  status: "aberta" | "fechada";
  fechadaPorNome: string | null;
  fechadaEm: number | null;
  historicoReaberturas: { em: number; porNome: string; motivo: string }[];
  linhas: Linha[];
  total: number;
}

export function CustoTab() {
  const t = useTranslations("rh");
  const locale = useLocale();
  const { monthKey, label } = usePeriod();
  const [data, setData] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"fechar" | "reabrir" | null>(null);
  const [motivo, setMotivo] = useState("");
  const [bonusEdit, setBonusEdit] = useState<Record<string, string>>({});

  const carregar = useCallback(async () => {
    try {
      setData(await rhApi<Resposta>(`/api/rh/custos?comp=${monthKey}`));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : t("comum.erroCarregar"));
    }
  }, [monthKey, t]);

  useEffect(() => { setData(null); setBonusEdit({}); carregar(); }, [carregar]);

  async function acao(acao: "fechar" | "reabrir") {
    setBusy(true); setErro("");
    try {
      await rhApi("/api/rh/competencias", { body: { acao, comp: monthKey, motivo } });
      setModal(null); setMotivo("");
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
      setModal(null);
    } finally {
      setBusy(false);
    }
  }

  const limparBonus = (id: string) => setBonusEdit((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== id)));

  async function salvarBonus(l: Linha) {
    const raw = bonusEdit[l.colaboradorId];
    if (raw === undefined) return;
    const valor = Number(raw.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(valor) || valor === l.custo.bonus) { limparBonus(l.colaboradorId); return; }
    try {
      await rhApi("/api/rh/variaveis", { method: "PUT", body: { comp: monthKey, colaboradorId: l.colaboradorId, bonus: valor } });
      limparBonus(l.colaboradorId);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    }
  }

  const money = (n: number) => formatMoney(n, locale);
  const fechada = data?.status === "fechada";

  // Rateio por centro de custo (soma das linhas) + parte sem alocação.
  const porCentro = new Map<string, { nome: string; valor: number }>();
  let naoAlocado = 0;
  for (const l of data?.linhas ?? []) {
    if (!l.rateio) { naoAlocado += l.custo.total; continue; }
    naoAlocado += l.rateio.naoAlocado;
    for (const i of l.rateio.itens) {
      const cur = porCentro.get(i.centroId);
      porCentro.set(i.centroId, { nome: i.centroNome, valor: (cur?.valor ?? 0) + i.valor });
    }
  }
  const centrosOrdenados = [...porCentro.values()].sort((a, b) => b.valor - a.valor);

  const cols: Column[] = [
    { key: "colaborador", header: t("custo.cols.colaborador") },
    { key: "dias", header: t("custo.cols.dias"), align: "right" },
    { key: "salario", header: t("custo.cols.salario"), align: "right" },
    { key: "prov13", header: t("custo.cols.prov13"), align: "right" },
    { key: "provFerias", header: t("custo.cols.provFerias"), align: "right" },
    { key: "encargos", header: t("custo.cols.encargos"), align: "right" },
    { key: "beneficios", header: t("custo.cols.beneficios"), align: "right" },
    { key: "comissao", header: t("custo.cols.comissao"), align: "right" },
    { key: "bonus", header: t("custo.cols.bonus"), align: "right", width: "120px" },
    { key: "total", header: t("custo.cols.total"), align: "right" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiTile label={`${t("custo.total")} · ${label}`} value={data ? money(data.total) : "—"} />
        <KpiTile label={t("custo.pessoas")} value={data ? String(data.linhas.length) : "—"} icon={Users} />
        <KpiTile
          label={t("custo.situacao")}
          value={data ? <Pill tone={fechada ? "info" : "warn"} dot>{t(fechada ? "custo.fechada" : "custo.aberta")}</Pill> : "—"}
          delta={fechada && data?.fechadaPorNome ? t("custo.fechadaPor", { nome: data.fechadaPorNome }) : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-xs" style={{ color: "var(--text-subtle)" }}>{t("custo.premissas")}</p>
        {data && (fechada
          ? <Button variant="secondary" icon={LockOpen} onClick={() => setModal("reabrir")}>{t("custo.reabrir")}</Button>
          : <Button icon={Lock} onClick={() => setModal("fechar")} disabled={data.linhas.length === 0}>{t("custo.fechar")}</Button>)}
      </div>

      {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}

      {data && (
        <Table
          columns={cols}
          rows={data.linhas}
          rowKey={(r) => r.colaboradorId}
          empty={<EmptyState icon={Users} title={t("custo.vazioTitulo")} description={t("custo.vazioDesc")} />}
          renderCell={(r, key) => {
            const c = r.custo;
            switch (key) {
              case "colaborador": return (
                <span>
                  <span className="font-semibold">{r.nome}</span>
                  <span className="block text-xs" style={{ color: "var(--text-subtle)" }}>{r.cargo || "—"} · {t(`vinculos.${r.vinculo as "CLT"}`)}</span>
                  {c.semSalario && <Pill tone="neg">{t("custo.semSalario")}</Pill>}
                </span>
              );
              case "dias": return `${c.diasAtivos}/${c.diasMes}`;
              case "salario": return <span>{money(c.salario)}{c.salarioDaFolha && <Pill tone="info" className="ml-1">{t("custo.daFolha")}</Pill>}</span>;
              case "prov13": return money(c.prov13);
              case "provFerias": return money(c.provFerias);
              case "encargos": return <span title={`${c.encargosPct}%`}>{money(c.encargos)}</span>;
              case "beneficios": return money(c.beneficiosTotal);
              case "comissao": return money(c.comissao);
              case "bonus": return fechada ? money(c.bonus) : (
                <Input
                  aria-label={`${t("custo.cols.bonus")} — ${r.nome}`}
                  inputMode="decimal"
                  className="!w-28 !py-1.5 text-right mono"
                  value={bonusEdit[r.colaboradorId] ?? c.bonus.toFixed(2).replace(".", ",")}
                  onChange={(e) => setBonusEdit((p) => ({ ...p, [r.colaboradorId]: e.target.value }))}
                  onBlur={() => salvarBonus(r)}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                />
              );
              default: return <strong>{money(c.total)}</strong>;
            }
          }}
        />
      )}

      {data && data.linhas.length > 0 && (
        <div className="space-y-2 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{t("custo.rateioTitulo")}</h3>
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("custo.rateioNota")}</p>
          <ul className="divide-y text-sm" style={{ borderColor: "var(--border)" }}>
            {centrosOrdenados.map((c) => (
              <li key={c.nome} className="flex justify-between py-1.5" style={{ borderColor: "var(--border)" }}>
                <span>{c.nome}</span><span className="mono font-semibold">{money(c.valor)}</span>
              </li>
            ))}
            {naoAlocado > 0 && (
              <li className="flex justify-between py-1.5" style={{ borderColor: "var(--border)" }}>
                <span className="flex items-center gap-2"><Pill tone="warn" dot>{t("custo.naoAlocado")}</Pill></span>
                <span className="mono font-semibold">{money(naoAlocado)}</span>
              </li>
            )}
          </ul>
        </div>
      )}

      {data && data.historicoReaberturas.length > 0 && (
        <details className="text-sm" style={{ color: "var(--text-muted)" }}>
          <summary className="cursor-pointer font-semibold">{t("custo.reaberturas")} ({data.historicoReaberturas.length})</summary>
          <ul className="mt-2 space-y-1">
            {data.historicoReaberturas.map((r) => (
              <li key={r.em}>{fmtData(new Date(r.em).toISOString().slice(0, 10), locale)} · {r.porNome} — {r.motivo}</li>
            ))}
          </ul>
        </details>
      )}

      <Modal open={modal === "fechar"} onClose={() => setModal(null)} size="sm" title={t("custo.fechar")} closeDisabled={busy}>
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("custo.confirmarFechar", { comp: label })}</p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)} disabled={busy}>{t("form.cancelar")}</Button>
            <Button onClick={() => acao("fechar")} loading={busy}>{t("custo.fechar")}</Button>
          </div>
        </div>
      </Modal>

      <Modal open={modal === "reabrir"} onClose={() => setModal(null)} size="sm" title={t("custo.confirmarReabrir", { comp: label })} closeDisabled={busy}>
        <div className="space-y-4">
          <Field label={t("custo.motivo")}>
            <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={t("custo.motivoPh")} maxLength={300} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModal(null)} disabled={busy}>{t("form.cancelar")}</Button>
            <Button variant="danger" onClick={() => acao("reabrir")} loading={busy} disabled={motivo.trim().length < 5}>{t("custo.reabrir")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
