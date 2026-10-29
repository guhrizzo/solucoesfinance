"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card } from "@/app/components/ui";
import { rhApi } from "./shared";

interface Props {
  sugeridos: string[];
  onDone: () => void;
}

/** Oferta opcional na primeira abertura sem centros. Nada é criado sem o clique em "Criar". */
export function SugeridosCard({ sugeridos, onDone }: Props) {
  const t = useTranslations("rh");
  const [marcados, setMarcados] = useState<Set<string>>(new Set(sugeridos));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  async function enviar(body: Record<string, unknown>) {
    setBusy(true); setErro("");
    try {
      await rhApi("/api/rh/centros", { body });
      onDone();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3">
      <div>
        <h2 className="text-base font-bold" style={{ color: "var(--text)" }}>{t("sugeridos.titulo")}</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{t("sugeridos.desc")}</p>
      </div>
      <div className="flex flex-wrap gap-4">
        {sugeridos.map((n) => (
          <label key={n} className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
            <input
              type="checkbox"
              checked={marcados.has(n)}
              onChange={(e) => setMarcados((p) => { const x = new Set(p); if (e.target.checked) x.add(n); else x.delete(n); return x; })}
            />
            {n}
          </label>
        ))}
      </div>
      {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
      <div className="flex gap-2">
        <Button onClick={() => enviar({ acao: "sugeridos", nomes: [...marcados] })} loading={busy} disabled={busy || marcados.size === 0}>{t("sugeridos.criar")}</Button>
        <Button variant="ghost" onClick={() => enviar({ acao: "dispensarSugestao" })} disabled={busy}>{t("sugeridos.agoraNao")}</Button>
      </div>
    </Card>
  );
}
