"use client";

export const dynamic = "force-dynamic";

// Portal do fornecedor — pedido: edição do rascunho (itens, descontos,
// impostos/custos, condições, observações, anexos), envio para análise
// (idempotente) e acompanhamento do status depois de enviado.

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Save, Send, Ban, Paperclip, Download, Trash2, Check, Circle, XCircle } from "lucide-react";
import { Button, Card, Field, Modal } from "@/app/components/ui";
import ConfirmModal from "@/app/components/ConfirmModal";
import { useToast } from "@/app/components/useToast";
import { ToastContainer } from "@/app/components/ToastContainer";
import { Link } from "@/i18n/navigation";
import { formatMoney } from "@/lib/format";
import type { SupplierOrderView } from "@/lib/compras/service";
import { PortalShell } from "@/app/components/compras/PortalShell";
import { usePortalSession } from "@/app/components/compras/usePortalSession";
import { OrderEditor, draftFromOrder, draftToPayload, previewTotals, type OrderDraft } from "@/app/components/compras/OrderEditor";
import { downloadFile, newRequestKey, portalApi, uploadFile } from "@/app/components/compras/api";
import { StatusPill, errorText, fieldErrors, fmtDateTime, fmtSize, controlClass, controlStyle } from "@/app/components/compras/shared";

export default function FornecedorPedido() {
  const session = usePortalSession();
  return (
    <PortalShell session={session}>
      {session.state === "ready" && <OrderView />}
    </PortalShell>
  );
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

function OrderView() {
  const t = useTranslations("compras");
  const tErr = useTranslations("compras.errors");
  const locale = useLocale();
  const { id } = useParams<{ id: string }>();
  const { toasts, show, remove } = useToast();
  const [order, setOrder] = useState<SupplierOrderView | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [draft, setDraft] = useState<OrderDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const submitKey = useRef<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await portalApi<{ order: SupplierOrderView }>(`/orders/${encodeURIComponent(id)}`);
      setOrder(r.order);
      setDraft(draftFromOrder(r.order, today()));
      setDirty(false);
    } catch {
      setNotFound(true);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Aviso ao sair com alteração não salva.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  if (notFound) {
    return (
      <Card className="mx-auto mt-10 max-w-md space-y-3 text-center" padding="lg">
        <p style={{ color: "var(--text)" }}>{t("order.notFound")}</p>
        <Link href="/fornecedor" className="text-sm font-semibold" style={{ color: "var(--brand)" }}>{t("portal.order.back")}</Link>
      </Card>
    );
  }
  if (!order || !draft) return <p className="py-10 text-center text-sm" style={{ color: "var(--text-muted)" }}>…</p>;

  const o = order;
  const isDraft = o.status === "rascunho";
  const canCancel = o.status === "rascunho" || o.status === "enviado";

  async function save(silent = false): Promise<boolean> {
    if (!draft) return false;
    setBusy("save");
    setErrors({});
    try {
      await portalApi(`/orders/${o.id}`, { method: "PATCH", json: { data: draftToPayload(draft) } });
      if (!silent) show(t("portal.order.saved"), "success");
      await load();
      return true;
    } catch (err) {
      setErrors(fieldErrors(tErr, err));
      show(errorText(tErr, err), "error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    // Mesma chave enquanto a tela estiver aberta: reenvio/clique duplo não duplica.
    if (!submitKey.current) submitKey.current = newRequestKey();
    setBusy("submit");
    try {
      if (dirty && !(await save(true))) { setBusy(null); setConfirmSubmit(false); return; }
      setBusy("submit");
      const r = await portalApi<{ already: boolean }>(`/orders/${o.id}`, { method: "POST", json: { action: "submit", submitKey: submitKey.current } });
      show(r.already ? t("portal.order.alreadySubmitted") : t("portal.order.submitted"), "success");
      setConfirmSubmit(false);
      await load();
    } catch (err) {
      setErrors(fieldErrors(tErr, err));
      show(errorText(tErr, err), "error");
      setConfirmSubmit(false);
    } finally {
      setBusy(null);
    }
  }

  async function cancelOrder() {
    setBusy("cancel");
    try {
      await portalApi(`/orders/${o.id}`, { method: "POST", json: { action: "cancel", reason } });
      show(t("portal.order.cancelled"), "success");
      setCancelOpen(false);
      setReason("");
      await load();
    } catch (err) {
      show(errorText(tErr, err), "error");
    } finally {
      setBusy(null);
    }
  }

  async function onUpload(file: File | undefined) {
    if (!file) return;
    setBusy("upload");
    try {
      await uploadFile(`/api/compras/portal/orders/${o.id}/attachments`, file, true);
      show(t("order.uploaded"), "success");
      const r = await portalApi<{ order: SupplierOrderView }>(`/orders/${o.id}`);
      setOrder(r.order); // mantém o rascunho em edição; só atualiza a lista de anexos
    } catch (err) {
      show(errorText(tErr, err), "error");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removeAtt(attId: string) {
    setBusy(`del-${attId}`);
    try {
      await portalApi(`/orders/${o.id}/attachments?att=${encodeURIComponent(attId)}`, { method: "DELETE" });
      const r = await portalApi<{ order: SupplierOrderView }>(`/orders/${o.id}`);
      setOrder(r.order);
    } catch (err) {
      show(errorText(tErr, err), "error");
    } finally {
      setBusy(null);
    }
  }

  const steps: { key: string; at: number | null; done: boolean; bad?: boolean }[] = [
    { key: "created", at: o.createdAt, done: true },
    { key: "submitted", at: o.submittedAt, done: !!o.submittedAt },
    { key: "review", at: o.reviewStartedAt, done: !!o.reviewStartedAt || ["aprovado", "recusado", "concluido"].includes(o.status) },
    o.status === "recusado"
      ? { key: "rejected", at: o.rejectedAt, done: true, bad: true }
      : o.status === "cancelado"
        ? { key: "cancelled", at: o.cancelledAt, done: true, bad: true }
        : { key: "approved", at: o.approvedAt, done: !!o.approvedAt },
    ...(o.status === "concluido" ? [{ key: "completed", at: o.completedAt, done: true }] : []),
  ];

  const total = isDraft ? previewTotals(draft).total : o.total;

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={remove} />
      <Link href="/fornecedor" className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={13} /> {t("portal.order.back")}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-bold" style={{ color: "var(--text)" }}>{t("order.title", { number: o.numberLabel })}</h1>
            <StatusPill status={o.status} />
          </div>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>{isDraft ? t("portal.order.draftHint") : t("portal.order.readonly")}</p>
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{t("totals.total")}</p>
          <p className="mono text-2xl font-bold" style={{ color: "var(--text)" }}>{formatMoney(total, locale)}</p>
        </div>
      </div>

      {/* Andamento */}
      <Card padding="sm">
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{t("portal.order.timeline")}</h2>
        <ol className="flex flex-col gap-2 sm:flex-row sm:gap-0">
          {steps.map((s, i) => (
            <li key={s.key} className="flex flex-1 items-center gap-2 sm:flex-col sm:items-start sm:gap-1 sm:px-1">
              <div className="flex items-center gap-2 sm:w-full">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{ background: s.bad ? "var(--neg)" : s.done ? "var(--pos)" : "var(--sunken)", color: s.done ? "var(--on-accent)" : "var(--text-subtle)" }}>
                  {s.bad ? <XCircle size={13} /> : s.done ? <Check size={13} /> : <Circle size={10} />}
                </span>
                {i < steps.length - 1 && <span className="hidden h-0.5 flex-1 sm:block" style={{ background: s.done ? "var(--pos)" : "var(--border)" }} />}
              </div>
              <div>
                <p className="text-xs font-semibold" style={{ color: s.done ? "var(--text)" : "var(--text-subtle)" }}>{t(`portal.timeline.${s.key}`)}</p>
                {s.at ? <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>{fmtDateTime(s.at, locale)}</p> : null}
              </div>
            </li>
          ))}
        </ol>
        {o.rejectionReason && (
          <p className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--neg-weak)", color: "var(--neg)" }}>
            <strong>{t("portal.order.rejectionReason")}:</strong> {o.rejectionReason}
          </p>
        )}
        {o.cancelReason && (
          <p className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: "var(--sunken)", color: "var(--text-muted)" }}>
            <strong>{t("portal.order.cancelReason")}:</strong> {o.cancelReason}
          </p>
        )}
      </Card>

      <Card>
        <OrderEditor value={draft} readOnly={!isDraft} errors={errors} onChange={(d) => { setDraft(d); setDirty(true); }} />
      </Card>

      {/* Anexos */}
      <Card className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>{t("order.attachments")}</h2>
          {isDraft && (
            <>
              <input ref={fileRef} type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.docx,.csv"
                onChange={(e) => onUpload(e.target.files?.[0])} aria-label={t("order.attach")} />
              <Button type="button" size="sm" variant="secondary" icon={Paperclip} loading={busy === "upload"} onClick={() => fileRef.current?.click()}>
                {busy === "upload" ? t("order.uploading") : t("order.attach")}
              </Button>
            </>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>{isDraft ? t("order.attachHint") : t("portal.order.attachOnlyDraft")}</p>
        {o.attachments.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>{t("order.noAttachments")}</p>
        ) : (
          <ul className="space-y-1.5">
            {o.attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--sunken)" }}>
                <Paperclip size={14} style={{ color: "var(--text-subtle)" }} />
                <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--text)" }}>{a.name}</span>
                <span className="text-xs" style={{ color: "var(--text-subtle)" }}>{fmtSize(a.size)}</span>
                <button type="button" className="cursor-pointer rounded p-1" aria-label={`${t("actions.download")} ${a.name}`}
                  onClick={() => downloadFile(`/api/compras/portal/orders/${o.id}/attachments?att=${a.id}`, a.name, true).catch((err) => show(errorText(tErr, err), "error"))}>
                  <Download size={14} style={{ color: "var(--brand)" }} />
                </button>
                {isDraft && (
                  <button type="button" className="cursor-pointer rounded p-1" aria-label={`${t("actions.remove")} ${a.name}`}
                    disabled={busy === `del-${a.id}`} onClick={() => removeAtt(a.id)}>
                    <Trash2 size={14} style={{ color: "var(--neg)" }} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {(isDraft || canCancel) && (
        <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-2 px-4 py-3 sm:mx-0 sm:rounded-xl"
          style={{ background: "var(--surface)", borderTop: "1px solid var(--border)" }}>
          {dirty && <span className="mr-auto text-xs" style={{ color: "var(--warn)" }}>{t("portal.order.unsaved")}</span>}
          {canCancel && <Button type="button" variant="danger" icon={Ban} onClick={() => setCancelOpen(true)} disabled={!!busy}>{t("portal.order.cancel")}</Button>}
          {isDraft && <Button type="button" variant="secondary" icon={Save} loading={busy === "save"} onClick={() => save()}>{t("portal.order.save")}</Button>}
          {isDraft && <Button type="button" icon={Send} disabled={!!busy || draft.items.length === 0} onClick={() => setConfirmSubmit(true)}>{t("portal.order.submit")}</Button>}
        </div>
      )}

      <ConfirmModal
        open={confirmSubmit}
        title={t("portal.order.submitConfirmTitle", { number: o.numberLabel })}
        message={t("portal.order.submitConfirmBody", { total: formatMoney(total, locale) })}
        confirmText={t("portal.order.submit")}
        cancelText={t("confirm.back")}
        loading={busy === "submit" || busy === "save"}
        onConfirm={submit}
        onCancel={() => setConfirmSubmit(false)}
      />

      <Modal open={cancelOpen} onClose={() => !busy && setCancelOpen(false)} size="sm" title={t("portal.order.cancelTitle", { number: o.numberLabel })}>
        <div className="px-5 py-4">
          <Field label={t("confirm.reasonLabel")}>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={500}
              className={controlClass} style={{ ...controlStyle, resize: "vertical" }} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <Button type="button" variant="ghost" onClick={() => setCancelOpen(false)} disabled={!!busy}>{t("confirm.back")}</Button>
          <Button type="button" variant="danger" disabled={reason.trim().length < 3} loading={busy === "cancel"} onClick={cancelOrder}>{t("confirm.confirm")}</Button>
        </div>
      </Modal>
    </>
  );
}
