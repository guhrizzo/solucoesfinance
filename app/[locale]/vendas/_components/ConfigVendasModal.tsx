"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Settings, X } from "lucide-react";
import { Button, Modal } from "@/app/components/ui";
import { CANAIS_VISIVEIS, CANAL_INFO, type Canal } from "./shared";

export type LancarNoCaixa = Partial<Record<Exclude<Canal, "manual">, boolean>>;

/**
 * Configuração das vendas de marketplace: por canal, se o pedido recebido
 * entra no Fluxo de Caixa (padrão) ou fica só no Painel de Vendas. Grava em
 * users/{ownerUid}/profile/vendas — lido pelos webhooks via
 * lib/vendas.ts → registrarVendaAdmin. Vale só pra vendas FUTURAS.
 */
export function ConfigVendasModal({
  open, onClose, ownerUid, atual, conectados, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  ownerUid: string;
  atual: LancarNoCaixa;
  conectados: Record<Canal, boolean>;
  onSaved: (msg: string, type: "success" | "error") => void;
}) {
  const t = useTranslations("vendas.config");
  const [rascunho, setRascunho] = useState<LancarNoCaixa>(atual);
  const [salvando, setSalvando] = useState(false);
  const [abertoAntes, setAbertoAntes] = useState(open);

  // Ao abrir, parte do valor salvo (padrão "derivar estado de prop" do React,
  // sem effect).
  if (open !== abertoAntes) {
    setAbertoAntes(open);
    if (open) setRascunho(atual);
  }

  const canais = CANAIS_VISIVEIS as Exclude<Canal, "manual">[];
  const ligado = (c: Exclude<Canal, "manual">) => rascunho[c] !== false;

  async function salvar() {
    setSalvando(true);
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { doc, setDoc } = await import("firebase/firestore");
      const lancarNoCaixa = Object.fromEntries(canais.map((c) => [c, ligado(c)]));
      await setDoc(
        doc(db, "users", ownerUid, "profile", "vendas"),
        { lancarNoCaixa, updatedAt: Date.now() },
        { merge: true },
      );
      onSaved(t("saved"), "success");
      onClose();
    } catch (err) {
      console.error("Erro ao salvar configuração de vendas:", err);
      onSaved(t("saveError"), "error");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" mobileSheet closeDisabled={salvando}>
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings size={16} style={{ color: "var(--text-muted)" }} />
            <h3 className="font-display text-base font-bold" style={{ color: "var(--text)" }}>{t("title")}</h3>
          </div>
          <button
            onClick={() => !salvando && onClose()}
            className="cursor-pointer rounded-lg border-none p-1.5"
            style={{ background: "var(--sunken)", color: "var(--text-muted)" }}
            aria-label={t("close")}
          >
            <X size={15} />
          </button>
        </div>

        <div>
          <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>{t("marketplaceTitle")}</p>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--text-subtle)" }}>{t("marketplaceHint")}</p>
        </div>

        <ul style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-card)" }}>
          {canais.map((c, i) => {
            const on = ligado(c);
            return (
              <li
                key={c}
                className="flex items-center justify-between gap-3 px-3 py-3"
                style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CANAL_INFO[c].solid }} />
                    {CANAL_INFO[c].label}
                    {!conectados[c] && (
                      <span className="text-[11px] font-normal" style={{ color: "var(--text-subtle)" }}>· {t("notConnected")}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--text-subtle)" }}>
                    {on ? t("onDesc") : t("offDesc")}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={t("switchLabel", { channel: CANAL_INFO[c].label })}
                  onClick={() => setRascunho((r) => ({ ...r, [c]: !on }))}
                  className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors"
                  style={{ background: on ? "var(--brand)" : "var(--border-strong)" }}
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full transition-all"
                    style={{ left: on ? 22 : 2, background: "var(--surface)" }}
                  />
                </button>
              </li>
            );
          })}
        </ul>

        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-subtle)" }}>{t("futureOnly")}</p>

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={salvando}>{t("cancel")}</Button>
          <Button onClick={salvar} loading={salvando}>{t("save")}</Button>
        </div>
      </div>
    </Modal>
  );
}
