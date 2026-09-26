"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Check, ShoppingCart, X } from "lucide-react";
import { Button, Modal, MoneyInput, parseAmount } from "@/app/components/ui";
import PinModal from "@/app/components/PinModal";
import { loadPinHash, verifyPin, getPinLockStatus } from "@/app/hooks/usePin";
import { authedFetch } from "@/lib/authedFetch";
import {
  CANAL_INFO, SHEIN_UI_VISIVEL, SHOPEE_UI_VISIVEL, TIKTOKSHOP_UI_VISIVEL, toBRL,
  type Canal, type ProdutoEstoque,
} from "./shared";

// ─── Modal "Nova venda" ──────────────────────────────────────────────────────
//
// Registra à mão uma venda de um produto do estoque (integrado ao marketplace
// ou cadastrado manualmente). Pede o PIN e chama POST /api/vendas, que lança a
// ENTRADA no Fluxo de Caixa e baixa/propaga o estoque pros canais vinculados.

export function NovaVendaModal({
  open, onClose, produtos, authUid, canaisConectados, onDone,
}: {
  open: boolean;
  onClose: () => void;
  produtos: ProdutoEstoque[];
  authUid: string | null;
  canaisConectados: { mercadolivre: boolean; shopee: boolean; tiktokshop: boolean; shein: boolean };
  onDone: (msg: string, type: "success" | "error") => void;
}) {
  const t = useTranslations("vendas.newSale");
  const tPin = useTranslations("common.pin");
  const locale = useLocale();

  const [sku, setSku] = useState("");
  const [channel, setChannel] = useState<Canal>("manual");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [err, setErr] = useState("");

  const skuId = useId();
  const qtyId = useId();
  const priceId = useId();

  const canais: Canal[] = [
    "manual",
    ...(canaisConectados.mercadolivre ? (["mercadolivre"] as Canal[]) : []),
    ...(canaisConectados.shopee && SHOPEE_UI_VISIVEL ? (["shopee"] as Canal[]) : []),
    ...(canaisConectados.tiktokshop && TIKTOKSHOP_UI_VISIVEL ? (["tiktokshop"] as Canal[]) : []),
    ...(canaisConectados.shein && SHEIN_UI_VISIVEL ? (["shein"] as Canal[]) : []),
  ];

  const produto = produtos.find((p) => p.sku === sku) ?? null;
  const qtyNum = Math.max(1, parseInt(qty) || 1);
  const priceNum = parseAmount(price);
  const canSave = !!produto && qtyNum >= 1 && priceNum > 0 && !submitting;
  const semEstoque = !!produto && qtyNum > (produto.quantity || 0);

  useEffect(() => {
    if (!open) return;
    const first = produtos[0];
    setSku(first?.sku ?? "");
    setChannel("manual");
    setQty("1");
    setPrice(first ? (Number(first.price) || 0).toFixed(2).replace(".", ",") : "");
    setSubmitting(false);
    setPinOpen(false);
    setErr("");
  }, [open, produtos]);

  const onSkuChange = (next: string) => {
    setSku(next);
    const p = produtos.find((x) => x.sku === next);
    if (p) setPrice((Number(p.price) || 0).toFixed(2).replace(".", ","));
  };

  async function requestPin() {
    if (!canSave || !produto) return;
    if (!authUid) { setErr(tPin("notConfigured")); return; }
    const hash = await loadPinHash(authUid);
    if (!hash) { setErr(tPin("notConfigured")); return; }
    setErr("");
    setPinOpen(true);
  }

  async function handlePinSuccess(pin: string) {
    if (!authUid || !produto) return;
    const result = await verifyPin(authUid, pin);
    if (result === "locked" || (result === "wrong" && getPinLockStatus().locked)) {
      setPinOpen(false); setErr(tPin("lockedRetry")); return;
    }
    if (result === "wrong") {
      (window as unknown as { __pinModalShake?: (m: string) => void }).__pinModalShake?.(tPin("wrong"));
      return;
    }
    if (result === "no_pin") { setPinOpen(false); setErr(tPin("notConfigured")); return; }

    // result === "ok"
    setPinOpen(false);
    setSubmitting(true);
    setErr("");
    try {
      const res = await authedFetch("/api/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: produto.sku,
          productName: produto.name || produto.sku,
          channel,
          quantity: qtyNum,
          unitPrice: priceNum,
          orderId: `manual-${(crypto as Crypto).randomUUID()}`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("errorGeneric"));
      onDone(
        t("success", { qty: qtyNum, name: produto.name || produto.sku }),
        "success"
      );
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : t("errorGeneric");
      setErr(msg);
      onDone(msg, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} size="sm" mobileSheet closeDisabled={submitting}>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} style={{ color: "var(--pos)" }} />
              <h3 className="font-display font-bold text-base" style={{ color: "var(--text)" }}>{t("title")}</h3>
            </div>
            <button
              onClick={() => !submitting && onClose()}
              className="p-1.5 rounded-lg cursor-pointer border-none"
              style={{ background: "var(--sunken)", color: "var(--text-muted)" }}
              aria-label={t("cancel")}
            >
              <X size={15} />
            </button>
          </div>

          <p className="text-[11px] leading-relaxed rounded-xl px-3 py-2.5" style={{ background: "var(--pos-weak)", color: "var(--pos)" }}>
            {t("hint")}
          </p>

          {err && (
            <div className="rounded-xl px-3 py-2.5 text-xs" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>
              {err}
            </div>
          )}

          {/* Produto */}
          <div className="space-y-1">
            <label htmlFor={skuId} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{t("product")}</label>
            <select
              id={skuId}
              value={sku}
              onChange={(e) => onSkuChange(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-xs outline-none cursor-pointer"
              style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              {produtos.length === 0 && <option value="">{t("noProducts")}</option>}
              {produtos.map((p) => (
                <option key={p.id} value={p.sku}>
                  {t("productOption", { name: p.name, sku: p.sku, qty: p.quantity })}
                </option>
              ))}
            </select>
          </div>

          {/* Canal — só aparece se houver marketplace conectado */}
          {canais.length > 1 && (
            <fieldset className="space-y-1 border-0 p-0 m-0 min-w-0">
              <legend className="text-[10px] font-bold uppercase tracking-wider p-0" style={{ color: "var(--text-subtle)" }}>{t("channel")}</legend>
              <div className="flex flex-wrap gap-2">
                {canais.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    className="px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-all"
                    style={channel === c
                      ? { background: "var(--pos-weak)", borderColor: "var(--pos)", color: "var(--pos)" }
                      : { background: "var(--sunken)", borderColor: "var(--border)", color: "var(--text-muted)" }}
                  >
                    {c === "manual" ? t("channelManual") : CANAL_INFO[c].label}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {/* Quantidade + Preço */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor={qtyId} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{t("quantity")}</label>
              <input
                id={qtyId}
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-xs outline-none mono"
                style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor={priceId} className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{t("unitPrice")}</label>
              <MoneyInput
                id={priceId}
                value={price}
                onValueChange={setPrice}
                style={{ background: "var(--sunken)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </div>
          </div>

          {produto && (
            <div className="flex items-center justify-between text-xs pt-1" style={{ color: "var(--text-muted)" }}>
              <span>{t("totalLabel")}</span>
              <span className="mono font-bold" style={{ color: "var(--pos)" }}>{toBRL(priceNum * qtyNum, locale)}</span>
            </div>
          )}
          {semEstoque && (
            <p className="text-[11px] flex items-center gap-1" style={{ color: "var(--warn)" }}>
              <AlertTriangle size={12} /> {t("lowStockWarn", { available: produto?.quantity ?? 0 })}
            </p>
          )}

          <Button onClick={requestPin} disabled={!canSave} loading={submitting} icon={Check} variant="success" size="lg" className="w-full">
            {t("submit")}
          </Button>
        </div>
      </Modal>

      <PinModal
        open={pinOpen}
        title={t("pinTitle")}
        subtitle={t("pinSubtitle")}
        onClose={() => setPinOpen(false)}
        onSuccess={handlePinSuccess}
      />
    </>
  );
}
