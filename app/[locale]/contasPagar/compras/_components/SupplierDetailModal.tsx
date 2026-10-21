"use client";

// Ficha do fornecedor: dados, acesso ao portal (convite por e-mail/WhatsApp,
// revogação) e histórico de pedidos.

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Edit3, ExternalLink, Mail, MessageCircle, Send, ShieldOff } from "lucide-react";
import { Button, Modal, Pill } from "@/app/components/ui";
import ConfirmModal from "@/app/components/ConfirmModal";
import { formatMoney } from "@/lib/format";
import { maskCep, maskPhone } from "@/lib/compras/validate";
import type { NotificationStatus, PurchaseOrderDoc, SupplierDoc } from "@/lib/compras/types";
import { internalApi } from "@/app/components/compras/api";
import { StatusPill, errorText, fmtCnpj, fmtDate, fmtDateTime } from "@/app/components/compras/shared";
import { PORTAL_TONE } from "./SuppliersTab";

interface ChannelResult { status: NotificationStatus; error?: string | null; waLink?: string | null }

interface Props {
  supplier: SupplierDoc | null;
  orders: PurchaseOrderDoc[];
  canEdit: boolean;
  canApprove: boolean;
  onClose: () => void;
  onEdit: (s: SupplierDoc) => void;
  onOpenOrder: (o: PurchaseOrderDoc) => void;
  toast: (msg: string, type?: "success" | "error" | "warning" | "info") => void;
}

export function SupplierDetailModal({ supplier, orders, canEdit, canApprove, onClose, onEdit, onOpenOrder, toast }: Props) {
  const t = useTranslations("compras");
  const tErr = useTranslations("compras.errors");
  const locale = useLocale();
  const [inviting, setInviting] = useState(false);
  const [channels, setChannels] = useState<{ email: boolean; whatsapp: boolean }>({ email: true, whatsapp: false });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ email: ChannelResult | null; whatsapp: ChannelResult | null } | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    setInviting(false);
    setResult(null);
    setChannels({ email: true, whatsapp: !!supplier?.whatsapp });
  }, [supplier?.id, supplier?.whatsapp]);

  if (!supplier) return null;
  const s = supplier;
  const portal = s.portal?.status ?? "none";
  const name = s.nomeFantasia || s.razaoSocial;
  const myOrders = orders.filter((o) => o.supplierId === s.id);

  async function sendInvite() {
    setSending(true);
    setResult(null);
    try {
      const r = await internalApi<{ email: ChannelResult | null; whatsapp: ChannelResult | null }>(`/suppliers/${s.id}/invite`, {
        method: "POST",
        json: { channels: [channels.email && "email", channels.whatsapp && "whatsapp"].filter(Boolean) },
      });
      setResult({ email: r.email, whatsapp: r.whatsapp });
      toast(t("invite.done"), r.email?.status === "failed" ? "warning" : "success");
    } catch (err) {
      toast(errorText(tErr, err), "error");
    } finally {
      setSending(false);
    }
  }

  async function revoke() {
    setRevoking(true);
    try {
      await internalApi(`/suppliers/${s.id}`, { method: "PATCH", json: { action: "revokePortal" } });
      toast(t("supplier.revoked"), "success");
      setConfirmRevoke(false);
    } catch (err) {
      toast(errorText(tErr, err), "error");
    } finally {
      setRevoking(false);
    }
  }

  const info: [string, string][] = [
    [t("supplier.fields.razaoSocial"), s.razaoSocial],
    [t("supplier.fields.cnpj"), fmtCnpj(s.cnpj)],
    [t("supplier.fields.ie"), s.ie || "—"],
    [t("supplier.fields.categoria"), s.categoria],
    [t("supplier.fields.responsavel"), s.responsavel],
    [t("supplier.fields.email"), s.email],
    [t("supplier.fields.telefone"), maskPhone(s.telefone)],
    [t("supplier.fields.whatsapp"), s.whatsapp ? maskPhone(s.whatsapp) : "—"],
    [t("supplier.steps.address"), [
      `${s.endereco.logradouro}, ${s.endereco.numero}${s.endereco.complemento ? ` — ${s.endereco.complemento}` : ""}`,
      [s.endereco.bairro, `${s.endereco.cidade}/${s.endereco.uf}`, maskCep(s.endereco.cep)].filter(Boolean).join(" · "),
    ].join("\n")],
  ];

  return (
    <>
      <Modal open onClose={onClose} title={name} size="lg" mobileSheet>
        <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={s.status === "ativo" ? "pos" : "muted"} dot>{t(`supplierStatus.${s.status}`)}</Pill>
            <Pill tone={PORTAL_TONE[portal]} dot>{t(`portalStatus.${portal}`)}</Pill>
            {canEdit && (
              <Button type="button" size="sm" variant="secondary" icon={Edit3} className="ml-auto" onClick={() => onEdit(s)}>
                {t("supplier.edit")}
              </Button>
            )}
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
            {info.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{k}</dt>
                <dd className="whitespace-pre-line break-words text-sm" style={{ color: "var(--text)" }}>{v}</dd>
              </div>
            ))}
          </dl>
          {s.observacoes && (
            <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--warn-weak)", color: "var(--text)" }}>
              <span className="text-xs font-semibold" style={{ color: "var(--warn)" }}>{t("supplier.fields.observacoes")}: </span>
              <span className="whitespace-pre-line">{s.observacoes}</span>
            </div>
          )}

          {/* Portal */}
          <section className="space-y-3 rounded-xl p-4" style={{ background: "var(--sunken)", border: "1px solid var(--border)" }}>
            <h3 className="font-display text-sm font-bold" style={{ color: "var(--text)" }}>{t("supplier.portalTitle")}</h3>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("supplier.portalDesc")}</p>
            {portal === "invited" && s.portal.inviteExpiresAt && (
              <p className="text-xs font-semibold" style={{ color: "var(--brand)" }}>{t("supplier.inviteExpires", { date: fmtDateTime(s.portal.inviteExpiresAt, locale) })}</p>
            )}
            {portal === "active" && s.portal.activatedAt && (
              <p className="text-xs font-semibold" style={{ color: "var(--pos)" }}>{t("supplier.activeSince", { date: fmtDate(s.portal.activatedAt, locale) })}</p>
            )}
            {s.status !== "ativo" && <p className="text-xs" style={{ color: "var(--warn)" }}>{t("supplier.inactiveHint")}</p>}

            <div className="flex flex-wrap gap-2">
              {canEdit && portal !== "active" && s.status === "ativo" && !inviting && (
                <Button type="button" size="sm" icon={Send} onClick={() => setInviting(true)}>
                  {portal === "invited" ? t("supplier.reinvite") : t("supplier.invite")}
                </Button>
              )}
              {canApprove && (portal === "active" || portal === "invited") && (
                <Button type="button" size="sm" variant="danger" icon={ShieldOff} onClick={() => setConfirmRevoke(true)}>
                  {t("supplier.revoke")}
                </Button>
              )}
            </div>

            {inviting && (
              <div className="space-y-3 rounded-lg p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{t("invite.title", { name })}</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("invite.desc")}</p>
                <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
                  <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={channels.email}
                    onChange={(e) => setChannels((c) => ({ ...c, email: e.target.checked }))} />
                  <Mail size={14} /> {t("invite.channelEmail", { email: s.email })}
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm" style={{ color: s.whatsapp ? "var(--text)" : "var(--text-subtle)" }}>
                  <input type="checkbox" className="h-4 w-4 accent-[var(--brand)]" checked={channels.whatsapp} disabled={!s.whatsapp}
                    onChange={(e) => setChannels((c) => ({ ...c, whatsapp: e.target.checked }))} />
                  <MessageCircle size={14} /> {s.whatsapp ? t("invite.channelWhatsapp", { phone: maskPhone(s.whatsapp) }) : t("invite.noWhatsapp")}
                </label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setInviting(false); setResult(null); }}>{t("confirm.back")}</Button>
                  <Button type="button" size="sm" icon={Send} loading={sending} disabled={!channels.email && !channels.whatsapp} onClick={sendInvite}>
                    {t("invite.send")}
                  </Button>
                </div>
                {result && (
                  <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--border)" }} role="status">
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{t("invite.resultTitle")}</p>
                    {result.email && <ResultRow label={t("log.channels.email")} r={result.email} t={t} />}
                    {result.whatsapp && <ResultRow label={t("log.channels.whatsapp")} r={result.whatsapp} t={t} />}
                    {result.whatsapp?.waLink && (
                      <>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("invite.fallbackHint")}</p>
                        <a href={result.whatsapp.waLink} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold"
                          style={{ background: "var(--pos)", color: "var(--on-accent)" }}>
                          <ExternalLink size={13} /> {t("invite.openWhatsapp")}
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Histórico de pedidos */}
          <section className="space-y-2">
            <h3 className="font-display text-sm font-bold" style={{ color: "var(--text)" }}>{t("supplier.orderHistory")}</h3>
            {myOrders.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("supplier.noOrders")}</p>
            ) : (
              <ul className="divide-y rounded-xl" style={{ border: "1px solid var(--border)", borderColor: "var(--border)" }}>
                {myOrders.map((o) => (
                  <li key={o.id}>
                    <button type="button" onClick={() => onOpenOrder(o)}
                      className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--sunken)]">
                      <span className="mono text-xs font-semibold" style={{ color: "var(--text-muted)" }}>{o.numberLabel}</span>
                      <span className="flex-1 text-xs" style={{ color: "var(--text-subtle)" }}>{fmtDate(o.issueDate, locale)}</span>
                      <StatusPill status={o.status} />
                      <span className="mono text-sm font-semibold" style={{ color: "var(--text)" }}>{formatMoney(o.total, locale)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmRevoke}
        title={t("supplier.revokeConfirmTitle")}
        message={t("supplier.revokeConfirmBody", { name })}
        confirmText={t("supplier.revoke")}
        isDangerous
        loading={revoking}
        onConfirm={revoke}
        onCancel={() => setConfirmRevoke(false)}
      />
    </>
  );
}

function ResultRow({ label, r, t }: { label: string; r: ChannelResult; t: ReturnType<typeof useTranslations> }) {
  const tone = r.status === "sent" ? "pos" : r.status === "fallback_link" ? "warn" : "neg";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span style={{ color: "var(--text)" }}>{label}</span>
      <Pill tone={tone} dot>{t(`invite.result.${r.status}`)}</Pill>
      {r.error && r.status !== "sent" && <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{r.error}</span>}
    </div>
  );
}
