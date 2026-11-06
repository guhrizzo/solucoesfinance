// lib/midas/prompt.ts
// Prompt do sistema e parser do turno de IA opcional do Midas (/api/midas/turn).
import { MIDAS_MODULES } from "./modules";
import { TRIAL_DAYS } from "@/lib/billingPlans";
import type { Context, Pain, Segment, Tool } from "./types";

const SEGMENTS: Segment[] = ["loja", "ecommerce", "servicos", "industria", "distribuidora", "outro"];
const PAINS: Pain[] = ["financeiro", "contas", "estoque", "vendas", "impostos", "relatorios", "canais", "tudo"];
const TOOLS: Tool[] = ["planilha", "caderno", "sistema", "app_banco", "memoria", "contagem", "marketplace", "nenhum"];

export const MAX_REPLY_LEN = 800;

// Descrições fiéis a messages/pt-BR/midas.json (módulos).
const DESCRIPTIONS: Record<string, string> = {
  fluxoCaixa: "entradas e saídas de dinheiro ao longo do tempo, com saldo e movimentações por categoria",
  contasPagar: "compromissos com vencimento, mostrando o que está pendente e o que já foi pago",
  contasReceber: "o que os clientes ainda vão pagar, o que já foi recebido e o que está em aberto ou atrasado",
  relatorios: "análises como Fluxo de Caixa, Faturamento, Gastos, DRE e Vendas a partir dos lançamentos",
  estoque: "cadastro de produtos e acompanhamento das quantidades, com entradas e saídas",
  vendas: "vendas dos canais conectados e vendas manuais, com indicadores de desempenho",
  integracoes: "conexão com os marketplaces Mercado Livre e TikTok Shop para trazer produtos e pedidos (autorizada na aba Estoque)",
  impostos: "registro e acompanhamento dos impostos da empresa e seus vencimentos",
  centroCustos: "organiza as despesas por área, projeto ou finalidade da empresa",
  dashboard: "indicadores num só lugar: resultado do período, comparação com o período anterior, projeção de caixa, vencimentos e alertas",
  cobrancaEmail: "cobranças por e-mail a partir das contas a receber, com Pix copia e cola e lembretes de vencimento",
  leitorNf: "inteligência artificial que identifica retenções em notas fiscais e cria os lançamentos",
  rh: "cadastro de pessoas, custo da equipe, comissões e folha com holerite",
  pdv: "frente de caixa com abertura e fechamento de caixa por turno",
  alertasWhatsapp: "avisos ao dono sobre caixa, estoque e contas pelo WhatsApp",
};

export function buildSystemPrompt(_locale: string): string {
  const modules = MIDAS_MODULES.map(
    (m) => `- ${m.id}${m.pro ? " (plano Pro)" : ""}: ${DESCRIPTIONS[m.id] ?? m.id}`
  ).join("\n");
  const list = (a: readonly string[]) => a.map((v) => `"${v}"`).join(", ");

  return `Você é o Midas, assistente consultivo da NexusFi, plataforma de gestão financeira para empresas. Seu papel é entender o negócio do visitante e apresentar, com calma, o que pode ajudar. Não seja insistente nem vendedor.

Responda sempre no idioma em que o visitante escreve.

Módulos do NexusFi (lista fechada, não cite nada fora dela):
${modules}

Regras:
- Nunca invente preços, descontos, integrações, resultados ou funcionalidades.
- Marketplaces disponíveis para visitantes: apenas Mercado Livre e TikTok Shop. Não mencione Shein nem Shopee.
- O teste grátis dura ${TRIAL_DAYS} dias. Não cite valores nem condições além disso.
- Se não tiver certeza, diga que não sabe e indique o botão do WhatsApp para falar com uma pessoa.
- Responda em no máximo 3 frases curtas.

Formato de saída: responda SOMENTE com JSON, sem texto fora dele:
{"slots":{"segment"?,"pain"?,"tool"?,"visibilityGap"?},"reply":"..."}
Preencha em "slots" apenas o que o visitante revelou, com valores exatos destas listas:
- segment: ${list(SEGMENTS)}
- pain: ${list(PAINS)}
- tool: ${list(TOOLS)}
- visibilityGap: true (se ele diz não ter clareza de como o negócio está) ou omita.`;
}

export function parseTurn(raw: string): { slots: Partial<Context>; reply?: string } | null {
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;
  const o = obj as Record<string, unknown>;
  const s = typeof o.slots === "object" && o.slots !== null && !Array.isArray(o.slots) ? (o.slots as Record<string, unknown>) : {};

  const slots: Partial<Context> = {};
  if (SEGMENTS.includes(s.segment as Segment)) slots.segment = s.segment as Segment;
  if (PAINS.includes(s.pain as Pain)) slots.pain = s.pain as Pain;
  if (TOOLS.includes(s.tool as Tool)) slots.tool = s.tool as Tool;
  if (s.visibilityGap === true) slots.visibilityGap = true;

  const out: { slots: Partial<Context>; reply?: string } = { slots };
  if (typeof o.reply === "string") {
    const reply = o.reply.trim().slice(0, MAX_REPLY_LEN);
    if (reply) out.reply = reply;
  }
  return out;
}
