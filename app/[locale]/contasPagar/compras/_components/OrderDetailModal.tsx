"use client";

// Detalhe do pedido para a EQUIPE: revisão de itens/valores/condições, ajuste
// (com reaprovação quando o pedido já estava aprovado), aprovar/recusar/
// cancelar/concluir, anexos, histórico de auditoria e a conversão em Contas a
// Pagar. Toda ação passa pela API — os botões aqui só refletem a mesma matriz
// de permissão que o servidor aplica (lib/compras/status).

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  CheckCircle2, XCircle, Ban, PlayCircle, Flag, Receipt, Paperclip, Download, Trash2, Edit3, Save, AlertTriangle, ExternalLink, History, Info,
} from "lucide-react";
import { Button, Field, Modal } from "@/app/components/ui";
import ConfirmModal from "@/app/components/ConfirmModal";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/format";
import { checkAction, type OrderAction } from "@/lib/compras/status";
import type { HistoryEvent, PurchaseOrderDoc, SupplierDoc } from "@/lib/compras/types";
import { OrderEditor, draftFromOrder, draftToPayload, type OrderDraft } from "@/app/components/compras/OrderEditor";
import { internalApi, downloadFile, uploadFile } from "@/app/components/compras/api";
import { StatusPill, errorText, fieldErrors, fmtCnpj, fmtDate, fmtDateTime, fmtSize, controlClass, controlStyle } from "@/app/components/compras/shared";

type Toast = (msg: string, type?: "success" | "error" | "warning" | "info") => void;
type StatusAction = "startReview" | "approve" | "reject" | "cancel" | "complete";

interface Props {
  ownerUid: string;
  order: PurchaseOrderDoc | null;
  supplier: SupplierDoc | null;
  canEdit: boolean;
  canApprove: boolean;
  onClose: () => void;
  onGenerateBills: (o: PurchaseOrderDoc) => void;
  toast: Toast;
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export function OrderDetailModal({ ownerUid, order, supplier, canEdit, canApprove, onClose, onGenerateBills, toast }: Props) {
  const t = useTranslations("compras");
  const tErr = useTranslations("compras.errors");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [internalNotes, setInternalNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<StatusAction | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState<(HistoryEvent & { id: string })[]>([]);
  const [waLink, setWaLink] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const orderId = order?.id;

  // Histórico (auditoria) em tempo real.
  useEffect(() => {
    if (!orderId || !ownerUid) return;
    let unsub: (() => void) | undefined;
    (async () => {
      const [{ getFirebase }, { collection, query, orderBy, onSnapshot }] = await Promise.all([import("@/lib/firebase"), import("firebase/firestore")]);
      const { db } = await getFirebase();
      unsub = onSnapshot(query(collection(db, "users", ownerUid, "purchaseOrders", orderId, "history"), orderBy("at", "desc")),
        (snap) => setHistory(snap.docs.map((d) => ({ ...(d.data() as HistoryEvent), id: d.id }))), () => undefined);
    })();
    return () => unsub?.();
  }, [orderId, ownerUid]);

  useEffect(() => {
    setEditing(false); setErrors({}); setWaLink(null); setConfirm(null); setReason("");
  }, [orderId]);

  if (!order) return null;
  const o = order;
  const actor = { canEdit, canApprove };
  const can = (a: OrderAction) => checkAction(a, actor, o).ok;
  const money = (n: number) => formatMoney(n, locale);

  function startEdit() {
    setDraft(draftFromOrder(o, today()));
    setInternalNotes(o.internalNotes ?? "");
    setErrors({});
    setEditing(true);
  }

  async function saveEdit() {
    if (!draft) return;
    setBusy("edit");
    setErrors({});
    try {
      const r = await internalApi<{ reapproval: boolean }>(`/orders/${o.id}`, {
        method: "PATCH", json: { data: draftToPayload(draft), internalNotes, expectedRevision: o.revision },
      });
      toast(r.reapproval ? t("order.reapprovalDone") : t("order.editSaved"), r.reapproval ? "warning" : "success");
      setEditing(false);
    } catch (err) {
      setErrors(fieldErrors(tErr, err));
      toast(errorText(tErr, err), "error");
    } finally {
      setBusy(null);
    }
  }

  async function runAction(action: StatusAction) {
    setBusy(action);
    setWaLink(null);
    try {
      const r = await internalApi<{ notified?: { email?: { status: string }; whatsapp?: { status: string; waLink?: string | null } } }>(`/orders/${o.id}`, {
        method: "POST", json: { action, reason: reason || undefined, expectedRevision: o.revision },
      });
      toast(t(`done.${action}`), "success");
      if (r.notified?.email && r.notified.email.status !== "sent") toast(t("done.notifyFailed"), "warning");
      if (r.notified?.whatsapp?.waLink) { setWaLink(r.notified.whatsapp.waLink); toast(t("done.whatsappFallback"), "info"); }
      setConfirm(null);
      setReason("");
    } catch (err) {
      toast(errorText(tErr, err), "error");
    } finally {
      setBusy(null);
    }
  }

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setBusy("upload");
    try {
      await uploadFile(`/api/compras/orders/${o.id}/attachments`, file, false);
      toast(t("order.uploaded"), "success");
    } catch (err) {
      toast(errorText(tErr, err), "error");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAttachment(id: string) {
    setBusy(`del-${id}`);
    try {
      await internalApi(`/orders/${o.id}/attachments?att=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (err) {
      toast(errorText(tErr, err), "error");
    } finally {
      setBusy(null);
    }
  }

  const needsReason = confirm === "reject" || confirm === "cancel";

  return (
    <>
      <Modal open onClose={() => !busy && onClose()} title={t("order.title", { number: o.numberLabel })} size="lg" closeDisabled={!!busy} mobileSheet>
        <div className="max-h-[78vh] space-y-5 overflow-y-auto px-5 py-4">
          {/* Cabeçalho */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={o.status} />
                <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("order.revision", { n: o.revision })}</span>
              </div>
              <p className="mt-1 font-semibold" style={{ color: "var(--text)" }}>{o.supplierName}</p>
              <p className="mono text-xs" style={{ color: "var(--text-subtle)" }}>
                {fmtCnpj(o.supplierCnpj)}{supplier?.email ? ` · ${supplier.email}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("totals.total")}</p>
              <p className="mono text-xl font-bold" style={{ color: "var(--text)" }}>{money(o.total)}</p>
            </div>
          </div>

          {/* Situação */}
          {o.approvedAt && o.approvedByName && (
            <Note tone="pos">{t("order.approvedBy", { name: o.approvedByName, date: fmtDateTime(o.approvedAt, locale) })}</Note>
          )}
          {o.status === "recusado" && (
            <Note tone="neg">
              {t("order.rejectedBy", { name: o.rejectedByName ?? "—", date: fmtDateTime(o.rejectedAt, locale) })}
              {o.rejectionReason ? ` — ${t("order.reason", { reason: o.rejectionReason })}` : ""}
            </Note>
          )}
          {o.status === "cancelado" && (
            <Note tone="neg">
              {t("order.cancelledBy", { name: o.cancelledByName ?? "—", date: fmtDateTime(o.cancelledAt, locale) })}
              {o.cancelReason ? ` — ${t("order.reason", { reason: o.cancelReason })}` : ""}
            </Note>
          )}
          {o.billLink ? (
            <Note tone="pos">
              {t("order.billGenerated", { count: o.billLink.billIds.length, date: fmtDate(o.billLink.createdAt, locale) })}{" "}
              <Link href="/contasPagar" className="inline-flex items-center gap-1 font-semibold underline">
                {t("order.openBills")} <ExternalLink size={12} />
              </Link>
            </Note>
          ) : (
            <Note tone="info">{t("order.noFinancial")}</Note>
          )}
          {waLink && (
            <a href={waLink} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold"
              style={{ background: "var(--pos)", color: "var(--on-accent)" }}>
              <ExternalLink size={13} /> {t("invite.openWhatsapp")}
            </a>
          )}

          {/* Itens / condições */}
          {editing && draft ? (
            <div className="space-y-3">
              {o.status === "aprovado" && (
                <Note tone="warn"><AlertTriangle size={14} className="mr-1 inline" />{t("order.reapprovalWarning")}</Note>
              )}
              <OrderEditor value={draft} onChange={setDraft} errors={errors} />
              <Field label={t("order.internalNotes")} hint={t("order.internalNotesHint")}>
                <textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} maxLength={2000} rows={2}
                  className={controlClass} style={{ ...controlStyle, resize: "vertical" }} />
              </Field>
            </div>
          ) : (
            <>
              <OrderEditor value={draftFromOrder(o, o.issueDate)} onChange={() => undefined} readOnly />
              {o.internalNotes && (
                <div className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--warn-weak)", color: "var(--text)" }}>
                  <span className="text-xs font-semibold" style={{ color: "var(--warn)" }}>{t("order.internalNotes")}: </span>
                  <span className="whitespace-pre-line">{o.internalNotes}</span>
                </div>
              )}
            </>
          )}

          {/* Anexos */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{t("order.attachments")}</h3>
              {can("internalAttach") && (
                <>
                  <input ref={fileRef} type="file" className="sr-only" id={`att-${o.id}`}
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.docx,.csv" onChange={(e) => onUpload(e.target.files?.[0])} />
                  <Button type="button" size="sm" variant="secondary" icon={Paperclip} loading={busy === "upload"}
                    onClick={() => fileRef.current?.click()} title={t("order.attachHint")}>
                    {busy === "upload" ? t("order.uploading") : t("order.attach")}
                  </Button>
                </>
              )}
            </div>
            {(o.attachments ?? []).length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("order.noAttachments")}</p>
            ) : (
              <ul className="space-y-1.5">
                {o.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--sunken)" }}>
                    <Paperclip size={14} style={{ color: "var(--text-subtle)" }} />
                    <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text)" }}>{a.name}</span>
                    <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
                      {fmtSize(a.size)} · {a.side === "supplier" ? t("order.fromSupplier") : t("order.fromTeam")}
                    </span>
                    <button type="button" className="cursor-pointer rounded p-1 hover:bg-[var(--surface)]" aria-label={`${t("actions.download")} ${a.name}`}
                      onClick={() => downloadFile(`/api/compras/orders/${o.id}/attachments?att=${a.id}`, a.name, false).catch((err) => toast(errorText(tErr, err), "error"))}>
                      <Download size={14} style={{ color: "var(--brand)" }} />
                    </button>
                    {a.side === "internal" && can("internalAttach") && (
                      <button type="button" className="cursor-pointer rounded p-1 hover:bg-[var(--neg-weak)]" aria-label={`${t("actions.remove")} ${a.name}`}
                        disabled={busy === `del-${a.id}`} onClick={() => removeAttachment(a.id)}>
                        <Trash2 size={14} style={{ color: "var(--neg)" }} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Histórico */}
          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
              <History size={13} /> {t("order.history")}
            </h3>
            <ol className="space-y-2 border-l-2 pl-4" style={{ borderColor: "var(--border)" }}>
              {history.map((h) => (
                <li key={h.id} className="text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold" style={{ color: "var(--text)" }}>{t(`historyTypes.${h.type}`)}</span>
                    <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
                      {fmtDateTime(h.at, locale)} · {h.actorName} ({t(`side.${h.actorSide}`)})
                    </span>
                  </div>
                  {h.reason && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{t("order.reason", { reason: h.reason })}</p>}
                  {h.detail && <p className="text-xs" style={{ color: "var(--text-muted)" }}>{h.detail}</p>}
                  {h.changes && h.changes.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {h.changes.slice(0, 8).map((c, i) => (
                        <li key={i} className="mono break-words text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {c.field}: <span style={{ textDecoration: "line-through" }}>{c.from || "∅"}</span> → {c.to || "∅"}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* Ações */}
        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          {editing ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)} disabled={!!busy}>{t("order.cancelEdit")}</Button>
              <Button type="button" icon={Save} loading={busy === "edit"} onClick={saveEdit}>{t("order.saveEdit")}</Button>
            </>
          ) : (
            <>
              {can("internalEdit") && <Button type="button" variant="secondary" icon={Edit3} onClick={startEdit}>{t("order.edit")}</Button>}
              {can("cancel") && <Button type="button" variant="danger" icon={Ban} onClick={() => setConfirm("cancel")}>{t("actions.cancel")}</Button>}
              {can("reject") && <Button type="button" variant="danger" icon={XCircle} onClick={() => setConfirm("reject")}>{t("actions.reject")}</Button>}
              {can("startReview") && (
                <Button type="button" variant="secondary" icon={PlayCircle} loading={busy === "startReview"} onClick={() => runAction("startReview")}>
                  {t("actions.startReview")}
                </Button>
              )}
              {can("complete") && <Button type="button" variant="secondary" icon={Flag} onClick={() => setConfirm("complete")}>{t("actions.complete")}</Button>}
              {can("approve") && <Button type="button" variant="success" icon={CheckCircle2} onClick={() => setConfirm("approve")}>{t("actions.approve")}</Button>}
              {can("generateBills") && <Button type="button" icon={Receipt} onClick={() => onGenerateBills(o)}>{t("actions.generateBills")}</Button>}
            </>
          )}
        </div>
      </Modal>

      {/* Aprovar / concluir: confirmação simples */}
      <ConfirmModal
        open={confirm === "approve" || confirm === "complete"}
        title={confirm === "complete" ? t("confirm.completeTitle", { number: o.numberLabel }) : t("confirm.approveTitle", { number: o.numberLabel })}
        message={confirm === "complete" ? t("confirm.completeBody") : t("confirm.approveBody", { total: money(o.total) })}
        confirmText={t("confirm.confirm")}
        cancelText={t("confirm.back")}
        loading={busy === confirm}
        onConfirm={() => confirm && runAction(confirm)}
        onCancel={() => setConfirm(null)}
      />

      {/* Recusar / cancelar: motivo obrigatório */}
      <Modal open={needsReason} onClose={() => !busy && setConfirm(null)} size="sm"
        title={confirm === "reject" ? t("confirm.rejectTitle", { number: o.numberLabel }) : t("confirm.cancelTitle", { number: o.numberLabel })}>
        <div className="space-y-3 px-5 py-4">
          <Field label={t("confirm.reasonLabel")} hint={<span className="inline-flex items-center gap-1"><Info size={11} />{t("confirm.reasonPlaceholder")}</span>}>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
              className={controlClass} style={{ ...controlStyle, resize: "vertical" }} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button type="button" variant="ghost" onClick={() => setConfirm(null)} disabled={!!busy}>{t("confirm.back")}</Button>
          <Button type="button" variant="danger" disabled={reason.trim().length < 3} loading={busy === confirm}
            onClick={() => confirm && runAction(confirm)}>
            {t("confirm.confirm")}
          </Button>
        </div>
      </Modal>
    </>
  );
}

function Note({ tone, children }: { tone: "pos" | "neg" | "warn" | "info"; children: React.ReactNode }) {
  const bg = tone === "info" ? "var(--brand-weak)" : `var(--${tone}-weak)`;
  const fg = tone === "info" ? "var(--brand)" : `var(--${tone})`;
  return <div className="rounded-lg px-3 py-2 text-[13px]" style={{ background: bg, color: fg }}>{children}</div>;
}
