// lib/emailTemplates.ts
// Templates de e-mail transacional. HTML com CSS inline (compatibilidade com
// clientes de e-mail) + versão em texto puro — ambas ajudam a entregabilidade,
// já que provedores de spam penalizam e-mails só-HTML sem alternativa de texto.

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
