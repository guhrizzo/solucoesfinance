// lib/compras/emails.ts
// E-mails transacionais do módulo de Compras (HTML com CSS inline + texto puro,
// mesmo padrão visual de lib/emailTemplates.ts). Saem em pt-BR, como os demais
// e-mails do app. Todo texto vindo de usuário passa por escapeHtml.

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

interface LayoutOpts {
  heading: string;
  intro: string;
  rows?: [string, string][];
  note?: string;
  cta?: { label: string; url: string };
  footer?: string;
  logoUrl?: string;
}

function layout(o: LayoutOpts): { html: string; text: string } {
  const e = escapeHtml;
  const logo = o.logoUrl
    ? `<img src="${e(o.logoUrl)}" width="120" height="34" alt="NexusFi" style="display:block;width:120px;height:auto;border:0;" />`
    : `<span style="color:#ffffff;font-size:18px;font-weight:800;">NexusFi</span>`;
  const rows = (o.rows ?? []).filter(([, v]) => v && v.trim());
  const rowsHtml = rows.length
    ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;margin:0 0 20px;">
        ${rows.map(([l, v]) => `<p style="margin:0 0 8px;color:#475569;font-size:13px;line-height:1.6;"><strong style="color:#0d2247;">${e(l)}:</strong> ${e(v).replace(/\n/g, "<br/>")}</p>`).join("")}
      </div>`
    : "";
  const cta = o.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#1565c0;">
        <a href="${e(o.cta.url)}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">${e(o.cta.label)}</a>
      </td></tr></table>
      <p style="margin:18px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">Se o botão não funcionar, copie e cole no navegador:<br/>
        <a href="${e(o.cta.url)}" style="color:#1565c0;word-break:break-all;">${e(o.cta.url)}</a></p>`
    : "";
  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
<tr><td style="background:#0a1628;padding:22px 32px;">${logo}</td></tr>
<tr><td style="padding:30px 32px;">
<h1 style="margin:0 0 12px;color:#0d2247;font-size:19px;">${e(o.heading)}</h1>
<p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">${e(o.intro).replace(/\n/g, "<br/>")}</p>
${rowsHtml}
${o.note ? `<p style="margin:0 0 18px;color:#475569;font-size:13px;line-height:1.6;">${e(o.note).replace(/\n/g, "<br/>")}</p>` : ""}
${cta}
</td></tr>
<tr><td style="padding:14px 32px;border-top:1px solid #e2e8f0;"><p style="margin:0;color:#94a3b8;font-size:11px;">${e(o.footer ?? "NexusFi — portal de compras e fornecedores. E-mail automático, não responda.")}</p></td></tr>
</table></td></tr></table></body></html>`;
  const text = [
    o.heading, "", o.intro, "",
    ...rows.map(([l, v]) => `${l}: ${v}`),
    o.note ? `\n${o.note}` : "",
    o.cta ? `\n${o.cta.label}: ${o.cta.url}` : "",
  ].filter((l) => l !== undefined).join("\n");
  return { html, text };
}

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n) || 0);
const brDate = (ms: number) => new Date(ms).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export const STATUS_LABEL_PT: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  em_analise: "Em análise",
  aprovado: "Aprovado",
  recusado: "Recusado",
  cancelado: "Cancelado",
  concluido: "Concluído",
};

export function inviteEmail(o: { companyName: string; supplierName: string; url: string; expiresAt: number; logoUrl?: string }) {
  const subject = `${o.companyName} convidou você para o portal de fornecedores`;
  return {
    subject,
    ...layout({
      heading: "Convite para o portal de fornecedores",
      intro: `${o.companyName} convidou ${o.supplierName} para enviar propostas e pedidos de compra pelo portal de fornecedores da NexusFi.`,
      note: `O link é pessoal, só pode ser usado uma vez e vale até ${brDate(o.expiresAt)}. Se você não esperava este convite, ignore este e-mail.`,
      cta: { label: "Ativar meu acesso", url: o.url },
      logoUrl: o.logoUrl,
    }),
  };
}

export function verifyEmailEmail(o: { url: string; logoUrl?: string }) {
  return {
    subject: "Confirme seu e-mail — portal de fornecedores NexusFi",
    ...layout({
      heading: "Confirme seu e-mail",
      intro: "Para proteger sua conta no portal de fornecedores, confirme que este e-mail é seu.",
      cta: { label: "Confirmar e-mail", url: o.url },
      logoUrl: o.logoUrl,
    }),
  };
}

export function orderSubmittedToCompanyEmail(o: {
  numberLabel: string; supplierName: string; supplierCnpj: string; total: number; paymentTerms: string; url: string; logoUrl?: string;
}) {
  return {
    subject: `Novo pedido de compra ${o.numberLabel} — ${o.supplierName}`,
    ...layout({
      heading: `Pedido ${o.numberLabel} enviado para análise`,
      intro: `${o.supplierName} enviou um pedido de compra pelo portal. Ele aguarda a revisão da equipe — nenhuma obrigação financeira foi criada.`,
      rows: [["Fornecedor", o.supplierName], ["CNPJ", o.supplierCnpj], ["Total", brl(o.total)], ["Condições propostas", o.paymentTerms]],
      cta: { label: "Revisar pedido", url: o.url },
      logoUrl: o.logoUrl,
    }),
  };
}

export function orderReceiptToSupplierEmail(o: { numberLabel: string; companyName: string; total: number; url: string; logoUrl?: string }) {
  return {
    subject: `Recebemos seu pedido ${o.numberLabel}`,
    ...layout({
      heading: "Pedido recebido",
      intro: `Seu pedido ${o.numberLabel} foi entregue a ${o.companyName} e está aguardando análise. Você será avisado a cada mudança de status.`,
      rows: [["Total enviado", brl(o.total)]],
      cta: { label: "Acompanhar pedido", url: o.url },
      logoUrl: o.logoUrl,
    }),
  };
}

export function orderStatusToSupplierEmail(o: {
  numberLabel: string; companyName: string; status: string; reason?: string | null; total: number; url: string; logoUrl?: string;
}) {
  const label = STATUS_LABEL_PT[o.status] ?? o.status;
  const intro: Record<string, string> = {
    em_analise: `${o.companyName} começou a analisar o seu pedido ${o.numberLabel}.`,
    aprovado: `${o.companyName} aprovou o seu pedido ${o.numberLabel}.`,
    recusado: `${o.companyName} recusou o seu pedido ${o.numberLabel}.`,
    cancelado: `O pedido ${o.numberLabel} foi cancelado.`,
    concluido: `O pedido ${o.numberLabel} foi concluído por ${o.companyName}.`,
  };
  return {
    subject: `Pedido ${o.numberLabel}: ${label}`,
    ...layout({
      heading: `Pedido ${o.numberLabel} — ${label}`,
      intro: intro[o.status] ?? `O status do pedido ${o.numberLabel} mudou para ${label}.`,
      rows: [["Status", label], ["Motivo", o.reason ?? ""], ["Total", brl(o.total)]],
      cta: { label: "Ver pedido", url: o.url },
      logoUrl: o.logoUrl,
    }),
  };
}
