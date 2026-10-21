// lib/compras/notify.ts
// Notificações do módulo de Compras (SOMENTE server-side): e-mail via Resend
// e WhatsApp via Meta Cloud API (lib/whatsapp.ts). Regras:
//   • Nunca simula envio: só grava "sent" quando o provedor confirmou.
//   • WhatsApp sem credencial → status "not_configured" + link wa.me com a
//     mensagem pronta (fallback que a pessoa abre manualmente).
//   • Todo envio (ou falha) vira um registro em
//     users/{ownerUid}/comprasNotifications (canal, destinatário, data, status, erro).
//   • Nunca lança: notificação que falha não desfaz a ação do pedido.

import type { Firestore } from "firebase-admin/firestore";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { isWhatsAppConfigured, sendWhatsAppSupplierNotice, waMeLink, type WhatsAppResult } from "@/lib/whatsapp";
import { notifyOwner, brl } from "@/lib/ownerAlerts";
import { paths } from "./service";
import {
  inviteEmail, orderReceiptToSupplierEmail, orderStatusToSupplierEmail, orderSubmittedToCompanyEmail, STATUS_LABEL_PT,
} from "./emails";
import type { NotificationLog, NotificationStatus, PurchaseOrderDoc, SupplierDoc } from "./types";

export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const logoUrl = () => `${appUrl()}/nexus_fi_logo_branco.png`;

/** Mascara o destinatário no log (e-mail/telefone) — o log é lido pela equipe. */
function maskRecipient(to: string): string {
  if (to.includes("@")) {
    const [u, d] = to.split("@");
    return `${u.slice(0, 2)}***@${d}`;
  }
  return to.length > 4 ? `${"*".repeat(to.length - 4)}${to.slice(-4)}` : to;
}

export async function logNotification(db: Firestore, ownerUid: string, log: Omit<NotificationLog, "at"> & { at?: number }) {
  try {
    await db.collection(paths.notifications(ownerUid)).add({
      ...log,
      to: maskRecipient(log.to),
      error: log.error ? String(log.error).slice(0, 300) : null,
      at: log.at ?? Date.now(),
    });
  } catch (err) {
    console.error("[compras] falha ao registrar notificação:", err);
  }
}

export async function companyInfo(db: Firestore, ownerUid: string): Promise<{ name: string; ownerEmail: string | null }> {
  const [snap, user] = await Promise.all([
    db.doc(`users/${ownerUid}/profile/company`).get().catch(() => null),
    getAdminAuth().then((a) => a.getUser(ownerUid)).catch(() => null),
  ]);
  const c = snap?.exists ? snap.data() ?? {} : {};
  const name = String(c.nomeFantasia || c.razaoSocial || user?.displayName || "").trim() || "Empresa";
  return { name, ownerEmail: user?.email ?? null };
}

type EmailResult = { ok: true; id?: string } | { ok: false; error: string };

export async function sendEmail(opts: { to: string; subject: string; html: string; text: string; replyTo?: string; fromName?: string }): Promise<EmailResult> {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY ausente" };
  const fromEnv = process.env.RESET_EMAIL_FROM ?? "NexusFi <naoresponda@nexusfi.com.br>";
  const fromAddr = /<([^>]+)>/.exec(fromEnv)?.[1] ?? fromEnv;
  const from = opts.fromName ? `${opts.fromName.replace(/["<>\r\n]/g, "").slice(0, 60)} via NexusFi <${fromAddr}>` : fromEnv;
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from, to: opts.to, subject: opts.subject, html: opts.html, text: opts.text,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });
    if (error) return { ok: false, error: String(error.message ?? error.name ?? "erro do provedor") };
    return { ok: true, id: data?.id };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? "falha no envio" };
  }
}

function emailStatus(r: EmailResult): { status: NotificationStatus; error: string | null; providerId: string | null } {
  return r.ok ? { status: "sent", error: null, providerId: r.id ?? null } : { status: "failed", error: r.error, providerId: null };
}

function waStatus(r: WhatsAppResult): { status: NotificationStatus; error: string | null; providerId: string | null } {
  if (r.ok) return { status: "sent", error: null, providerId: r.id ?? null };
  if (r.reason === "not_configured") return { status: "not_configured", error: "WhatsApp (Meta) não configurado", providerId: null };
  if (r.reason === "invalid_phone") return { status: "invalid_recipient", error: "telefone inválido", providerId: null };
  return { status: "failed", error: r.detail ?? "erro da API", providerId: null };
}

const firstName = (s: string) => String(s || "").trim().split(/\s+/)[0] || "";

// ─── Convite ────────────────────────────────────────────────────────────────

export interface ChannelOutcome {
  status: NotificationStatus;
  error?: string | null;
  /** Fallback do WhatsApp: link wa.me com a mensagem pronta. */
  waLink?: string | null;
}

export async function sendInvite(
  db: Firestore, ownerUid: string, supplier: SupplierDoc, token: string, expiresAt: number,
  channels: ("email" | "whatsapp")[],
): Promise<{ email?: ChannelOutcome; whatsapp?: ChannelOutcome; url: string }> {
  const url = `${appUrl()}/fornecedor/convite?t=${encodeURIComponent(token)}`;
  const company = await companyInfo(db, ownerUid);
  const supplierName = supplier.nomeFantasia || supplier.razaoSocial;
  const out: { email?: ChannelOutcome; whatsapp?: ChannelOutcome; url: string } = { url };

  if (channels.includes("email")) {
    const mail = inviteEmail({ companyName: company.name, supplierName, url, expiresAt, logoUrl: logoUrl() });
    const r = await sendEmail({ to: supplier.email, ...mail, replyTo: company.ownerEmail ?? undefined, fromName: company.name });
    const s = emailStatus(r);
    await logNotification(db, ownerUid, { channel: "email", kind: "invite", to: supplier.email, supplierId: supplier.id, ...s });
    out.email = { status: s.status, error: s.error };
  }

  if (channels.includes("whatsapp")) {
    const phone = supplier.whatsapp || supplier.telefone;
    const text = `${company.name} convidou ${supplierName} para o portal de fornecedores. Ative seu acesso (link pessoal, uso único, válido por 7 dias): ${url}`;
    const r = await sendWhatsAppSupplierNotice({ phone, name: firstName(supplier.responsavel), companyName: company.name, text });
    const s = waStatus(r);
    const fallback = !r.ok && (r.reason === "not_configured" || r.reason === "api_error") ? waMeLink(phone, text) : null;
    await logNotification(db, ownerUid, {
      channel: "whatsapp", kind: "invite", to: phone, supplierId: supplier.id, ...s,
      ...(fallback ? { status: "fallback_link" as const, error: s.error } : {}),
    });
    out.whatsapp = { status: fallback ? "fallback_link" : s.status, error: s.error, waLink: fallback };
  }
  return out;
}

// ─── Pedido enviado pelo fornecedor ─────────────────────────────────────────

export async function notifyOrderSubmitted(db: Firestore, ownerUid: string, order: PurchaseOrderDoc, supplier: SupplierDoc) {
  try {
    const company = await companyInfo(db, ownerUid);
    const internalUrl = `${appUrl()}/contasPagar/compras?pedido=${encodeURIComponent(order.id)}`;
    const portalUrl = `${appUrl()}/fornecedor/pedidos/${encodeURIComponent(order.id)}`;
    const supplierName = supplier.nomeFantasia || supplier.razaoSocial;

    // 1) Empresa: e-mail pro dono da conta.
    if (company.ownerEmail) {
      const mail = orderSubmittedToCompanyEmail({
        numberLabel: order.numberLabel, supplierName, supplierCnpj: supplier.cnpj, total: order.total,
        paymentTerms: order.paymentTerms, url: internalUrl, logoUrl: logoUrl(),
      });
      const r = await sendEmail({ to: company.ownerEmail, ...mail });
      await logNotification(db, ownerUid, { channel: "email", kind: "order_submitted", to: company.ownerEmail, orderId: order.id, supplierId: supplier.id, ...emailStatus(r) });
    }

    // 2) Empresa: WhatsApp do dono (aviso "compras" de Configurações › WhatsApp).
    if (isWhatsAppConfigured()) {
      const r = await notifyOwner(db, ownerUid, "compras", `${supplierName} enviou o pedido de compra ${order.numberLabel} (${brl(order.total)}) para análise`);
      if (r.ok || (r.reason !== "disabled" && r.reason !== "no_phone" && r.reason !== "not_pro")) {
        await logNotification(db, ownerUid, {
          channel: "whatsapp", kind: "order_submitted_owner", to: "dono", orderId: order.id,
          status: r.ok ? "sent" : "failed", error: r.ok ? null : r.reason, providerId: r.ok ? r.id ?? null : null,
        });
      }
    }

    // 3) Fornecedor: confirmação de recebimento.
    const portalEmail = supplier.portal?.email || supplier.email;
    if (portalEmail) {
      const mail = orderReceiptToSupplierEmail({ numberLabel: order.numberLabel, companyName: company.name, total: order.total, url: portalUrl, logoUrl: logoUrl() });
      const r = await sendEmail({ to: portalEmail, ...mail, replyTo: company.ownerEmail ?? undefined, fromName: company.name });
      await logNotification(db, ownerUid, { channel: "email", kind: "order_receipt", to: portalEmail, orderId: order.id, supplierId: supplier.id, ...emailStatus(r) });
    }
  } catch (err) {
    console.error("[compras] notifyOrderSubmitted:", err);
  }
}

// ─── Mudança de status → fornecedor ─────────────────────────────────────────

export async function notifyStatusChange(
  db: Firestore, ownerUid: string, order: PurchaseOrderDoc, status: string, reason: string | null,
): Promise<{ email?: ChannelOutcome; whatsapp?: ChannelOutcome }> {
  const out: { email?: ChannelOutcome; whatsapp?: ChannelOutcome } = {};
  try {
    const sSnap = await db.doc(paths.supplier(ownerUid, order.supplierId)).get();
    if (!sSnap.exists) return out;
    const supplier = { ...(sSnap.data() as SupplierDoc), id: sSnap.id };
    const company = await companyInfo(db, ownerUid);
    const portalUrl = `${appUrl()}/fornecedor/pedidos/${encodeURIComponent(order.id)}`;
    const to = supplier.portal?.email || supplier.email;

    if (to) {
      const mail = orderStatusToSupplierEmail({
        numberLabel: order.numberLabel, companyName: company.name, status, reason, total: order.total, url: portalUrl, logoUrl: logoUrl(),
      });
      const r = await sendEmail({ to, ...mail, replyTo: company.ownerEmail ?? undefined, fromName: company.name });
      const s = emailStatus(r);
      await logNotification(db, ownerUid, { channel: "email", kind: `status_${status}`, to, orderId: order.id, supplierId: supplier.id, ...s });
      out.email = { status: s.status, error: s.error };
    }

    const phone = supplier.whatsapp;
    if (phone) {
      const label = STATUS_LABEL_PT[status] ?? status;
      const text = `o pedido ${order.numberLabel} está agora "${label}"${reason ? ` (motivo: ${reason})` : ""}. Acompanhe: ${portalUrl}`;
      const r = await sendWhatsAppSupplierNotice({ phone, name: firstName(supplier.responsavel), companyName: company.name, text });
      const s = waStatus(r);
      const fallback = !r.ok && r.reason !== "invalid_phone"
        ? waMeLink(phone, `Olá, ${firstName(supplier.responsavel)}! ${company.name}: ${text}`)
        : null;
      await logNotification(db, ownerUid, {
        channel: "whatsapp", kind: `status_${status}`, to: phone, orderId: order.id, supplierId: supplier.id, ...s,
        ...(fallback ? { status: "fallback_link" as const } : {}),
      });
      out.whatsapp = { status: fallback ? "fallback_link" : s.status, error: s.error, waLink: fallback };
    }
  } catch (err) {
    console.error("[compras] notifyStatusChange:", err);
  }
  return out;
}
