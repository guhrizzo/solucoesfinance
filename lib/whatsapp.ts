// lib/whatsapp.ts
// Envio de mensagens de cobrança por WhatsApp (SOMENTE server-side) pela
// WhatsApp Cloud API (Meta). Mensagem iniciada pela empresa exige TEMPLATE
// aprovado no WhatsApp Manager — texto livre só vale dentro da janela de 24h.
//
// Configuração (env):
//   WHATSAPP_TOKEN            token permanente do usuário de sistema
//   WHATSAPP_PHONE_NUMBER_ID  id do número remetente
//   WHATSAPP_TEMPLATE_CHARGE  nome do template (padrão "lembrete_cobranca")
//   WHATSAPP_TEMPLATE_LANG    idioma do template (padrão "pt_BR")
//
// Template esperado (categoria UTILITY), 6 variáveis no corpo, por exemplo:
//   Olá, {{1}}! {{2}}: a cobrança de {{3}} de {{4}} vence {{5}}.
//   Pague com Pix copia e cola: {{6}}
// Sem as variáveis de ambiente, `sendWhatsAppCharge` só devolve "not_configured".

const GRAPH_VERSION = "v21.0";

export function isWhatsAppConfigured(): boolean {
  return !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID;
}

/** Telefone BR (DDD + número) → formato E.164 sem "+" que a API espera. */
export function toWhatsAppNumber(raw: string | undefined | null): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? `55${d}` : null;
}

/** Variável de template não aceita quebra de linha, tab nem 4+ espaços seguidos. */
const param = (s: string) => ({ type: "text", text: s.replace(/[\r\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim() || "-" });

export type WhatsAppResult = { ok: true; id?: string } | { ok: false; reason: "not_configured" | "invalid_phone" | "api_error"; detail?: string };

export async function sendWhatsAppCharge(opts: {
  phone: string | undefined | null;
  customerName: string;
  /** Linha de contexto: "Lembrete", "Vence hoje", "Em atraso"… */
  headline: string;
  companyName: string;
  amount: string;
  /** "em 29/09/2026", "hoje (24/09/2026)"… */
  when: string;
  pixCopiaECola?: string | null;
}): Promise<WhatsAppResult> {
  if (!isWhatsAppConfigured()) return { ok: false, reason: "not_configured" };
  const to = toWhatsAppNumber(opts.phone);
  if (!to) return { ok: false, reason: "invalid_phone" };

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: process.env.WHATSAPP_TEMPLATE_CHARGE || "lembrete_cobranca",
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR" },
      components: [
        {
          type: "body",
          parameters: [
            param(opts.customerName || "cliente"),
            param(opts.headline),
            param(opts.amount),
            param(opts.companyName),
            param(opts.when),
            param(opts.pixCopiaECola || "combine o pagamento com a empresa"),
          ],
        },
      ],
    },
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );
    const json = (await res.json().catch(() => ({}))) as { messages?: { id?: string }[]; error?: { message?: string } };
    if (!res.ok) return { ok: false, reason: "api_error", detail: json.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, id: json.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, reason: "api_error", detail: (err as Error)?.message };
  }
}
