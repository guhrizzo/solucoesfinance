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
 * Aviso de cobrança enviado ao CLIENTE de quem usa o app (Contas a Receber,
 * plano Pro). Leva a marca da empresa cobradora, não a da NexusFi — a NexusFi
 * aparece só no rodapé como plataforma de envio. Valores já vêm formatados.
 */
export function receivableChargeEmail(opts: {
  companyName: string;
  customerName: string;
  title: string;
  amount: string;
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
  logoUrl?: string;
}) {
  const o = opts;
  const pct = (n: number) => `${String(n).replace(".", ",")}%`;
  const subject = o.overdue
    ? `Cobrança em atraso — ${o.companyName}`
    : `Aviso de cobrança — ${o.companyName}`;
  const saudacao = o.customerName.trim() ? `Olá, ${o.customerName.trim()}!` : "Olá!";
  const intro = o.overdue
    ? `Identificamos que a cobrança abaixo, com vencimento em ${o.dueDate}, está em aberto há ${o.lateDays} ${o.lateDays === 1 ? "dia" : "dias"}.`
    : `Este é um aviso da cobrança abaixo, com vencimento em ${o.dueDate}.`;
  const encargos =
    o.fineRate > 0 || o.interestRate > 0
      ? `Em caso de atraso: multa de ${pct(o.fineRate)} e juros de ${pct(o.interestRate)} ao mês (pró-rata dia).`
      : "";

  const logoHtml = o.logoUrl
    ? `<img src="${o.logoUrl}" width="120" height="34" alt="NexusFi" style="display:block;width:120px;height:auto;border:0;outline:none;text-decoration:none;" />`
    : `<span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.02em;">NexusFi</span>`;

  const row = (rotulo: string, valor: string, strong = false) =>
    `<tr>
       <td style="padding:6px 0;color:#64748b;font-size:13px;">${escapeHtml(rotulo)}</td>
       <td style="padding:6px 0;text-align:right;${strong ? "color:#1565c0;font-weight:800;font-size:15px;" : "color:#0d2247;font-size:13px;font-weight:600;"}">${escapeHtml(valor)}</td>
     </tr>`;

  const linhas = [
    row("Descrição", o.title),
    o.installment ? row("Parcela", o.installment) : "",
    row("Vencimento", o.dueDate),
    o.paymentMethod ? row("Forma de pagamento", o.paymentMethod) : "",
    row(o.updated ? "Valor original" : "Valor", o.amount, !o.updated),
    o.updated ? row(`Multa (${pct(o.fineRate)})`, o.updated.fine) : "",
    o.updated ? row(`Juros (${o.lateDays} ${o.lateDays === 1 ? "dia" : "dias"})`, o.updated.interest) : "",
    o.updated ? row("Valor atualizado", o.updated.total, true) : "",
  ].join("");

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
                <p style="margin:0 0 14px;">
                  <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#e3f2fd;color:#1565c0;font-size:11px;font-weight:700;letter-spacing:0.02em;">
                    ${escapeHtml(o.overdue ? "COBRANÇA EM ATRASO" : "AVISO DE COBRANÇA")} · ${escapeHtml(o.companyName)}
                  </span>
                </p>
                <h1 style="margin:0 0 12px;color:#0d2247;font-size:20px;">${escapeHtml(saudacao)}</h1>
                <p style="margin:0 0 20px;color:#475569;font-size:14px;line-height:1.6;">${escapeHtml(intro)}</p>

                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:12px 18px;margin:0 0 20px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${linhas}</table>
                </div>

                ${encargos ? `<p style="margin:0 0 16px;color:#64748b;font-size:12px;line-height:1.6;">${escapeHtml(encargos)}</p>` : ""}
                ${o.notes?.trim() ? `<p style="margin:0 0 16px;color:#475569;font-size:13px;line-height:1.6;"><strong style="color:#0d2247;">Observação:</strong> ${escapeHtml(o.notes.trim())}</p>` : ""}

                <p style="margin:0;color:#475569;font-size:13px;line-height:1.6;">
                  Se o pagamento já foi feito, por favor desconsidere este aviso.${o.replyTo ? ` Dúvidas? Responda este e-mail ou escreva para ${escapeHtml(o.replyTo)}.` : ""}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;border-top:1px solid #e2e8f0;">
                <p style="margin:0;color:#94a3b8;font-size:11px;">
                  Cobrança enviada por ${escapeHtml(o.companyName)} através da NexusFi — gestão financeira empresarial.
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
    `Descrição: ${o.title}`,
    o.installment ? `Parcela: ${o.installment}` : "",
    `Vencimento: ${o.dueDate}`,
    o.paymentMethod ? `Forma de pagamento: ${o.paymentMethod}` : "",
    `${o.updated ? "Valor original" : "Valor"}: ${o.amount}`,
    o.updated ? `Multa (${pct(o.fineRate)}): ${o.updated.fine}` : "",
    o.updated ? `Juros (${o.lateDays} dias): ${o.updated.interest}` : "",
    o.updated ? `Valor atualizado: ${o.updated.total}` : "",
    "",
    encargos,
    o.notes?.trim() ? `Observação: ${o.notes.trim()}` : "",
    "",
    "Se o pagamento já foi feito, por favor desconsidere este aviso.",
    o.replyTo ? `Dúvidas: ${o.replyTo}` : "",
    "",
    `— ${o.companyName} (enviado pela NexusFi)`,
  ]
    .filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
    .join("\n");

  return { subject, html, text };
}
