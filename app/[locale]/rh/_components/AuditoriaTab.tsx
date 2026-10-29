"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ScrollText } from "lucide-react";
import { Card, EmptyState, Table, type Column } from "@/app/components/ui";
import { rhApi } from "./shared";

interface Registro {
  id: string;
  em: number;
  nome: string;
  acao: string;
  colaboradorNome?: string;
  campos?: string[];
  info?: string;
}

export function AuditoriaTab() {
  const t = useTranslations("rh");
  const locale = useLocale();
  const [log, setLog] = useState<Registro[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    rhApi<{ log: Registro[] }>("/api/rh/log")
      .then((d) => setLog(d.log))
      .catch((e) => { setErro(e instanceof Error ? e.message : t("comum.erroCarregar")); setLog([]); });
  }, [t]);

  const cols: Column[] = [
    { key: "quando", header: t("log.quando") },
    { key: "quem", header: t("log.quem") },
    { key: "acao", header: t("log.acao") },
    { key: "detalhe", header: t("log.detalhe") },
  ];

  const nomeAcao = (a: string) => (t.has(`log.acoes.${a}`) ? t(`log.acoes.${a}`) : a);

  return (
    <Card className="space-y-3">
      <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("log.titulo")}</h2>
      {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      {log && (
        <Table
          columns={cols}
          rows={log}
          rowKey={(r) => r.id}
          empty={<EmptyState icon={ScrollText} title={t("log.vazio")} />}
          renderCell={(r, key) => {
            if (key === "quando") return new Date(r.em).toLocaleString(locale);
            if (key === "quem") return r.nome;
            if (key === "acao") return nomeAcao(r.acao);
            return [r.colaboradorNome, r.campos?.join(", "), r.info].filter(Boolean).join(" · ") || "—";
          }}
        />
      )}
    </Card>
  );
}
