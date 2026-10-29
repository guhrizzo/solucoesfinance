"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Network, Pencil, Plus, UserRound, Wallet } from "lucide-react";
import { Button, EmptyState, Pill, Table, type Column } from "@/app/components/ui";
import { ColaboradorModal } from "./ColaboradorModal";
import { RemuneracaoModal } from "./RemuneracaoModal";
import { AlocacaoModal } from "./AlocacaoModal";
import { SugeridosCard } from "./SugeridosCard";
import { fmtData, rhApi, type Centro, type Colaborador } from "./shared";

interface CentrosResp { centros: Centro[]; sugestaoDispensada: boolean; sugeridos: string[] }

export function ColaboradoresTab() {
  const t = useTranslations("rh");
  const locale = useLocale();
  const [lista, setLista] = useState<Colaborador[] | null>(null);
  const [centros, setCentros] = useState<CentrosResp | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<Colaborador | null | undefined>(undefined); // undefined = fechado, null = novo
  const [remunerando, setRemunerando] = useState<Colaborador | null>(null);
  const [alocando, setAlocando] = useState<Colaborador | null>(null);

  const [reload, setReload] = useState(0);
  const carregar = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      rhApi<{ colaboradores: Colaborador[] }>("/api/rh/colaboradores"),
      rhApi<CentrosResp>("/api/rh/centros"),
    ])
      .then(([c, z]) => { if (!cancelled) { setLista(c.colaboradores); setCentros(z); setErro(""); } })
      .catch((e) => { if (!cancelled) { setErro(e instanceof Error ? e.message : t("comum.erroCarregar")); setLista([]); } });
    return () => { cancelled = true; };
  }, [reload, t]);

  const pendentes = (lista ?? []).filter((c) => c.semAlocacao);
  const mostrarSugeridos = !!centros && centros.centros.length === 0 && !centros.sugestaoDispensada;

  const cols: Column[] = [
    { key: "nome", header: t("colab.cols.nome") },
    { key: "cargo", header: t("colab.cols.cargo") },
    { key: "vinculo", header: t("colab.cols.vinculo") },
    { key: "entrada", header: t("colab.cols.entrada") },
    { key: "alocacao", header: t("colab.cols.alocacao") },
    { key: "cpf", header: t("colab.cols.cpf") },
    { key: "status", header: t("colab.cols.status") },
    { key: "acoes", header: t("colab.cols.acoes"), align: "right" },
  ];

  return (
    <div className="space-y-4">
      {mostrarSugeridos && <SugeridosCard sugeridos={centros.sugeridos} onDone={carregar} />}

      {pendentes.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-lg p-3 text-sm" style={{ background: "var(--warn-weak)", color: "var(--text)" }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} aria-hidden />
          <span>{t("colab.pendencias", { count: pendentes.length, nomes: pendentes.map((p) => p.nome).join(", ") })}</span>
        </div>
      )}

      <div className="flex justify-end">
        <Button icon={Plus} onClick={() => setEditando(null)}>{t("colab.novo")}</Button>
      </div>
      {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}

      {lista && (
        <Table
          columns={cols}
          rows={lista}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={UserRound} title={t("colab.vazioTitulo")} description={t("colab.vazioDesc")}
            action={<Button icon={Plus} onClick={() => setEditando(null)}>{t("colab.novo")}</Button>} />}
          renderCell={(r, key) => {
            switch (key) {
              case "nome": return <span className="font-semibold">{r.nome}{r.comissionado && <Pill tone="info" className="ml-2">{t("colab.comissionado")}</Pill>}</span>;
              case "cargo": return r.cargo || "—";
              case "vinculo": return t(`vinculos.${r.vinculo}`);
              case "entrada": return fmtData(r.dataEntrada, locale);
              case "alocacao": return r.alocacao.length > 0
                ? <span className="text-xs">{r.alocacao.map((a) => `${a.centroNome} ${a.pct}%`).join(" · ")}</span>
                : r.semAlocacao ? <Pill tone="warn" dot>{t("colab.semAlocacao")}</Pill> : "—";
              case "cpf": return <span className="mono">{r.cpfMascarado}</span>;
              case "status": return <Pill tone={r.status === "ativo" ? "pos" : "muted"} dot>{t(`status.${r.status}`)}</Pill>;
              default: return (
                <span className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" icon={Network} onClick={() => setAlocando(r)}>{t("colab.alocar")}</Button>
                  <Button size="sm" variant="ghost" icon={Wallet} onClick={() => setRemunerando(r)}>{t("colab.remuneracao")}</Button>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditando(r)}>{t("colab.editar")}</Button>
                </span>
              );
            }
          }}
        />
      )}

      <ColaboradorModal open={editando !== undefined} colaborador={editando ?? null} onClose={() => setEditando(undefined)} onSaved={carregar} />
      <RemuneracaoModal colaborador={remunerando} onClose={() => setRemunerando(null)} />
      <AlocacaoModal
        colaborador={alocando}
        centros={centros?.centros ?? []}
        onCentroCriado={(c) => setCentros((p) => (p ? { ...p, centros: [...p.centros, c] } : p))}
        onClose={() => setAlocando(null)}
        onSaved={carregar}
      />
    </div>
  );
}
