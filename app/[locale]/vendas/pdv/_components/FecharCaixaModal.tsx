"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Lock, X } from "lucide-react";
import { Button, Modal, MoneyInput, parseAmount } from "@/app/components/ui";
import { authedFetch } from "@/lib/authedFetch";
import { formatMoney } from "@/lib/format";
import {
  FORMAS_PAGAMENTO, esperadoNoFechamento, r2, somaTotais, zeroTotais,
  type Caixa, type FormaPagamento,
} from "@/lib/pdv";
import { usePinGate } from "./usePinGate";

/**
 * Fechamento do caixa: por forma de pagamento mostra o vendido e o esperado,
 * o operador digita o conferido e a diferença aparece na hora. O dinheiro
 * começa em branco (tem que contar a gaveta); Pix e cartões vêm preenchidos
 * com o esperado — ajuste se o extrato/maquininha mostrar outro valor.
 */
export function FecharCaixaModal({
  open, onClose, caixa, authUid, onClosed, onToast,
}: {
  open: boolean;
  onClose: () => void;
  caixa: Caixa;
  authUid: string;
  onClosed: () => void;
  onToast: (msg: string, type?: "success" | "error") => void;
}) {
  const t = useTranslations("vendas.pdv");
  const locale = useLocale();
  const money = (n: number) => formatMoney(n, locale);
  const esperado = esperadoNoFechamento(caixa);

  const [conferido, setConferido] = useState<Record<FormaPagamento, string>>({ dinheiro: "", pix: "", debito: "", credito: "" });
  const [obs, setObs] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");
  const pin = usePinGate(authUid, setErr);
  const obsId = useId();

  useEffect(() => {
    if (!open) return;
    const e = esperadoNoFechamento(caixa);
    const fmt = (n: number) => n.toFixed(2).replace(".", ",");
    setConferido({ dinheiro: "", pix: fmt(e.pix), debito: fmt(e.debito), credito: fmt(e.credito) });
    setObs("");
    setErr("");
    setEnviando(false);
    // Só ao abrir: não sobrescreve o que o operador já digitou se chegar venda nova.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const conf = zeroTotais();
  for (const f of FORMAS_PAGAMENTO) conf[f] = r2(parseAmount(conferido[f]));
  const difTotal = r2(somaTotais(conf) - somaTotais(esperado));
  const dinheiroVazio = !conferido.dinheiro.trim() && esperado.dinheiro > 0;

  async function fechar() {
    setEnviando(true);
    setErr("");
    try {
      const res = await authedFetch("/api/vendas/caixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "fechar", caixaId: caixa.id, conferido: conf, observacao: obs.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("close.error"));
      onToast(t("close.success"));
      onClosed();
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : t("close.error"));
    } finally {
      setEnviando(false);
    }
  }

  const corDif = (n: number) => (n === 0 ? "var(--text-muted)" : n < 0 ? "var(--neg)" : "var(--warn)");

  return (
    <>
      <Modal open={open} onClose={onClose} size="lg" mobileSheet closeDisabled={enviando}>
        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock size={16} style={{ color: "var(--neg)" }} />
              <h3 className="font-display text-base font-bold" style={{ color: "var(--text)" }}>{t("close.title")}</h3>
            </div>
            <button
              onClick={() => !enviando && onClose()}
              className="cursor-pointer rounded-lg border-none p-1.5"
              style={{ background: "var(--sunken)", color: "var(--text-muted)" }}
              aria-label={t("close.cancel")}
            >
              <X size={15} />
            </button>
          </div>

          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {t("close.hint", { n: caixa.qtdVendas, opening: money(caixa.trocoInicial) })}
          </p>

          {err && (
            <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>{err}</div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--text-subtle)", borderBottom: "1px solid var(--border)" }}>
                  <th className="py-2 pr-2">{t("report.method")}</th>
                  <th className="px-2 py-2 text-right">{t("report.sold")}</th>
                  <th className="px-2 py-2 text-right">{t("report.expected")}</th>
                  <th className="px-2 py-2">{t("report.counted")}</th>
                  <th className="py-2 pl-2 text-right">{t("report.difference")}</th>
                </tr>
              </thead>
              <tbody>
                {FORMAS_PAGAMENTO.map((f) => {
                  const dif = r2(conf[f] - esperado[f]);
                  return (
                    <tr key={f} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-2 pr-2 font-semibold" style={{ color: "var(--text)" }}>{t(`payment.${f}`)}</td>
                      <td className="mono px-2 py-2 text-right" style={{ color: "var(--text-muted)" }}>{money(caixa.totais?.[f] ?? 0)}</td>
                      <td className="mono px-2 py-2 text-right" style={{ color: "var(--text)" }}>{money(esperado[f])}</td>
                      <td className="w-40 px-2 py-2">
                        <MoneyInput
                          aria-label={t("close.countedFor", { method: t(`payment.${f}`) })}
                          value={conferido[f]}
                          onValueChange={(v) => setConferido((c) => ({ ...c, [f]: v }))}
                        />
                      </td>
                      <td className="mono py-2 pl-2 text-right font-semibold" style={{ color: corDif(dif) }}>{money(dif)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td className="py-2 pr-2 font-bold" style={{ color: "var(--text)" }}>{t("report.total")}</td>
                  <td className="mono px-2 py-2 text-right font-bold" style={{ color: "var(--text)" }}>{money(caixa.totalVendas)}</td>
                  <td className="mono px-2 py-2 text-right font-bold" style={{ color: "var(--text)" }}>{money(somaTotais(esperado))}</td>
                  <td className="mono px-2 py-2 font-bold" style={{ color: "var(--text)" }}>{money(somaTotais(conf))}</td>
                  <td className="mono py-2 pl-2 text-right font-bold" style={{ color: corDif(difTotal) }}>{money(difTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{t("report.expectedHint")}</p>

          {dinheiroVazio && (
            <p className="rounded-lg px-3 py-2 text-xs" style={{ background: "var(--warn-weak)", color: "var(--warn)" }}>{t("close.countCash")}</p>
          )}

          <div className="space-y-1">
            <label htmlFor={obsId} className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{t("close.notes")}</label>
            <textarea
              id={obsId}
              value={obs}
              maxLength={500}
              rows={2}
              onChange={(e) => setObs(e.target.value)}
              placeholder={t("close.notesPlaceholder")}
              className="w-full resize-none rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </div>

          <Button
            variant="danger"
            size="lg"
            icon={Lock}
            className="w-full"
            loading={enviando}
            disabled={dinheiroVazio}
            onClick={() => pin.pedir(t("close.pinTitle"), t("close.pinSubtitle"), fechar)}
          >
            {t("close.submit")}
          </Button>
        </div>
      </Modal>
      {pin.modal}
    </>
  );
}
