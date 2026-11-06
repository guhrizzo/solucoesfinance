// app/api/midas/turn/route.ts
// Turno de IA opcional do Midas (landing). Público. Sem chave, erro, limite ou
// falta de consentimento → { reply: null, slots: {} } e o front segue o fluxo
// determinístico. Nunca expõe detalhe técnico.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { buildSystemPrompt, parseTurn } from "@/lib/midas/prompt";

const ANTHROPIC_MODEL = "claude-sonnet-5";
const MAX_MESSAGE_LEN = 800;
const MAX_HISTORY_TURNS = 6;
const TIMEOUT_MS = 12_000;

type ChatTurn = { role: "user" | "bot"; text: string };

const empty = () => NextResponse.json({ reply: null, slots: {} }, { status: 200 });

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
  try {
    let body: { message?: unknown; history?: unknown; locale?: unknown; consented?: unknown };
    try {
      body = await request.json();
    } catch {
      return empty();
    }
    if (body?.consented !== true) return empty();

    const message = typeof body.message === "string" ? body.message.trim().slice(0, MAX_MESSAGE_LEN) : "";
    if (!message) return empty();

    const { limited } = checkRateLimit(`midas-turn:${getClientIp(request)}`, { windowMs: 5 * 60 * 1000, max: 20 });
    if (limited) return empty();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return empty();

    const locale = typeof body.locale === "string" ? body.locale : "pt-BR";
    const history = sanitizeHistory(body.history);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 400,
          system: buildSystemPrompt(locale),
          messages: [
            ...history.map((t) => ({ role: t.role === "user" ? "user" : "assistant", content: t.text })),
            { role: "user", content: message },
          ],
        }),
      });
      if (!res.ok) return empty();
      const data = await res.json();
      const block = Array.isArray(data?.content) ? data.content.find((c: { type?: string }) => c?.type === "text") : null;
      const parsed = typeof block?.text === "string" ? parseTurn(block.text) : null;
      if (!parsed) return empty();
      return NextResponse.json({ reply: parsed.reply ?? null, slots: parsed.slots }, { status: 200 });
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return empty();
  }
}
