"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Plus, UserRound, Wallet } from "lucide-react";
import { Button, EmptyState, Pill, Table, type Column } from "@/app/components/ui";
import { ColaboradorModal } from "./ColaboradorModal";
import { RemuneracaoModal } from "./RemuneracaoModal";
import { fmtData, rhApi, type Colaborador } from "./shared";

export function ColaboradoresTab() {
  const t = useTranslations("rh");
  const locale = useLocale();
  const [lista, setLista] = useState<Colaborador[] | null>(null);
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState<Colaborador | null | undefined>(undefined); // undefined = fechado, null = novo
  const [remunerando, setRemunerando] = useState<Colaborador | null>(null);

  const [reload, setReload] = useState(0);
  const carregar = useCallback(() => setReload((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    rhApi<{ colaboradores: Colaborador[] }>("/api/rh/colaboradores")
      .then((c) => { if (!cancelled) { setLista(c.colaboradores); setErro(""); } })
      .catch((e) => { if (!cancelled) { setErro(e instanceof Error ? e.message : t("comum.erroCarregar")); setLista([]); } });
    return () => { cancelled = true; };
  }, [reload, t]);

  const cols: Column[] = [
    { key: "nome", header: t("colab.cols.nome") },
    { key: "cargo", header: t("colab.cols.cargo") },
    { key: "vinculo", header: t("colab.cols.vinculo") },
    { key: "entrada", header: t("colab.cols.entrada") },
    { key: "cpf", header: t("colab.cols.cpf") },
    { key: "status", header: t("colab.cols.status") },
    { key: "acoes", header: t("colab.cols.acoes"), align: "right" },
  ];

  return (
    <div className="space-y-4">
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
              case "cpf": return <span className="mono">{r.cpfMascarado}</span>;
              case "status": return <Pill tone={r.status === "ativo" ? "pos" : "muted"} dot>{t(`status.${r.status}`)}</Pill>;
              default: return (
                <span className="flex justify-end gap-1">
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
    </div>
  );
}
