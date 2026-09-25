// lib/receivableChargeSend.ts
// Montagem e envio da cobrança de uma conta a receber (SOMENTE server-side).
// Usado pelo envio manual (/api/receivables/charge-email) e pelos lembretes
// automáticos (/api/cron/receivable-reminders: 5 dias antes e no vencimento).
//
// Beneficiário = empresa em Configurações › Perfil & Empresa (razão social,
// nome fantasia, CPF/CNPJ). Pagamento por Pix: chave recebedora gravada na
// conta (ou a padrão da empresa) + copia e cola com o valor (lib/pix.ts).
// Boleto fica plugável em lib/boleto.ts.

import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth } from "@/lib/firebaseAdmin";
import { receivableChargeEmail } from "@/lib/emailTemplates";
import { formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_META, type PaymentMethod } from "@/app/types/payment";
import {
  isValidEmail, daysLate, chargeWithPenalties, clampRate, formatPhone, MAX_FINE_RATE, MAX_INTEREST_RATE,
} from "@/lib/receivableCharge";
import {
  getBoletoProvider, isBoletoCurrent, formatCpfCnpj, docLabel, formatLinhaDigitavel, type BoletoData,
} from "@/lib/boleto";
import { buildPixCopiaECola, formatPixKey, normalizePixKey, type PixKeyType } from "@/lib/pix";
import { sendWhatsAppCharge, type WhatsAppResult } from "@/lib/whatsapp";

export type ChargeStage = "manual" | "d5" | "d0";

export interface ReceivableChargeDoc {
  status?: string; partyEmail?: string; partyName?: string; partyDoc?: string; partyPhone?: string;
  title?: string; notes?: string; amount?: number; amountReceived?: number; dueDate?: string; fineRate?: number; interestRate?: number;
  paymentMethod?: string; installmentIndex?: number; installmentCount?: number; createdAt?: number;
  pixKey?: string; pixKeyType?: PixKeyType; autoReminder?: boolean;
  reminders?: Partial<Record<"d5" | "d0", { dueDate?: string; at?: number }>>;
  boleto?: BoletoData;
}

export const PIX_KEY_LABEL: Record<PixKeyType, string> = {
  cpfcnpj: "CPF/CNPJ", email: "e-mail", phone: "telefone", evp: "aleatória",
};

const brl = (n: number) => formatMoney(n, "pt-BR");
export const brDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};
/** Hoje em São Paulo (YYYY-MM-DD) — vencimento e atraso contam no fuso do Brasil. */
export const todaySP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export type ChargeSendResult = {
  email: { ok: true; to: string } | { ok: false; error: string } | null;
  whatsapp: WhatsAppResult | null;
};

/**
 * Envia a cobrança pelos canais pedidos. Não valida permissão/plano — isso é
 * da rota que chama. Grava o registro do envio no próprio documento.
 */
export async function sendReceivableCharge(opts: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  ownerUid: string;
  receivableId: string;
  stage: ChargeStage;
  channels: { email: boolean; whatsapp: boolean };
}): Promise<ChargeSendResult & { notFound?: boolean; received?: boolean }> {
  const { db, ownerUid, receivableId, stage, channels } = opts;
  const ref = db.doc(`users/${ownerUid}/receivables/${receivableId}`);
  const snap = await ref.get();
  if (!snap.exists) return { email: null, whatsapp: null, notFound: true };
  const r = (snap.data() ?? {}) as ReceivableChargeDoc;
  if (r.status === "recebido") return { email: null, whatsapp: null, received: true };

  const [companySnap, ownerUser] = await Promise.all([
    db.doc(`users/${ownerUid}/profile/company`).get(),
    (await getAdminAuth()).getUser(ownerUid).catch(() => null),
  ]);
  const company = companySnap.exists ? companySnap.data() ?? {} : {};
  const tradeName = String(company.nomeFantasia ?? "").trim();
  const legalName = String(company.razaoSocial ?? "").trim() || tradeName || String(ownerUser?.displayName ?? "").trim();
  const companyDoc = String(company.cnpj ?? "").replace(/\D/g, "");
  const companyName = tradeName || legalName || "Sua empresa";
  const replyTo = ownerUser?.email ?? undefined;

  // Recebimento parcial (entradas do Fluxo de Caixa baixadas na cobrança):
  // cobra só o saldo em aberto — Pix, boleto, multa/juros e WhatsApp inclusos.
  const totalAmount = Number(r.amount) || 0;
  const received = Math.min(Math.max(Number(r.amountReceived) || 0, 0), totalAmount);
  const amount = Math.round((totalAmount - received) * 100) / 100;
  const dueDate = String(r.dueDate ?? "");
  const fineRate = clampRate(r.fineRate, MAX_FINE_RATE);
  const interestRate = clampRate(r.interestRate, MAX_INTEREST_RATE);
  const today = todaySP();
  const lateDays = daysLate(dueDate, today);
  const overdue = lateDays > 0;
  const pen = chargeWithPenalties(amount, fineRate, interestRate, lateDays);
  const method = PAYMENT_METHOD_META[r.paymentMethod as PaymentMethod]?.label;
  const payerName = String(r.partyName || r.title || "");
  const payerDoc = String(r.partyDoc ?? "").replace(/\D/g, "");
  const to = String(r.partyEmail ?? "").trim();

  // Pix: chave da conta; se não tiver, a padrão da empresa.
  const pixKeyType = (r.pixKey ? r.pixKeyType : company.pixKeyType) as PixKeyType | undefined;
  const pixKeyRaw = r.pixKey ? r.pixKey : company.pixKey;
  const pixCopiaECola = buildPixCopiaECola({
    keyType: pixKeyType,
    key: pixKeyRaw,
    amount: overdue ? pen.total : amount,
    merchantName: legalName || companyName,
    merchantCity: String(company.cidade ?? ""),
    txid: receivableId,
  });
  const pix = pixCopiaECola && pixKeyType && normalizePixKey(pixKeyType, pixKeyRaw)
    ? { keyLabel: PIX_KEY_LABEL[pixKeyType], key: formatPixKey(pixKeyType, pixKeyRaw), copiaECola: pixCopiaECola }
    : undefined;

  // Boleto: reaproveita o já emitido (mesmo valor/vencimento) ou, havendo
  // provedor (lib/boleto.ts), emite e grava. Sem provedor, segue só com Pix.
  let boleto: BoletoData | null = isBoletoCurrent(r.boleto, amount, dueDate) ? r.boleto : null;
  const provider = getBoletoProvider();
  if (!boleto && provider && !overdue) {
    try {
      boleto = await provider.issue({
        receivableId, ownerUid, amount, dueDate,
        description: String(r.title || "Cobrança"), fineRate, interestRate,
        beneficiary: { name: legalName, tradeName, doc: companyDoc, email: replyTo },
        payer: { name: payerName, doc: payerDoc, email: to, phone: String(r.partyPhone ?? "") },
      });
      await ref.set({ boleto }, { merge: true });
    } catch (err) {
      console.error(`Erro ao emitir boleto (${provider.id}):`, err);
      boleto = null;
    }
  }

  const result: ChargeSendResult = { email: null, whatsapp: null };

  // ── E-mail ──
  if (channels.email) {
    if (!isValidEmail(to)) {
      result.email = { ok: false, error: "Cadastre um e-mail válido do cliente na cobrança." };
    } else {
      const createdAt = Number(r.createdAt);
      const { subject, html, text } = receivableChargeEmail({
        beneficiary: {
          legalName,
          tradeName,
          doc: companyDoc ? formatCpfCnpj(companyDoc) : undefined,
          docLabel: companyDoc ? docLabel(companyDoc) : undefined,
        },
        payer: {
          name: payerName,
          doc: payerDoc ? formatCpfCnpj(payerDoc) : undefined,
          docLabel: payerDoc ? docLabel(payerDoc) : undefined,
          email: to,
          phone: r.partyPhone ? formatPhone(String(r.partyPhone)) : undefined,
        },
        title: String(r.title || "Cobrança"),
        documentNumber: receivableId.slice(0, 10).toUpperCase(),
        documentDate: brDate(
          Number.isFinite(createdAt) && createdAt > 0
            ? new Date(createdAt).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })
            : today
        ),
        processingDate: brDate(today),
        amount: brl(amount),
        partial: received > 0 ? { total: brl(totalAmount), received: brl(received) } : undefined,
        dueDate: brDate(dueDate),
        overdue,
        lateDays,
        installment: r.installmentIndex && r.installmentCount ? `${r.installmentIndex}/${r.installmentCount}` : undefined,
        paymentMethod: method,
        fineRate,
        interestRate,
        updated: overdue && (pen.fine > 0 || pen.interest > 0)
          ? { fine: brl(pen.fine), interest: brl(pen.interest), total: brl(pen.total) }
          : undefined,
        notes: String(r.notes ?? ""),
        replyTo,
        stage: stage === "manual" ? undefined : stage,
        pix,
        boleto: boleto
          ? {
              bankCode: boleto.bankCode,
              linhaDigitavel: formatLinhaDigitavel(boleto.linhaDigitavel),
              nossoNumero: boleto.nossoNumero,
              agenciaCodigo: boleto.agenciaCodigo,
              carteira: boleto.carteira,
              pdfUrl: boleto.pdfUrl,
              pixCopiaECola: boleto.pixCopiaECola,
            }
          : undefined,
      });

      // Remetente: domínio verificado no Resend, com o nome da empresa.
      const fromEnv = process.env.RESET_EMAIL_FROM ?? "NexusFi <naoresponda@nexusfi.com.br>";
      const fromAddr = /<([^>]+)>/.exec(fromEnv)?.[1] ?? fromEnv;
      const fromName = companyName.replace(/["<>\r\n]/g, "").slice(0, 60);
      try {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { error } = await resend.emails.send({
          from: `${fromName} via NexusFi <${fromAddr}>`,
          to,
          replyTo,
          subject,
          html,
          text,
        });
        if (error) {
          console.error("Erro ao enviar cobrança via Resend:", error);
          result.email = { ok: false, error: "Não foi possível enviar o e-mail agora." };
        } else {
          result.email = { ok: true, to };
        }
      } catch (err) {
        console.error("Erro ao enviar cobrança:", err);
        result.email = { ok: false, error: "Não foi possível enviar o e-mail agora." };
      }
    }
  }

  // ── WhatsApp ──
  if (channels.whatsapp && r.partyPhone) {
    result.whatsapp = await sendWhatsAppCharge({
      phone: r.partyPhone,
      customerName: payerName,
      headline: overdue ? "Cobrança em atraso" : stage === "d0" ? "Vence hoje" : stage === "d5" ? "Lembrete de vencimento" : "Aviso de cobrança",
      companyName,
      amount: brl(overdue ? pen.total : amount),
      when: stage === "d0" ? `hoje (${brDate(dueDate)})` : `em ${brDate(dueDate)}`,
      pixCopiaECola: pix?.copiaECola ?? boleto?.pixCopiaECola ?? null,
    });
    if (!result.whatsapp.ok && result.whatsapp.reason === "api_error") {
      console.error("Erro ao enviar cobrança por WhatsApp:", result.whatsapp.detail);
    }
  }

  // ── Registro no documento ──
  const now = Date.now();
  const update: Record<string, unknown> = {};
  if (result.email?.ok) {
    update.chargeEmailSentAt = now;
    update.chargeEmailLastTo = result.email.to;
    update.chargeEmailCount = FieldValue.increment(1);
  }
  if (result.whatsapp?.ok) {
    update.chargeWhatsAppSentAt = now;
    update.chargeWhatsAppCount = FieldValue.increment(1);
  }
  if (stage !== "manual" && (result.email?.ok || result.whatsapp?.ok)) {
    update[`reminders.${stage}`] = { dueDate, at: now };
  }
  if (Object.keys(update).length) {
    // update() pra "reminders.d5" virar campo aninhado (set+merge gravaria a chave com ponto).
    await ref.update(update);
  }

  return result;
}
