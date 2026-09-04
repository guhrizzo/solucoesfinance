// lib/contractFinalize.ts
// Chamado por applyPaidOrder() DEPOIS que a assinatura é estendida com sucesso.
// Marca o contrato como assinado, gera o PDF e envia por e-mail (Resend, anexo)
// ao responsável e ao dono da conta.
//
// SOMENTE server-side (Admin SDK). Idempotente: uma segunda passada (corrida
// webhook × confirm) não reenvia o e-mail. NUNCA lança — falha aqui não pode
// derrubar a confirmação de um pagamento que já aconteceu.

import { getAdminAuth } from "./firebaseAdmin";
import { buildContractPdf } from "./contractPdf";
import { contractCopyEmail } from "./emailTemplates";
import type { ContractDoc } from "./contract";

interface FinalizeInput {
  transactionNsu: string;
  orderNsu: string;
  paidAt: number;
  periodEnd: number;
}

export async function finalizeContract(
  db: any,
  ownerUid: string,
  contractId: string,
  input: FinalizeInput
): Promise<void> {
  try {
    const ref = db.doc(`users/${ownerUid}/contracts/${contractId}`);
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`[finalizeContract] contrato ${ownerUid}/${contractId} não encontrado — pulando`);
      return;
    }

    const current = { contractId: snap.id, ...(snap.data() as Omit<ContractDoc, "contractId">) };

    // Já finalizado e notificado → nada a fazer.
    if (current.status === "signed" && current.emailedAt) return;

    const now = Date.now();
    const signed: ContractDoc = {
      ...current,
      status: "signed",
      transactionNsu: input.transactionNsu,
      orderNsu: input.orderNsu || current.orderNsu,
      paidAt: input.paidAt,
      periodEnd: input.periodEnd,
      updatedAt: now,
    };

    await ref.update({
      status: signed.status,
      transactionNsu: signed.transactionNsu,
      orderNsu: signed.orderNsu,
      paidAt: signed.paidAt,
      periodEnd: signed.periodEnd,
      updatedAt: signed.updatedAt,
    });

    // ── E-mail com o PDF em anexo ──
    if (current.emailedAt) return; // já enviado numa passada anterior

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    let ownerEmail: string | null = null;
    try {
      ownerEmail = (await (await getAdminAuth()).getUser(ownerUid)).email ?? null;
    } catch {
      /* segue só com o e-mail do signatário */
    }

    const to = Array.from(
      new Set([signed.signatario.email, ownerEmail].filter((e): e is string => !!e))
    );
    if (to.length === 0) {
      await ref.update({ emailError: "sem e-mail de destino", updatedAt: Date.now() });
      return;
    }

    try {
      const pdf = await buildContractPdf(signed);
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { subject, html, text } = contractCopyEmail({
        planLabel: signed.planLabel,
        priceCents: signed.priceCents,
        contratanteRazao: signed.contratante.razaoSocial,
        signatarioNome: signed.signatario.nome,
        appUrl,
        logoUrl: `${appUrl}/nexus_fi_logo_branco.png`,
      });

      const { error } = await resend.emails.send({
        from: process.env.RESET_EMAIL_FROM ?? "NexusFi <naoresponda@nexusfi.com.br>",
        to,
        subject,
        html,
        text,
        attachments: [
          { filename: `contrato-nexusfi-${contractId}.pdf`, content: pdf.toString("base64") },
        ],
      });

      if (error) {
        console.error("[finalizeContract] Resend falhou:", error);
        await ref.update({ emailError: String(error), updatedAt: Date.now() });
        return;
      }
      await ref.update({ emailedAt: Date.now(), emailError: null, updatedAt: Date.now() });
    } catch (err) {
      console.error("[finalizeContract] erro ao gerar/enviar o contrato:", err);
      await ref
        .update({ emailError: String(err), updatedAt: Date.now() })
        .catch(() => undefined);
    }
  } catch (err) {
    // Blindagem final — nada aqui pode propagar pra applyPaidOrder.
    console.error("[finalizeContract] erro inesperado:", err);
  }
}
