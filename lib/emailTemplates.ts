// lib/emailTemplates.ts
// Templates de e-mail transacional. HTML com CSS inline (compatibilidade com
// clientes de e-mail) + versão em texto puro — ambas ajudam a entregabilidade,
// já que provedores de spam penalizam e-mails só-HTML sem alternativa de texto.

/** Escapa texto do usuário antes de interpolar em HTML de e-mail. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function passwordResetEmail(resetLink: string, logoUrl?: string) {
  const subject = "Redefinir sua senha — NexusFi";

  // Cliente de e-mail precisa de uma URL pública (não dá pra embutir um
  // arquivo local) — usamos a logo branca, feita para fundo escuro, com
  // fallback em texto via alt caso o cliente bloqueie imagens por padrão.
  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" width="120" height="34" alt="NexusFi" style="display:block;width:120px;height:auto;border:0;outline:none;text-decoration:none;" />`
    : `<span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.02em;">NexusFi</span>`;

  const html = `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background:linear-gradient(135deg,#0a1628,#1565c0);padding:24px 32px;">
                ${logoHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;color:#0d2247;font-size:20px;">Redefinir sua senha</h1>
                <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
                  Recebemos um pedido para redefinir a senha da sua conta NexusFi. Clique no botão abaixo para
                  escolher uma nova senha. Este link expira em 1 hora.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background:linear-gradient(135deg,#1565c0,#0d47a1);">
                      <a href="${resetLink}"
                        style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">
                        Redefinir senha
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
                  Se você não pediu isso, pode ignorar este e-mail com segurança — sua senha continua a mesma.
                  Se o botão não funcionar, copie e cole este link no navegador:<br/>
                  <a href="${resetLink}" style="color:#1565c0;word-break:break-all;">${resetLink}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#94a3b8;font-size:11px;">
                  NexusFi — Gestão financeira empresarial. Este é um e-mail automático, não é monitorado para respostas.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = [
    "Redefinir sua senha — NexusFi",
    "",
    "Recebemos um pedido para redefinir a senha da sua conta NexusFi.",
    "Abra o link abaixo para escolher uma nova senha (expira em 1 hora):",
    resetLink,
    "",
    "Se você não pediu isso, pode ignorar este e-mail com segurança.",
  ].join("\n");

  return { subject, html, text };
}

/**
 * E-mail de convite pra uma conta de equipe recém-criada pelo administrador
 * — mesma estrutura visual do reset de senha, adaptada pra primeiro acesso:
 * lista as categorias liberadas e usa o mesmo link de "definir senha" do
 * Firebase Admin (a pessoa nunca vê nem escolhe uma senha temporária).
 */
export function teamInviteEmail(opts: {
  inviterName: string;
  setPasswordLink: string;
  permissionLabels: string[];
  logoUrl?: string;
}) {
  const { inviterName, setPasswordLink, permissionLabels, logoUrl } = opts;
  const subject = `${inviterName} te convidou para a conta NexusFi`;

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" width="120" height="34" alt="NexusFi" style="display:block;width:120px;height:auto;border:0;outline:none;text-decoration:none;" />`
    : `<span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.02em;">NexusFi</span>`;

  const permsHtml = permissionLabels.length
    ? `<ul style="margin:0 0 20px;padding:0 0 0 18px;color:#475569;font-size:14px;line-height:1.8;">
        ${permissionLabels.map((l) => `<li>${l}</li>`).join("")}
      </ul>`
    : `<p style="margin:0 0 20px;color:#94a3b8;font-size:13px;">Nenhuma categoria liberada ainda — peça para o administrador configurar seu acesso.</p>`;

  const html = `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background:linear-gradient(135deg,#0a1628,#1565c0);padding:24px 32px;">
                ${logoHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;color:#0d2247;font-size:20px;">Você foi convidado para a NexusFi</h1>
                <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
                  <strong>${inviterName}</strong> criou uma conta de equipe para você na NexusFi, com acesso às
                  seguintes áreas:
                </p>
                ${permsHtml}
                <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
                  Clique no botão abaixo para definir sua senha e acessar a conta. Este link expira em 1 hora.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background:linear-gradient(135deg,#1565c0,#0d47a1);">
                      <a href="${setPasswordLink}"
                        style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">
                        Definir senha e entrar
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
                  Se o botão não funcionar, copie e cole este link no navegador:<br/>
                  <a href="${setPasswordLink}" style="color:#1565c0;word-break:break-all;">${setPasswordLink}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#94a3b8;font-size:11px;">
                  NexusFi — Gestão financeira empresarial. Este é um e-mail automático, não é monitorado para respostas.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = [
    `${inviterName} te convidou para a conta NexusFi`,
    "",
    "Acesso liberado a:",
    ...(permissionLabels.length ? permissionLabels.map((l) => `- ${l}`) : ["(nenhuma categoria liberada ainda)"]),
    "",
    "Defina sua senha para acessar (expira em 1 hora):",
    setPasswordLink,
  ].join("\n");

  return { subject, html, text };
}

/**
 * E-mail de retorno quando um bug/sugestão enviado pelo usuário (em
 * /configuracoes) é marcado como resolvido pelo time. Recapitula o que a
 * pessoa relatou e mostra o que foi feito.
 */
export function feedbackResolvedEmail(opts: {
  type: "bug" | "melhoria";
  local: string;
  atual: string;
  esperado: string;
  resolution: string;
  appUrl: string;
  logoUrl?: string;
}) {
  const { type, local, atual, esperado, resolution, appUrl, logoUrl } = opts;
  const tipoLabel = type === "bug" ? "reporte de bug" : "sugestão de melhoria";
  const subject =
    type === "bug"
      ? "Seu reporte de bug foi resolvido — NexusFi"
      : "Sua sugestão foi aplicada — NexusFi";

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" width="120" height="34" alt="NexusFi" style="display:block;width:120px;height:auto;border:0;outline:none;text-decoration:none;" />`
    : `<span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.02em;">NexusFi</span>`;

  const row = (rotulo: string, valor: string) =>
    valor.trim()
      ? `<p style="margin:0 0 10px;color:#475569;font-size:13px;line-height:1.6;">
           <strong style="color:#0d2247;">${escapeHtml(rotulo)}:</strong><br/>${escapeHtml(valor).replace(/\n/g, "<br/>")}
         </p>`
      : "";

  const html = `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background:linear-gradient(135deg,#0a1628,#1565c0);padding:24px 32px;">
                ${logoHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;color:#0d2247;font-size:20px;">Resolvido ✅</h1>
                <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
                  Sua ${tipoLabel} enviado pela tela de Configurações foi tratado pelo time. Veja abaixo.
                </p>

                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin:0 0 20px;">
                  ${row("Onde", local)}
                  ${row(type === "bug" ? "O que aconteceu" : "Como funcionava", atual)}
                  ${row("O que deveria acontecer", esperado)}
                </div>

                <p style="margin:0 0 6px;color:#0d2247;font-size:14px;font-weight:700;">O que foi feito</p>
                <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.7;">
                  ${escapeHtml(resolution).replace(/\n/g, "<br/>")}
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background:linear-gradient(135deg,#1565c0,#0d47a1);">
                      <a href="${appUrl}"
                        style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">
                        Abrir a NexusFi
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#94a3b8;font-size:11px;">
                  NexusFi — Gestão financeira empresarial. Este é um e-mail automático; se precisar, responda pela tela de Configurações.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = [
    subject,
    "",
    "Sua " + tipoLabel + " enviado pela tela de Configurações foi tratado pelo time.",
    "",
    `Onde: ${local}`,
    atual.trim() ? `${type === "bug" ? "O que aconteceu" : "Como funcionava"}: ${atual}` : "",
    `O que deveria acontecer: ${esperado}`,
    "",
    "O que foi feito:",
    resolution,
    "",
    `Abrir a NexusFi: ${appUrl}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject, html, text };
}

/**
 * E-mail enviado após o pagamento confirmado, com a via do contrato de
 * prestação de serviços EM ANEXO (PDF). Vai para o responsável que assinou e
 * para o titular da conta.
 */
export function contractCopyEmail(opts: {
  planLabel: string;
  priceCents: number;
  contratanteRazao: string;
  signatarioNome: string;
  appUrl: string;
  logoUrl?: string;
}) {
  const { planLabel, priceCents, contratanteRazao, signatarioNome, appUrl, logoUrl } = opts;
  const subject = "Sua via do contrato — NexusFi";
  const valor = (priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" width="120" height="34" alt="NexusFi" style="display:block;width:120px;height:auto;border:0;outline:none;text-decoration:none;" />`
    : `<span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.02em;">NexusFi</span>`;

  const html = `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background:linear-gradient(135deg,#0a1628,#1565c0);padding:24px 32px;">
                ${logoHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;color:#0d2247;font-size:20px;">Contratação confirmada ✅</h1>
                <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
                  Olá, ${escapeHtml(signatarioNome)}. Recebemos o pagamento e a contratação do
                  <strong>Plano ${escapeHtml(planLabel)}</strong> está ativa. Segue em anexo a via em
                  PDF do contrato de prestação de serviços que você assinou eletronicamente.
                </p>

                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;margin:0 0 20px;">
                  <p style="margin:0 0 8px;color:#475569;font-size:13px;line-height:1.6;">
                    <strong style="color:#0d2247;">Contratante:</strong><br/>${escapeHtml(contratanteRazao)}
                  </p>
                  <p style="margin:0 0 8px;color:#475569;font-size:13px;line-height:1.6;">
                    <strong style="color:#0d2247;">Plano:</strong> ${escapeHtml(planLabel)}
                  </p>
                  <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;">
                    <strong style="color:#0d2247;">Valor por período:</strong> ${valor}
                  </p>
                </div>

                <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">
                  Você pode baixar o contrato a qualquer momento na tela de Assinatura.
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background:linear-gradient(135deg,#1565c0,#0d47a1);">
                      <a href="${appUrl}/assinatura"
                        style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">
                        Abrir a NexusFi
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#94a3b8;font-size:11px;">
                  NexusFi — CNPJ 68.919.873/0001-36. Este é um e-mail automático; guarde o PDF em anexo para seus registros.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = [
    subject,
    "",
    `Olá, ${signatarioNome}.`,
    `Recebemos o pagamento e a contratação do Plano ${planLabel} está ativa.`,
    "A via em PDF do contrato assinado eletronicamente segue em anexo.",
    "",
    `Contratante: ${contratanteRazao}`,
    `Plano: ${planLabel}`,
    `Valor por período: ${valor}`,
    "",
    `Baixe o contrato quando quiser em: ${appUrl}/assinatura`,
  ].join("\n");

  return { subject, html, text };
}
/**
 * Cobrança enviada ao CLIENTE de quem usa o app (Contas a Receber, plano Pro),
 * no layout de um boleto bancário (ficha de compensação): beneficiário = a
 * empresa cobradora (Configurações › Perfil & Empresa), pagador = o cliente.
 * O pagamento vai por Pix (chave recebedora + copia e cola com o valor, ver
 * lib/pix.ts). Enquanto não houver provedor de boleto (lib/boleto.ts), a
 * linha digitável fica "a emitir" e não há código de barras.
 * `stage` = lembrete automático (5 dias antes / no vencimento).
 * Valores e documentos já vêm formatados.
 */
export function receivableChargeEmail(opts: {
  beneficiary: { legalName: string; tradeName?: string; doc?: string; docLabel?: string };
  payer: { name: string; doc?: string; docLabel?: string; email?: string; phone?: string };
  title: string;
  documentNumber: string;
  documentDate: string;
  processingDate: string;
  /** Valor cobrado agora — com recebimento parcial, é o saldo em aberto. */
  amount: string;
  /** Recebimento parcial: valor original da cobrança e quanto já foi recebido. */
  partial?: { total: string; received: string };
  dueDate: string;
  overdue: boolean;
  lateDays: number;
  installment?: string;
  paymentMethod?: string;
  fineRate: number;
  interestRate: number;
  /** Só quando vencida e com multa/juros configurados. */
  updated?: { fine: string; interest: string; total: string };
  notes?: string;
  replyTo?: string;
  /** Lembrete automático: "d5" = 5 dias antes, "d0" = no dia do vencimento. */
  stage?: "d5" | "d0";
  /** Chave Pix recebedora e o copia e cola com o valor da cobrança. */
  pix?: { keyLabel: string; key: string; copiaECola: string };
  /** Boleto registrado num provedor — ver lib/boleto.ts. */
  boleto?: {
    bankCode?: string;
    linhaDigitavel: string;
    nossoNumero?: string;
    agenciaCodigo?: string;
    carteira?: string;
    pdfUrl?: string;
    pixCopiaECola?: string;
  };
}) {
  const o = opts;
  const e = escapeHtml;
  const pct = (n: number) => `${String(n).replace(".", ",")}%`;
  const b = o.beneficiary;
  const legal = b.legalName.trim();
  const trade = (b.tradeName ?? "").trim();
  const displayName = trade || legal || "Sua empresa";
  const showBoth = !!trade && !!legal && trade !== legal;
  const beneficiaryLine = showBoth ? `${legal} (${trade})` : displayName;
  const beneficiaryDoc = b.doc ? `${b.docLabel ?? "CPF/CNPJ"}: ${b.doc}` : "";
  const payerDoc = o.payer.doc ? `${o.payer.docLabel ?? "CPF/CNPJ"}: ${o.payer.doc}` : "";
  const payerContact = [o.payer.email, o.payer.phone].filter(Boolean).join(" · ");

  const subject = o.overdue
    ? `Cobrança em atraso — ${displayName} · venc. ${o.dueDate}`
    : o.stage === "d0"
      ? `Vence hoje: cobrança ${displayName} · ${o.dueDate}`
      : o.stage === "d5"
        ? `Lembrete: cobrança ${displayName} vence em ${o.dueDate}`
        : `Cobrança ${displayName} · venc. ${o.dueDate}`;
  const saudacao = o.payer.name.trim() ? `Olá, ${o.payer.name.trim()}!` : "Olá!";
  const dias = `${o.lateDays} ${o.lateDays === 1 ? "dia" : "dias"}`;
  const intro = o.overdue
    ? `Identificamos que a cobrança abaixo, com vencimento em ${o.dueDate}, está em aberto há ${dias}.`
    : o.stage === "d0"
      ? `Lembrete: a cobrança de ${displayName} vence hoje, ${o.dueDate}.`
      : o.stage === "d5"
        ? `Lembrete: a cobrança de ${displayName} vence em 5 dias, no dia ${o.dueDate}.`
        : `Segue a cobrança de ${displayName}, com vencimento em ${o.dueDate}.`;
  const badge = o.overdue ? "COBRANÇA EM ATRASO"
    : o.stage === "d0" ? "VENCE HOJE"
    : o.stage === "d5" ? "LEMBRETE DE VENCIMENTO"
    : "AVISO DE COBRANÇA";

  const instrucoes = [
    o.fineRate > 0 ? `Após o vencimento, cobrar multa de ${pct(o.fineRate)} sobre o valor.` : "",
    o.interestRate > 0 ? `Após o vencimento, cobrar juros de ${pct(o.interestRate)} ao mês (pró-rata dia).` : "",
    o.fineRate <= 0 && o.interestRate <= 0 ? "Não cobrar multa nem juros após o vencimento." : "",
    `Referente a: ${o.title}${o.installment ? ` — parcela ${o.installment}` : ""}.`,
    o.partial ? `Já recebido ${o.partial.received} de ${o.partial.total}; saldo em aberto: ${o.amount}.` : "",
    o.notes?.trim() ?? "",
  ].filter(Boolean);

  const localPagamento = o.boleto
    ? "Pagável em qualquer banco, lotérica ou app bancário até o vencimento"
    : o.pix
      ? `Pix — chave ${o.pix.keyLabel}: ${o.pix.key}`
      : o.paymentMethod
      ? `Pagamento via ${o.paymentMethod}, conforme combinado com o beneficiário`
      : "Conforme combinado com o beneficiário";

  // ── Ficha de compensação ──
  const BORDER = "1px solid #1f2937";
  const RIGHT_BG = "#eef2f7";
  const LABEL = "font-size:9px;line-height:1.3;color:#64748b;text-transform:uppercase;letter-spacing:0.02em;";
  const cell = (
    label: string,
    valueHtml: string,
    c: { colspan?: number; align?: "left" | "right"; strong?: boolean; bg?: string; width?: string } = {}
  ) =>
    `<td${c.colspan ? ` colspan="${c.colspan}"` : ""}${c.width ? ` width="${c.width}"` : ""} valign="top" style="border:${BORDER};padding:4px 6px;${c.bg ? `background:${c.bg};` : ""}text-align:${c.align ?? "left"};">
       <div style="${LABEL}">${e(label)}</div>
       <div style="font-size:${c.strong ? "14px" : "12px"};line-height:1.4;color:#0f172a;font-weight:${c.strong ? "800" : "600"};">${valueHtml || "&nbsp;"}</div>
     </td>`;

  const bankCode = o.boleto?.bankCode?.replace(/\D/g, "");
  const bankBox = bankCode ? e(`${bankCode.slice(0, 3)}-${bankCode.slice(3, 4) || "X"}`) : "";
  const linha = o.boleto?.linhaDigitavel
    ? `<span style="font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;color:#0f172a;">${e(o.boleto.linhaDigitavel)}</span>`
    : o.pix
      ? `<span style="font-size:11px;color:#0f172a;font-weight:700;">Pagamento via Pix — copia e cola acima</span>`
      : `<span style="font-size:11px;color:#64748b;font-style:italic;">Linha digitável disponível quando o boleto for emitido</span>`;

  const valores: Array<[string, string]> = [
    ["(−) Desconto / Abatimento", o.partial?.received ?? ""],
    ["(+) Mora / Multa", o.updated?.fine ?? ""],
    ["(+) Juros", o.updated ? `${o.updated.interest} (${dias})` : ""],
    ["(=) Valor cobrado", o.updated?.total ?? (o.partial ? o.amount : "")],
  ];
  const valorRight = valores
    .map(([l, v], i) =>
      `<tr><td style="padding:4px 6px;${i < valores.length - 1 ? `border-bottom:${BORDER};` : ""}">
         <div style="${LABEL}">${e(l)}</div>
         <div style="font-size:12px;line-height:1.4;color:#0f172a;font-weight:${i === valores.length - 1 ? "800" : "600"};text-align:right;">${v ? e(v) : "&nbsp;"}</div>
       </td></tr>`)
    .join("");

  const ficha = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;background:#ffffff;">
  <tr>
    <td colspan="6" style="border-bottom:2px solid #0f172a;padding:0 0 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td valign="bottom" style="padding:0 10px 0 0;font-size:16px;font-weight:800;color:#0d2247;letter-spacing:-0.02em;white-space:nowrap;">Nexus<span style="color:#1565c0;">Fi</span></td>
          ${bankCode ? `<td valign="bottom" style="padding:0 10px;border-left:2px solid #0f172a;border-right:2px solid #0f172a;font-size:18px;font-weight:800;color:#0f172a;white-space:nowrap;">${bankBox}</td>` : ""}
          <td valign="bottom" align="right" style="padding:0 0 0 10px;">${linha}</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    ${cell("Local de pagamento", e(localPagamento), { colspan: 5 })}
    ${cell("Vencimento", e(o.dueDate), { align: "right", strong: true, bg: RIGHT_BG, width: "26%" })}
  </tr>
  <tr>
    ${cell("Beneficiário", `${e(beneficiaryLine)}${beneficiaryDoc ? `<br/><span style="font-weight:400;color:#334155;">${e(beneficiaryDoc)}</span>` : ""}`, { colspan: 5 })}
    ${cell("Agência / Código do beneficiário", e(o.boleto?.agenciaCodigo ?? ""), { align: "right", bg: RIGHT_BG })}
  </tr>
  <tr>
    ${cell("Data do documento", e(o.documentDate))}
    ${cell("Nº do documento", e(o.documentNumber), { colspan: 2 })}
    ${cell("Espécie doc.", "DM")}
    ${cell("Aceite", "N")}
    ${cell("Nosso número", e(o.boleto?.nossoNumero ?? ""), { align: "right", bg: RIGHT_BG })}
  </tr>
  <tr>
    ${cell("Data processamento", e(o.processingDate))}
    ${cell("Carteira", e(o.boleto?.carteira ?? ""))}
    ${cell("Espécie", "R$")}
    ${cell("Parcela", e(o.installment ?? "—"))}
    ${cell("Valor", "")}
    ${cell("(=) Valor do documento", e(o.partial?.total ?? o.amount), { align: "right", strong: true, bg: RIGHT_BG })}
  </tr>
  <tr>
    <td colspan="5" valign="top" style="border:${BORDER};padding:4px 6px;">
      <div style="${LABEL}">Instruções (texto de responsabilidade do beneficiário)</div>
      ${instrucoes.map((l) => `<div style="font-size:12px;line-height:1.5;color:#0f172a;">${e(l)}</div>`).join("")}
    </td>
    <td valign="top" style="border:${BORDER};padding:0;background:${RIGHT_BG};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${valorRight}</table>
    </td>
  </tr>
  <tr>
    <td colspan="6" style="border:${BORDER};padding:4px 6px;">
      <div style="${LABEL}">Pagador</div>
      <div style="font-size:12px;line-height:1.4;color:#0f172a;font-weight:700;">${e(o.payer.name || "—")}${payerDoc ? ` <span style="font-weight:400;color:#334155;">— ${e(payerDoc)}</span>` : ""}</div>
      ${payerContact ? `<div style="font-size:11px;line-height:1.4;color:#334155;">${e(payerContact)}</div>` : ""}
    </td>
  </tr>
  <tr>
    <td colspan="6" align="right" style="padding:8px 0 0;${LABEL}">
      Autenticação mecânica · <strong style="color:#0f172a;">Ficha de compensação</strong>
    </td>
  </tr>
</table>`;

  const pixCode = o.pix?.copiaECola || o.boleto?.pixCopiaECola || "";

  const html = `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="padding:22px 24px 16px;border-bottom:1px solid #e2e8f0;">
                <div style="font-size:18px;font-weight:800;color:#0d2247;">${e(displayName)}</div>
                ${showBoth ? `<div style="font-size:12px;color:#475569;">${e(legal)}</div>` : ""}
                ${beneficiaryDoc ? `<div style="font-size:12px;color:#475569;">${e(beneficiaryDoc)}</div>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 8px;">
                <p style="margin:0 0 10px;">
                  <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${o.overdue ? "#fdecea" : o.stage === "d0" ? "#fff4e5" : "#e3f2fd"};color:${o.overdue ? "#b42318" : o.stage === "d0" ? "#b54708" : "#1565c0"};font-size:11px;font-weight:700;letter-spacing:0.02em;">
                    ${badge}
                  </span>
                </p>
                <h1 style="margin:0 0 8px;color:#0d2247;font-size:18px;">${e(saudacao)}</h1>
                <p style="margin:0 0 6px;color:#475569;font-size:14px;line-height:1.6;">${e(intro)}</p>
                <p style="margin:0 0 16px;color:#0d2247;font-size:14px;line-height:1.6;">
                  ${o.partial ? "Saldo em aberto" : "Valor"}${o.updated ? " atualizado" : ""}: <strong style="font-size:16px;">${e(o.updated?.total ?? o.amount)}</strong>
                </p>
                ${pixCode ? `
                <div style="border:1px solid #bfdbfe;background:#f0f7ff;border-radius:10px;padding:14px 16px;margin:0 0 16px;">
                  <div style="font-size:13px;font-weight:800;color:#0d2247;margin:0 0 4px;">Pague com Pix</div>
                  ${o.pix ? `<div style="font-size:12px;color:#334155;margin:0 0 8px;">Chave ${e(o.pix.keyLabel)}: <strong>${e(o.pix.key)}</strong> · Recebedor: ${e(beneficiaryLine)}</div>` : ""}
                  <div style="${LABEL}margin:0 0 4px;">Pix copia e cola (já com o valor)</div>
                  <div style="font-family:'Courier New',Courier,monospace;font-size:11px;line-height:1.5;color:#0f172a;background:#ffffff;border:1px dashed #94a3b8;border-radius:6px;padding:8px;word-break:break-all;">${e(pixCode)}</div>
                  <div style="font-size:11px;color:#64748b;margin:6px 0 0;">No app do seu banco: Pix › Pix copia e cola › cole o código acima.</div>
                </div>` : ""}
                ${o.boleto?.pdfUrl ? `<p style="margin:0 0 16px;"><a href="${e(o.boleto.pdfUrl)}" style="display:inline-block;background:#1565c0;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;padding:10px 18px;border-radius:8px;">Baixar boleto (PDF)</a></p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 8px;">
                <div style="border-top:1px dashed #94a3b8;margin:4px 0 12px;"></div>
                ${ficha}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 20px;">
                <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;">
                  Se o pagamento já foi feito, por favor desconsidere este aviso.${o.replyTo ? ` Dúvidas? Responda este e-mail ou escreva para ${e(o.replyTo)}.` : ""}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#94a3b8;font-size:11px;">
                  Cobrança emitida por ${e(beneficiaryLine)}${beneficiaryDoc ? ` (${e(beneficiaryDoc)})` : ""} através da NexusFi — gestão financeira empresarial.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = [
    saudacao,
    "",
    intro,
    "",
    "BENEFICIÁRIO",
    beneficiaryLine,
    beneficiaryDoc,
    "",
    "PAGADOR",
    o.payer.name || "—",
    payerDoc,
    "",
    "COBRANÇA",
    `Nº do documento: ${o.documentNumber}`,
    `Data do documento: ${o.documentDate}`,
    `Vencimento: ${o.dueDate}`,
    `Valor do documento: ${o.partial?.total ?? o.amount}`,
    o.partial ? `(−) Já recebido: ${o.partial.received}` : "",
    o.partial && !o.updated ? `(=) Saldo em aberto: ${o.amount}` : "",
    o.updated ? `(+) Multa (${pct(o.fineRate)}): ${o.updated.fine}` : "",
    o.updated ? `(+) Juros (${dias}): ${o.updated.interest}` : "",
    o.updated ? `(=) Valor cobrado: ${o.updated.total}` : "",
    o.boleto?.linhaDigitavel ? `Linha digitável: ${o.boleto.linhaDigitavel}` : "",
    o.boleto?.nossoNumero ? `Nosso número: ${o.boleto.nossoNumero}` : "",
    o.boleto?.pdfUrl ? `Boleto (PDF): ${o.boleto.pdfUrl}` : "",
    o.pix ? `Chave Pix (${o.pix.keyLabel}): ${o.pix.key}` : "",
    pixCode ? `Pix copia e cola (já com o valor): ${pixCode}` : "",
    `Local de pagamento: ${localPagamento}`,
    "",
    "Instruções:",
    ...instrucoes.map((l) => `- ${l}`),
    "",
    "Se o pagamento já foi feito, por favor desconsidere este aviso.",
    o.replyTo ? `Dúvidas: ${o.replyTo}` : "",
    "",
    `— ${beneficiaryLine} (enviado pela NexusFi)`,
  ]
    .filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
    .join("\n");

  return { subject, html, text };
}
