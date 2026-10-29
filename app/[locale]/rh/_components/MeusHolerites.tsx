"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { Button, Card } from "@/app/components/ui";
import { abrirPdf, rhApi } from "./shared";

interface Lista { colaboradorId: string; folhas: string[]; eventos: { id: string; tipo: string; comp: string }[] }

/** Holerites e recibos FECHADOS do próprio colaborador (visão "rh_proprio"). */
export function MeusHolerites() {
  const t = useTranslations("rh");
  const [lista, setLista] = useState<Lista | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    rhApi<Lista>("/api/rh/holerite?lista=1").then(setLista).catch((e) => setErro(e instanceof Error ? e.message : t("comum.erroCarregar")));
  }, [t]);

  const abrir = (path: string) => abrirPdf(path).catch((e) => setErro(e instanceof Error ? e.message : "Erro"));

  return (
    <Card className="space-y-3">
      <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("folha.meus.titulo")}</h2>
      {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      {lista && lista.folhas.length === 0 && lista.eventos.length === 0 && <p className="text-sm" style={{ color: "var(--text-subtle)" }}>{t("folha.meus.vazio")}</p>}
      {lista && (
        <ul className="divide-y rounded-lg border text-sm" style={{ borderColor: "var(--border)" }}>
          {lista.folhas.map((c) => (
            <li key={`f${c}`} className="flex items-center justify-between px-3 py-2" style={{ borderColor: "var(--border)" }}>
              <span>{t("folha.meus.holerite", { comp: c })}</span>
              <Button size="sm" variant="ghost" icon={FileText} onClick={() => abrir(`/api/rh/holerite?comp=${c}&colaboradorId=${lista.colaboradorId}`)}>PDF</Button>
            </li>
          ))}
          {lista.eventos.map((e) => (
            <li key={e.id} className="flex items-center justify-between px-3 py-2" style={{ borderColor: "var(--border)" }}>
              <span>{t(`folha.eventos.tipos.${e.tipo as "ferias"}`)} · {e.comp}</span>
              <Button size="sm" variant="ghost" icon={FileText} onClick={() => abrir(`/api/rh/holerite?evento=${e.id}`)}>PDF</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
