// app/api/receivables/charge-email/route.ts
// POST { receivableId } → envia ao cliente o e-mail de aviso de cobrança de
// uma conta a receber (recurso do plano Pro). Os dados do cliente (nome,
// e-mail, CPF/CNPJ) e as regras de multa/juros vêm do próprio documento — o
// corpo da requisição só diz QUAL conta, nunca o destinatário, pra rota não
// virar um disparador de e-mail genérico. Registra o envio no documento.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { isProAccess } from "@/lib/billing";
import { resolveScopeSubscription } from "@/lib/scopeSubscription";
import { checkRateLimit } from "@/lib/rateLimit";
import { receivableChargeEmail } from "@/lib/emailTemplates";
import { formatMoney } from "@/lib/format";
import { PAYMENT_METHOD_META, type PaymentMethod } from "@/app/types/payment";
import {
  isValidEmail, daysLate, chargeWithPenalties, clampRate, MAX_FINE_RATE, MAX_INTEREST_RATE,
} from "@/lib/receivableCharge";

const RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 30 }; // 30 e-mails / 10 min por conta

const brl = (n: number) => formatMoney(n, "pt-BR");
const brDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};
/** Hoje em São Paulo (YYYY-MM-DD) — o atraso é contado no fuso do Brasil. */
const todaySP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export async function POST(request: Request) {
  const scope = await requireScope(request, "contasReceber");
  if (isScopeError(scope)) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }
  const receivableId = String(body?.receivableId ?? "").trim();
  if (!receivableId || receivableId.includes("/")) {
    return NextResponse.json({ error: "Cobrança não informada." }, { status: 400 });
  }

  const db = await getAdminDb();

  const state = await resolveScopeSubscription(db, scope);
  if (!isProAccess(state)) {
    return NextResponse.json({ error: "O envio de cobrança por e-mail é exclusivo do plano Pro." }, { status: 403 });
  }

  const { limited } = checkRateLimit(`charge-email:${scope.ownerUid}`, RATE_LIMIT, scope.isSupremeAdmin);
  if (limited) {
    return NextResponse.json({ error: "Muitos envios em pouco tempo. Aguarde alguns minutos." }, { status: 429 });
  }

  const ref = db.doc(`users/${scope.ownerUid}/receivables/${receivableId}`);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: "Cobrança não encontrada." }, { status: 404 });
  const r = (snap.data() ?? {}) as {
    status?: string; partyEmail?: string; partyName?: string; title?: string; notes?: string;
    amount?: number; dueDate?: string; fineRate?: number; interestRate?: number;
    paymentMethod?: string; installmentIndex?: number; installmentCount?: number;
  };

  if (r.status === "recebido") {
    return NextResponse.json({ error: "Esta cobrança já foi recebida." }, { status: 400 });
  }
  const to = String(r.partyEmail ?? "").trim();
  if (!isValidEmail(to)) {
    return NextResponse.json({ error: "Cadastre um e-mail válido do cliente na cobrança." }, { status: 400 });
  }

  // Nome da empresa cobradora (Configurações › Empresa) e e-mail pra resposta.
  const [companySnap, ownerUser] = await Promise.all([
    db.doc(`users/${scope.ownerUid}/profile/company`).get(),
    (await getAdminAuth()).getUser(scope.ownerUid).catch(() => null),
  ]);
  const company = companySnap.exists ? companySnap.data() ?? {} : {};
  const companyName =
    String(company.nomeFantasia || company.razaoSocial || ownerUser?.displayName || "").trim() || "Sua empresa";
  const replyTo = ownerUser?.email ?? undefined;

  const amount = Number(r.amount) || 0;
  const dueDate = String(r.dueDate ?? "");
  const fineRate = clampRate(r.fineRate, MAX_FINE_RATE);
  const interestRate = clampRate(r.interestRate, MAX_INTEREST_RATE);
  const lateDays = daysLate(dueDate, todaySP());
  const overdue = lateDays > 0;
  const pen = chargeWithPenalties(amount, fineRate, interestRate, lateDays);
  const method = PAYMENT_METHOD_META[r.paymentMethod as PaymentMethod]?.label;

  const { subject, html, text } = receivableChargeEmail({
    companyName,
    customerName: String(r.partyName || r.title || ""),
    title: String(r.title || "Cobrança"),
    amount: brl(amount),
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
    logoUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/nexus_fi_logo_branco.png`,
  });

  // Remetente: mesmo domínio verificado no Resend, mas com o nome da empresa.
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
      return NextResponse.json({ error: "Não foi possível enviar o e-mail agora." }, { status: 502 });
    }
  } catch (err) {
    console.error("Erro ao enviar cobrança:", err);
    return NextResponse.json({ error: "Não foi possível enviar o e-mail agora." }, { status: 502 });
  }

  const sentAt = Date.now();
  await ref.set(
    { chargeEmailSentAt: sentAt, chargeEmailLastTo: to, chargeEmailCount: FieldValue.increment(1) },
    { merge: true }
  );

  return NextResponse.json({ ok: true, sentAt, to });
}
