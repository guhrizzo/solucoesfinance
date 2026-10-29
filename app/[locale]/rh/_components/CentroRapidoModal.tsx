"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Field, Input, Modal, MoneyInput, parseAmount } from "@/app/components/ui";
import { authedFetch } from "@/lib/authedFetch";

interface Similar { id: string; nome: string }

interface Props {
  open: boolean;
  onClose: () => void;
  /** Centro criado agora, ou existente escolhido no aviso de duplicidade. */
  onResolved: (centro: { id: string; nome: string; criado: boolean }) => void;
}

/**
 * Modal rápido de criação de centro de custo, aberto de dentro da alocação.
 * Cria o centro pela mesma coleção do módulo Centro de custo. Se já existir
 * um centro com nome igual/parecido, pergunta se o usuário prefere usá-lo.
 */
export function CentroRapidoModal({ open, onClose, onResolved }: Props) {
  const t = useTranslations("rh");
  const [nome, setNome] = useState("");
  const [orc, setOrc] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [similares, setSimilares] = useState<Similar[]>([]);

  useEffect(() => {
    if (open) { setNome(""); setOrc(""); setErro(""); setSimilares([]); }
  }, [open]);

  async function criar(forcar: boolean) {
    setBusy(true); setErro("");
    try {
      const res = await authedFetch("/api/rh/centros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "criar", nome, orcamento: orc ? parseAmount(orc) : undefined, forcar }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 && Array.isArray(json.similares)) { setSimilares(json.similares); return; }
      if (!res.ok) throw new Error(json.error || "Erro");
      onResolved({ id: json.id, nome: json.nome, criado: true });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" title={t("centro.titulo")} closeDisabled={busy}>
      {similares.length > 0 ? (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: "var(--text)" }}>{t("centro.jaExiste", { nome })}</p>
          <ul className="space-y-2">
            {similares.map((s) => (
              <li key={s.id}>
                <Button className="w-full" variant="secondary" onClick={() => onResolved({ id: s.id, nome: s.nome, criado: false })}>
                  {t("centro.usarExistente", { nome: s.nome })}
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSimilares([])} disabled={busy}>{t("form.cancelar")}</Button>
            <Button variant="danger" onClick={() => criar(true)} loading={busy}>{t("centro.criarMesmoAssim")}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label={t("centro.nome")}><Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} autoFocus /></Field>
          <Field label={t("centro.orcamento")} hint={t("centro.orcamentoHint")}>
            <MoneyInput value={orc} onValueChange={setOrc} />
          </Field>
          {erro && <p role="alert" className="text-sm font-medium" style={{ color: "var(--neg)" }}>{erro}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>{t("form.cancelar")}</Button>
            <Button onClick={() => criar(false)} loading={busy} disabled={busy || nome.trim().length < 2}>{t("centro.criar")}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
