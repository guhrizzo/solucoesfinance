"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Banknote, Check, CreditCard, QrCode, Wallet, X } from "lucide-react";
import { Button, Modal, MoneyInput, parseAmount } from "@/app/components/ui";
import { authedFetch } from "@/lib/authedFetch";
import { formatMoney } from "@/lib/format";
import {
  FORMAS_PAGAMENTO, MAX_PARCELAS, localDateKey, r2,
  type FormaPagamento, type PdvItem, type PdvVenda,
} from "@/lib/pdv";

// Mesma preferência do modal "Nova venda" (lembrada neste navegador).
const CAIXA_PREF_KEY = "nexusfi-venda-lancar-caixa";

const ICONES: Record<FormaPagamento, typeof Banknote> = {
  dinheiro: Banknote,
  pix: QrCode,
  debito: Wallet,
  credito: CreditCard,
};

/** Forma de pagamento (+ parcelas no crédito, + troco no dinheiro) e envio da venda. */
export function PagamentoModal({
  open, onClose, caixaId, operador, itens, total, onDone, onError,
}: {
  open: boolean;
  onClose: () => void;
  caixaId: string;
  operador: string;
  itens: PdvItem[];
  total: number;
  onDone: (v: PdvVenda) => void;
  onError: (msg: string) => void;
}) {
  const t = useTranslations("vendas.pdv");
  const locale = useLocale();
  const money = (n: number) => formatMoney(n, locale);

  const [forma, setForma] = useState<FormaPagamento>("pix");
  const [parcelas, setParcelas] = useState(1);
  const [recebido, setRecebido] = useState("");
  const [lancarNoCaixa, setLancarNoCaixa] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");
  // Id da venda gerado ao abrir: reenviar (rede caiu, clique duplo) não duplica.
  const [vendaId, setVendaId] = useState("");

  const parcId = useId();
  const recId = useId();
  const caixaChkId = useId();

  useEffect(() => {
    if (!open) return;
    setForma("pix");
    setParcelas(1);
    setRecebido("");
    setErr("");
    setEnviando(false);
    setVendaId((crypto as Crypto).randomUUID());
    try { setLancarNoCaixa(localStorage.getItem(CAIXA_PREF_KEY) !== "0"); } catch { /* default */ }
  }, [open]);

  const valorRecebido = forma === "dinheiro" ? (recebido.trim() ? parseAmount(recebido) : total) : total;
  const troco = forma === "dinheiro" ? r2(valorRecebido - total) : 0;
  const faltando = forma === "dinheiro" && valorRecebido < total;

  async function confirmar() {
    if (faltando || enviando) return;
    setEnviando(true);
    setErr("");
    try {
      const date = localDateKey();
      const res = await authedFetch("/api/vendas/pdv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendaId, caixaId, operador, date, forma, lancarNoCaixa,
          parcelas: forma === "credito" ? parcelas : 1,
          valorRecebido,
          itens: itens.map(({ sku, descricao, quantidade, unidade, precoUnitario }) => ({ sku, descricao, quantidade, unidade, precoUnitario })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("payment.error"));
      onDone({
        id: vendaId,
        caixaId,
        numero: data.numero,
        itens,
        total: data.total ?? total,
        forma,
        parcelas: forma === "credito" ? parcelas : 1,
        valorRecebido,
        troco: data.troco ?? troco,
        lancarNoCaixa,
        date,
        createdAt: Date.now(),
        operador,
        createdBy: "",
        createdByName: "",
      });
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : t("payment.error");
      setErr(msg);
      onError(msg);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" mobileSheet closeDisabled={enviando}>
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-base font-bold" style={{ color: "var(--text)" }}>{t("payment.title")}</h3>
          <button
            onClick={() => !enviando && onClose()}
            className="cursor-pointer rounded-lg border-none p-1.5"
            style={{ background: "var(--sunken)", color: "var(--text-muted)" }}
            aria-label={t("payment.cancel")}
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex items-baseline justify-between rounded-xl px-4 py-3" style={{ background: "var(--pos-weak)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--pos)" }}>{t("payment.total")}</span>
          <span className="mono text-2xl font-bold" style={{ color: "var(--pos)" }}>{money(total)}</span>
        </div>

        {err && (
          <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>{err}</div>
        )}

        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-1.5 p-0 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{t("payment.method")}</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FORMAS_PAGAMENTO.map((f) => {
              const Icone = ICONES[f];
              const ativo = forma === f;
              return (
                <button
                  key={f}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => { setForma(f); if (f !== "credito") setParcelas(1); }}
                  className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-bold transition-colors"
                  style={ativo
                    ? { background: "var(--pos-weak)", borderColor: "var(--pos)", color: "var(--pos)" }
                    : { background: "var(--sunken)", borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  <Icone size={20} />
                  {t(`payment.${f}`)}
                </button>
              );
            })}
          </div>
        </fieldset>

        {forma === "credito" && (
          <div className="space-y-1">
            <label htmlFor={parcId} className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{t("payment.installments")}</label>
            <select
              id={parcId}
              value={parcelas}
              onChange={(e) => setParcelas(Number(e.target.value))}
              className="w-full cursor-pointer rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              {Array.from({ length: MAX_PARCELAS }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n === 1 ? t("payment.inFull", { value: money(total) }) : t("payment.installmentOption", { n, value: money(total / n) })}
                </option>
              ))}
            </select>
            <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{t("payment.installmentsHint")}</p>
          </div>
        )}

        {forma === "dinheiro" && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor={recId} className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{t("payment.received")}</label>
              <MoneyInput
                id={recId}
                value={recebido}
                onValueChange={setRecebido}
                placeholder={total.toFixed(2).replace(".", ",")}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confirmar(); } }}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{t("payment.change")}</span>
              <div
                className="mono rounded-xl px-3.5 py-2.5 text-sm font-bold"
                style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: faltando ? "var(--neg)" : "var(--text)" }}
                aria-live="polite"
              >
                {faltando ? t("payment.missing", { value: money(total - valorRecebido) }) : money(Math.max(0, troco))}
              </div>
            </div>
          </div>
        )}

        <label
          htmlFor={caixaChkId}
          className="flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5"
          style={{ background: "var(--sunken)", border: "1px solid var(--border)" }}
        >
          <input
            id={caixaChkId}
            type="checkbox"
            checked={lancarNoCaixa}
            onChange={(e) => {
              setLancarNoCaixa(e.target.checked);
              try { localStorage.setItem(CAIXA_PREF_KEY, e.target.checked ? "1" : "0"); } catch { /* noop */ }
            }}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[var(--brand)]"
          />
          <span className="text-xs leading-snug">
            <span className="block font-semibold" style={{ color: "var(--text)" }}>{t("payment.cashflowToggle")}</span>
            <span style={{ color: "var(--text-subtle)" }}>{lancarNoCaixa ? t("payment.cashflowOn") : t("payment.cashflowOff")}</span>
          </span>
        </label>

        <Button onClick={confirmar} disabled={faltando} loading={enviando} icon={Check} variant="success" size="lg" className="w-full">
          {t("payment.confirm")}
        </Button>
      </div>
    </Modal>
  );
}
