// app/api/chat/route.ts
// Backend do chatbot da landing pública (WhatsAppFab.tsx). Rota pública,
// sem autenticação — qualquer visitante do site pode chamar.
//
// Sem ANTHROPIC_API_KEY configurada no ambiente, ou em qualquer erro/limite
// de taxa, devolve { reply: null } e o front mostra a mensagem de fallback
// (traduzida) + botão pro WhatsApp. Nunca expõe detalhe técnico do erro.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const ANTHROPIC_MODEL = "claude-sonnet-5";
const MAX_MESSAGE_LEN = 800;
const MAX_HISTORY_TURNS = 6;

const SYSTEM_PROMPT = `Você é o Midas, assistente virtual da NexusFi, uma plataforma de gestão financeira para empresas (fluxo de caixa, contas a pagar e receber, impostos, estoque com integração a marketplaces, painel de vendas e precificação, centro de custos e relatórios, gestão de equipe com permissões e PIN de segurança, planos com teste grátis).

Responda sempre no mesmo idioma da última mensagem do visitante. Seja breve (no máximo 3-4 frases), direto e cordial. Fale apenas sobre a NexusFi e finanças relacionadas ao produto. Se a pergunta for sobre preço exato, dado da conta do visitante, ou algo que você não tem certeza, diga que não tem essa informação e sugira falar com o time no WhatsApp. Nunca invente funcionalidades que não foram descritas aqui.`;

type ChatTurn = { role: "user" | "bot"; text: string };

interface ChatRequestBody {
  message?: unknown;
  history?: unknown;
}

function sanitizeHistory(history: unknown): ChatTurn[] {
  if (!Array.isArray(history)) return [];
  const turns: ChatTurn[] = [];
  for (const item of history) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const text = (item as { text?: unknown }).text;
    if ((role === "user" || role === "bot") && typeof text === "string" && text.trim()) {
      turns.push({ role, text: text.slice(0, MAX_MESSAGE_LEN) });
    }
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}

export async function POST(request: Request) {
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ reply: null }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ reply: null }, { status: 400 });
  }

  const ip = getClientIp(request);
  const { limited } = checkRateLimit(`chat:${ip}`, { windowMs: 5 * 60 * 1000, max: 10 });
  if (limited) {
    return NextResponse.json({ reply: null }, { status: 200 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ reply: null }, { status: 200 });
  }

  const history = sanitizeHistory(body.history);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          ...history.map((turn) => ({
            role: turn.role === "user" ? "user" : "assistant",
            content: turn.text.slice(0, MAX_MESSAGE_LEN),
          })),
          { role: "user", content: message.slice(0, MAX_MESSAGE_LEN) },
        ],
      }),
    });

    if (!res.ok) {
      return NextResponse.json({ reply: null }, { status: 200 });
    }

    const data = await res.json();
    const block = Array.isArray(data?.content)
      ? data.content.find((c: { type?: string }) => c?.type === "text")
      : null;
    const reply = typeof block?.text === "string" ? block.text.trim() : "";

    return NextResponse.json({ reply: reply || null }, { status: 200 });
  } catch {
    return NextResponse.json({ reply: null }, { status: 200 });
  }
}
