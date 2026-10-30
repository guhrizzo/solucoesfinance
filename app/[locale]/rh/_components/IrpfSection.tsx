"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { Button, Card, EmptyState, Field, KpiTile, Table, type Column } from "@/app/components/ui";
import { formatMoney } from "@/lib/format";
import { abrirPdf, rhApi, selectClass, selectStyle, type Colaborador } from "./shared";

interface Demonstrativo {
  ano: number;
  meses: { comp: string; rendimento: number; inss: number; dependentes: number; irrf: number; metodo: string | null }[];
  eventos: { id: string; tipo: string; comp: string; rendimentoNormal: number; rendimento13: number; inss: number; irrf: number }[];
  totais: { rendimentos: number; rendimentos13: number; inss: number; irrf: number };
}

/** Demonstrativo anual de IRPF (rendimentos e IRRF retido) por colaborador, com PDF. */
export function IrpfSection({ colaboradores }: { colaboradores: Colaborador[] }) {
  const t = useTranslations("rh");
  const locale = useLocale();
  const anoAtual = new Date().getFullYear();
  const [colaboradorId, setColaboradorId] = useState("");
  const [ano, setAno] = useState(String(anoAtual));
  const [dados, setDados] = useState<Demonstrativo | null>(null);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  const money = (n: number) => formatMoney(n, locale);
  const mes = (comp: string) => new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(`${comp}-01T00:00:00Z`));
  const consulta = `colaboradorId=${colaboradorId}&ano=${ano}`;

  async function carregar() {
    setBusy(true); setErro("");
    try {
      const r = await rhApi<{ demonstrativo: Demonstrativo }>(`/api/rh/irpf?${consulta}`, {}, { pin: true });
      setDados(r.demonstrativo);
    } catch (e) {
      setDados(null);
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  const cols: Column[] = [
    { key: "mes", header: t("folha.irpf.mes") },
    { key: "rend", header: t("folha.irpf.rendimento"), align: "right" },
    { key: "inss", header: "INSS", align: "right" },
    { key: "dep", header: t("folha.irpf.dependentes"), align: "right" },
    { key: "irrf", header: t("folha.irpf.irrf"), align: "right" },
  ];

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <div>
          <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("folha.irpf.titulo")}</h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.irpf.nota")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("folha.irpf.colaborador")}>
            <select className={selectClass} style={selectStyle} value={colaboradorId} onChange={(e) => { setColaboradorId(e.target.value); setDados(null); }}>
              <option value="">{t("alocacao.escolha")}</option>
              {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </Field>
          <Field label={t("folha.irpf.ano")}>
            <select className={selectClass} style={selectStyle} value={ano} onChange={(e) => { setAno(e.target.value); setDados(null); }}>
              {Array.from({ length: 6 }, (_, i) => anoAtual - i).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Button size="sm" onClick={carregar} loading={busy} disabled={!colaboradorId || busy}>{t("folha.irpf.gerar")}</Button>
          {dados && <Button size="sm" variant="secondary" icon={FileText} onClick={() => abrirPdf(`/api/rh/irpf?${consulta}&pdf=1`).catch((e) => setErro(e instanceof Error ? e.message : "Erro"))}>{t("folha.irpf.pdf")}</Button>}
        </div>
        {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      </Card>

      {dados && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <KpiTile label={t("folha.irpf.totalRendimentos")} value={money(dados.totais.rendimentos)} />
            <KpiTile label={t("folha.irpf.total13")} value={money(dados.totais.rendimentos13)} />
            <KpiTile label="INSS" value={money(dados.totais.inss)} />
            <KpiTile label={t("folha.irpf.totalIrrf")} value={money(dados.totais.irrf)} />
          </div>
          <Table
            columns={cols}
            rows={dados.meses}
            rowKey={(m) => m.comp}
            empty={<EmptyState icon={FileText} title={t("folha.irpf.vazio")} />}
            renderCell={(m, key) => {
              switch (key) {
                case "mes": return <span className="font-semibold capitalize">{mes(m.comp)}</span>;
                case "rend": return money(m.rendimento);
                case "inss": return money(m.inss);
                case "dep": return m.dependentes;
                default: return <>{money(m.irrf)}{m.metodo === "simplificado" ? " *" : ""}</>;
              }
            }}
          />
          {dados.eventos.length > 0 && (
            <Card className="space-y-2">
              <h3 className="text-sm font-semibold">{t("folha.irpf.eventos")}</h3>
              <ul className="divide-y text-sm" style={{ borderColor: "var(--border)" }}>
                {dados.eventos.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{t(`folha.eventos.tipos.${e.tipo}`)} · <span className="capitalize">{mes(e.comp)}</span></span>
                    <span className="mono text-xs" style={{ color: "var(--text-muted)" }}>
                      {t("folha.irpf.rendimento")}: {money(e.rendimentoNormal + e.rendimento13)} · INSS {money(e.inss)} · IRRF {money(e.irrf)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("folha.irpf.rodape")}</p>
        </>
      )}
    </div>
  );
}
