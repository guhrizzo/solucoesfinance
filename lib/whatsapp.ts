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
//
// Avisos pro DONO da conta (lib/ownerAlerts.ts) usam um segundo template:
//   WHATSAPP_TEMPLATE_ALERT   nome do template (padrão "aviso_nexusfi")
// Template esperado (categoria UTILITY), 3 variáveis no corpo:
//   Olá, {{1}}! Aviso da NexusFi sobre {{2}}: {{3}}. Acesse o painel para ver os detalhes.
//
// Botões de ação (opcional): WHATSAPP_TEMPLATE_ALERT_ACTIONS = nome de um
// template com o MESMO corpo e 2 botões de resposta rápida ("Marcar como pago",
// "Ver detalhes"). Usado no aviso de contas a pagar; sem a variável, o aviso
// sai sem botões.
// Recebimento (webhook): WHATSAPP_VERIFY_TOKEN e WHATSAPP_APP_SECRET —
// ver app/api/webhooks/whatsapp e lib/whatsappInbound.ts.
// Passo a passo da configuração na Meta: docs/whatsapp-meta-setup.md.

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
  return sendTemplate(opts.phone, process.env.WHATSAPP_TEMPLATE_CHARGE || "lembrete_cobranca", [
    opts.customerName || "cliente",
    opts.headline,
    opts.amount,
    opts.companyName,
    opts.when,
    opts.pixCopiaECola || "combine o pagamento com a empresa",
  ]);
}

/** Aviso pro dono da conta (fechamento de caixa, estoque baixo, contas vencendo…). */
export async function sendWhatsAppAlert(opts: {
  phone: string | undefined | null;
  /** Primeiro nome de quem recebe. */
  name: string;
  /** Nome da empresa (o aviso é "sobre" ela). */
  companyName: string;
  /** O aviso em uma linha (sem quebra — o template não aceita). */
  text: string;
  /** Usa o template com botões (se WHATSAPP_TEMPLATE_ALERT_ACTIONS existir). */
  actions?: boolean;
}): Promise<WhatsAppResult> {
  const withButtons = opts.actions && process.env.WHATSAPP_TEMPLATE_ALERT_ACTIONS;
  return sendTemplate(
    opts.phone,
    withButtons || process.env.WHATSAPP_TEMPLATE_ALERT || "aviso_nexusfi",
    [
      opts.name || "tudo bem",
      opts.companyName || "sua empresa",
      // A Meta limita cada variável; o aviso cabe folgado em 900 caracteres.
      opts.text.slice(0, 900),
    ],
    withButtons ? ["PAGO", "DETALHES"] : undefined
  );
}

/**
 * Aviso pro FORNECEDOR (portal de compras: convite e mudança de status do
 * pedido). Template próprio em WHATSAPP_TEMPLATE_SUPPLIER (3 variáveis, mesmo
 * corpo do aviso: nome, empresa, texto); sem ele, usa o template de aviso.
 */
export async function sendWhatsAppSupplierNotice(opts: {
  phone: string | undefined | null;
  name: string;
  companyName: string;
  text: string;
}): Promise<WhatsAppResult> {
  return sendTemplate(
    opts.phone,
    process.env.WHATSAPP_TEMPLATE_SUPPLIER || process.env.WHATSAPP_TEMPLATE_ALERT || "aviso_nexusfi",
    [opts.name || "tudo bem", opts.companyName || "sua empresa", opts.text.slice(0, 900)],
  );
}

/** Link wa.me com a mensagem pré-preenchida — fallback quando a API não está configurada. */
export function waMeLink(phone: string | undefined | null, text: string): string | null {
  const to = toWhatsAppNumber(phone);
  return to ? `https://wa.me/${to}?text=${encodeURIComponent(text)}` : null;
}

/** Texto livre — só vale dentro da janela de 24h aberta por uma mensagem do cliente. */
export async function sendWhatsAppText(phone: string | undefined | null, text: string): Promise<WhatsAppResult> {
  if (!isWhatsAppConfigured()) return { ok: false, reason: "not_configured" };
  const to = toWhatsAppNumber(phone);
  if (!to) return { ok: false, reason: "invalid_phone" };
  return graphPost({ messaging_product: "whatsapp", to, type: "text", text: { body: text.slice(0, 4000) } });
}

/** Baixa o arquivo (imagem/PDF) que o cliente mandou. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const auth = { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` };
    const meta = (await (await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, { headers: auth })).json()) as { url?: string; mime_type?: string };
    if (!meta.url) return null;
    const res = await fetch(meta.url, { headers: auth });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) return null;
    return { base64: buf.toString("base64"), mimeType: meta.mime_type || "image/jpeg" };
  } catch {
    return null;
  }
}

/** Envia um template aprovado com as variáveis do corpo, na ordem. */
async function sendTemplate(
  phone: string | undefined | null, name: string, vars: string[], buttonPayloads?: string[]
): Promise<WhatsAppResult> {
  if (!isWhatsAppConfigured()) return { ok: false, reason: "not_configured" };
  const to = toWhatsAppNumber(phone);
  if (!to) return { ok: false, reason: "invalid_phone" };

  const body = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "pt_BR" },
      components: [
        { type: "body", parameters: vars.map(param) },
        ...(buttonPayloads ?? []).map((payload, index) => ({
          type: "button", sub_type: "quick_reply", index: String(index), parameters: [{ type: "payload", payload }],
        })),
      ],
    },
  };
  return graphPost(body);
}

async function graphPost(body: Record<string, unknown>): Promise<WhatsAppResult> {
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
