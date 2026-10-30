"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfigFolha } from "./ConfigFolha";
import { EventosSection } from "./EventosSection";
import { FolhaMes } from "./FolhaMes";
import { IrpfSection } from "./IrpfSection";
import { rhApi, type Colaborador } from "./shared";

type Sub = "mes" | "eventos" | "irpf" | "config";

/** Folha de pagamento: folha do mês, férias/13º/rescisão e configuração (rubricas, tabelas, parâmetros). */
export function FolhaTab() {
  const t = useTranslations("rh");
  const [sub, setSub] = useState<Sub>("mes");
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);

  useEffect(() => {
    rhApi<{ colaboradores: Colaborador[] }>("/api/rh/colaboradores").then((d) => setColaboradores(d.colaboradores)).catch(() => setColaboradores([]));
  }, []);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label={t("tabs.folha")} className="flex gap-2">
        {(["mes", "eventos", "irpf", "config"] as const).map((k) => (
          <button
            key={k} role="tab" aria-selected={sub === k} onClick={() => setSub(k)}
            className="cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold"
            style={{ background: sub === k ? "var(--brand)" : "var(--sunken)", color: sub === k ? "var(--brand-on)" : "var(--text-muted)" }}
          >
            {t(`folha.sub.${k}`)}
          </button>
        ))}
      </div>
      {sub === "mes" && <FolhaMes />}
      {sub === "eventos" && <EventosSection colaboradores={colaboradores} />}
      {sub === "irpf" && <IrpfSection colaboradores={colaboradores} />}
      {sub === "config" && <ConfigFolha />}
    </div>
  );
}
