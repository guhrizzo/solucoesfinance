// Aviso de migração InfinitePay → Asaas, enviado via Resend.
// Uso: node --env-file=.env.local scripts/send-asaas-notice.mjs <email> [--send]
// Sem --send apenas mostra o que seria enviado.
import { Resend } from "resend";

const to = process.argv[2];
const send = process.argv.includes("--send");
if (!to || !to.includes("@")) {
  console.error("Informe o e-mail de destino.");
  process.exit(1);
}

const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const link = `${base}/assinatura`;
const from = process.env.RESET_EMAIL_FROM ?? "NexusFi <naoresponda@nexusfi.com.br>";
const subject = "Atualização da sua assinatura NexusFi: pagamento agora pelo Asaas";

const logo = `${base}/nexus_fi_logo_branco.png`;

// Mesmo layout dos e-mails transacionais (lib/emailTemplates.ts).
const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f5f7fa;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background:linear-gradient(135deg,#0a1628,#1565c0);padding:24px 32px;">
                <img src="${logo}" width="120" height="34" alt="NexusFi" style="display:block;width:120px;height:auto;border:0;outline:none;text-decoration:none;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 12px;color:#0d2247;font-size:20px;">Sua assinatura agora é pelo Asaas</h1>
                <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
                  Mudamos a forma de cobrança do NexusFi: saímos da InfinitePay e passamos a usar o
                  <strong>Asaas</strong>, que faz a <strong>renovação automática</strong> — sem precisar pagar
                  manualmente a cada período.
                </p>
                <p style="margin:0 0 8px;color:#475569;font-size:14px;line-height:1.6;">Para continuar, faça uma nova contratação:</p>
                <ol style="margin:0 0 20px;padding-left:20px;color:#475569;font-size:14px;line-height:1.8;">
                  <li>Entre na sua conta com este e-mail e abra a página de assinatura.</li>
                  <li>Escolha o plano e assine o contrato.</li>
                  <li>Escolha cartão (recorrente) ou boleto e conclua o pagamento.</li>
                </ol>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px;background:linear-gradient(135deg,#1565c0,#0d47a1);">
                      <a href="${link}" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;">
                        Assinar pelo Asaas
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;color:#94a3b8;font-size:12px;line-height:1.6;">
                  Os dias que você já pagou na InfinitePay não se perdem: o novo período é somado ao que você ainda tem.
                  Se o botão não funcionar, copie e cole este link no navegador:<br/>
                  <a href="${link}" style="color:#1565c0;word-break:break-all;">${link}</a>
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
</html>`;

const text = [
  "Sua assinatura agora é pelo Asaas — NexusFi",
  "",
  "Saímos da InfinitePay e passamos a usar o Asaas, com renovação automática.",
  "Para continuar: entre na conta, abra a página de assinatura, escolha o plano,",
  "assine o contrato e pague por cartão (recorrente) ou boleto:",
  link,
  "",
  "Os dias já pagos na InfinitePay não se perdem: o novo período é somado.",
].join("\n");

console.log({ from, to, subject, link });
if (!send) {
  const { readFileSync, writeFileSync } = await import("node:fs");
  // Na prévia local a logo vai embutida (o painel pode bloquear imagens remotas).
  const png = readFileSync(new URL("../public/nexus_fi_logo_branco.png", import.meta.url)).toString("base64");
  writeFileSync(
    new URL("./asaas-notice-preview.html", import.meta.url),
    `<!doctype html><meta charset="utf-8">${html.replace(logo, `data:image/png;base64,${png}`)}`
  );
  console.log("Dry-run: nada enviado (use --send). Prévia em scripts/asaas-notice-preview.html");
  process.exit(0);
}

const resend = new Resend(process.env.RESEND_API_KEY);
const { data, error } = await resend.emails.send({ from, to, subject, html, text });
if (error) {
  console.error("Falha ao enviar:", error);
  process.exit(1);
}
console.log("Enviado:", data?.id);
