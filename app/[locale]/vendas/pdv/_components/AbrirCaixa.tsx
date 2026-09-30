"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LockOpen, Printer, Store } from "lucide-react";
import { Button, Card, Input, MoneyInput, Pill, parseAmount } from "@/app/components/ui";
import { authedFetch } from "@/lib/authedFetch";
import { formatDateTime, formatMoney } from "@/lib/format";
import { localDateKey, type Caixa, type PdvVenda } from "@/lib/pdv";
import { PdvHeader } from "./PdvHeader";
import { usePinGate } from "./usePinGate";
import { imprimirRelatorioCaixa } from "./print";

/** Caixa fechado: abertura do turno (operador + troco inicial) e fechamentos anteriores. */
export function AbrirCaixa({
  nomeUsuario, authUid, ownerUid, fechados, recemFechadoId, empresa, onToast,
}: {
  nomeUsuario: string;
  authUid: string;
  ownerUid: string;
  fechados: Caixa[];
  recemFechadoId: string | null;
  empresa: string;
  onToast: (msg: string, type?: "success" | "error") => void;
}) {
  const t = useTranslations("vendas.pdv");
  const locale = useLocale();
  const [operador, setOperador] = useState(nomeUsuario);
  const [troco, setTroco] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState("");
  const pin = usePinGate(authUid, setErr);
  const recemFechado = recemFechadoId ? fechados.find((c) => c.id === recemFechadoId) ?? null : null;
  const opId = useId();
  const trocoId = useId();

  async function abrir() {
    setEnviando(true);
    setErr("");
    try {
      const res = await authedFetch("/api/vendas/caixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "abrir",
          operador: operador.trim(),
          trocoInicial: parseAmount(troco),
          date: localDateKey(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("open.error"));
      onToast(t("open.success"));
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : t("open.error"));
    } finally {
      setEnviando(false);
    }
  }

  async function imprimir(c: Caixa) {
    try {
      const { getFirebase } = await import("@/lib/firebase");
      const { db } = await getFirebase();
      const { collection, getDocs, query, where } = await import("firebase/firestore");
      const snap = await getDocs(query(collection(db, "users", ownerUid, "pdvVendas"), where("caixaId", "==", c.id)));
      const vendas = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PdvVenda));
      if (!imprimirRelatorioCaixa(c, vendas, empresa, t, locale)) onToast(t("popupBlocked"), "error");
    } catch (e) {
      console.error("Erro ao montar relatório do caixa:", e);
      onToast(t("report.error"), "error");
    }
  }

  return (
    <>
      <PdvHeader />

      {recemFechado && (
        <div
          role="status"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
          style={{ background: "var(--pos-weak)", border: "1px solid var(--pos)" }}
        >
          <div className="text-sm" style={{ color: "var(--text)" }}>
            <span className="font-bold">{t("closedBanner.title")}</span>{" "}
            {t("closedBanner.detail", {
              total: formatMoney(recemFechado.totalVendas, locale),
              diff: formatMoney(recemFechado.diferencaTotal ?? 0, locale),
            })}
          </div>
          <Button variant="success" icon={Printer} onClick={() => imprimir(recemFechado)}>{t("closedBanner.print")}</Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card padding="none" className="lg:col-span-2">
          <div className="space-y-4 p-5">
            <div className="flex items-center gap-2">
              <Store size={18} style={{ color: "var(--brand)" }} />
              <h2 className="font-display text-lg font-bold" style={{ color: "var(--text)" }}>{t("open.title")}</h2>
            </div>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("open.hint")}</p>

            {err && (
              <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>{err}</div>
            )}

            <div className="space-y-1">
              <label htmlFor={opId} className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{t("open.operator")}</label>
              <Input id={opId} value={operador} maxLength={60} onChange={(e) => setOperador(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label htmlFor={trocoId} className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{t("open.openingCash")}</label>
              <MoneyInput id={trocoId} value={troco} onValueChange={setTroco} />
              <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{t("open.openingCashHint")}</p>
            </div>

            <Button
              icon={LockOpen}
              size="lg"
              variant="success"
              className="w-full"
              loading={enviando}
              onClick={() => pin.pedir(t("open.pinTitle"), t("open.pinSubtitle"), abrir)}
            >
              {t("open.submit")}
            </Button>
          </div>
        </Card>

        <Card padding="none" className="lg:col-span-3">
          <div className="p-5">
            <h2 className="mb-3 font-display text-base font-bold" style={{ color: "var(--text)" }}>{t("history.title")}</h2>
            {fechados.length === 0 ? (
              <p className="py-6 text-center text-sm" style={{ color: "var(--text-subtle)" }}>{t("history.empty")}</p>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                {fechados.map((c) => {
                  const dif = c.diferencaTotal ?? 0;
                  return (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3" style={{ borderColor: "var(--border)" }}>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold" style={{ color: "var(--text)" }}>
                          {formatDateTime(c.openedAt, locale)} · {c.operador}
                        </div>
                        <div className="text-xs" style={{ color: "var(--text-subtle)" }}>
                          {t("history.line", { n: c.qtdVendas, total: formatMoney(c.totalVendas, locale) })}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Pill tone={dif === 0 ? "pos" : dif < 0 ? "neg" : "warn"}>
                          {dif === 0 ? t("history.balanced") : t("history.diff", { value: formatMoney(dif, locale) })}
                        </Pill>
                        <Button size="sm" variant="secondary" icon={Printer} onClick={() => imprimir(c)}>
                          {t("history.print")}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </div>

      {pin.modal}
    </>
  );
}
