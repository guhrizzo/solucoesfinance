"use client";

import { useLocale, useTranslations } from "next-intl";
import { CheckCircle2, Plus, Printer } from "lucide-react";
import { Button, Modal } from "@/app/components/ui";
import { formatMoney, formatNumber } from "@/lib/format";
import type { PdvVenda } from "@/lib/pdv";
import { formaLabel } from "./print";

/** Venda concluída: resumo (o "relatório" da venda), imprimir comprovante e seguir pra próxima. */
export function ComprovanteModal({
  venda, onPrint, onClose,
}: {
  venda: PdvVenda | null;
  onPrint: (v: PdvVenda) => void;
  onClose: () => void;
}) {
  const t = useTranslations("vendas.pdv");
  const locale = useLocale();
  const money = (n: number) => formatMoney(n, locale);
  if (!venda) return null;

  return (
    <Modal open={!!venda} onClose={onClose} size="md" mobileSheet>
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={20} style={{ color: "var(--pos)" }} />
          <h3 className="font-display text-base font-bold" style={{ color: "var(--text)" }}>
            {t("receipt.done", { n: venda.numero })}
          </h3>
        </div>

        <div className="max-h-64 overflow-y-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
          <table className="w-full text-sm">
            <tbody>
              {venda.itens.map((it, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td className="px-3 py-2" style={{ color: "var(--text)" }}>
                    {it.descricao}
                    <div className="mono text-[11px]" style={{ color: "var(--text-subtle)" }}>
                      {formatNumber(it.quantidade, locale, { maximumFractionDigits: 3 })} {it.unidade} × {money(it.precoUnitario)}
                    </div>
                  </td>
                  <td className="mono px-3 py-2 text-right font-semibold" style={{ color: "var(--text)" }}>{money(it.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt style={{ color: "var(--text-muted)" }}>{t("receipt.payment")}</dt>
            <dd className="font-semibold" style={{ color: "var(--text)" }}>{formaLabel(t, venda.forma, venda.parcelas)}</dd>
          </div>
          {venda.forma === "credito" && venda.parcelas > 1 && (
            <div className="flex justify-between">
              <dt style={{ color: "var(--text-muted)" }}>{t("receipt.installmentValue")}</dt>
              <dd className="mono" style={{ color: "var(--text)" }}>{venda.parcelas} × {money(venda.total / venda.parcelas)}</dd>
            </div>
          )}
          {venda.forma === "dinheiro" && (
            <>
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-muted)" }}>{t("receipt.received")}</dt>
                <dd className="mono" style={{ color: "var(--text)" }}>{money(venda.valorRecebido)}</dd>
              </div>
              <div className="flex justify-between">
                <dt style={{ color: "var(--text-muted)" }}>{t("receipt.change")}</dt>
                <dd className="mono font-bold" style={{ color: "var(--warn)" }}>{money(venda.troco)}</dd>
              </div>
            </>
          )}
          <div className="flex items-baseline justify-between pt-1" style={{ borderTop: "1px solid var(--border)" }}>
            <dt className="font-bold" style={{ color: "var(--text)" }}>{t("receipt.total")}</dt>
            <dd className="mono text-xl font-bold" style={{ color: "var(--pos)" }}>{money(venda.total)}</dd>
          </div>
        </dl>

        {!venda.lancarNoCaixa && (
          <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{t("receipt.offCashflow")}</p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={Printer} onClick={() => onPrint(venda)}>{t("receipt.print")}</Button>
          <Button variant="success" icon={Plus} onClick={onClose}>{t("receipt.next")}</Button>
        </div>
      </div>
    </Modal>
  );
}
