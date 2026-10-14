// app/api/webhooks/whatsapp/route.ts
// Webhook da WhatsApp Cloud API (Meta): recebe o que o dono responde ao número
// da NexusFi — "paguei", botões dos avisos, foto de nota, perguntas. A lógica
// está em lib/whatsappInbound.ts.
//
// GET  → verificação do webhook (hub.verify_token = WHATSAPP_VERIFY_TOKEN).
// POST → eventos, assinados com HMAC-SHA256 (X-Hub-Signature-256) usando o
//        segredo do app (WHATSAPP_APP_SECRET). Assinatura inválida → 401.
//        Responde 200 logo e processa depois (`after`) — a Meta reenvia se demorar.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { after, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { extractMessages, handleInbound, verifySignature } from "@/lib/whatsappInbound";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === token) {
    return new Response(q.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const messages = extractMessages(body);
  if (messages.length) {
    after(async () => {
      const db = await getAdminDb();
      for (const m of messages) {
        try {
          await handleInbound(db, m);
        } catch (err) {
          console.error("[webhook whatsapp] falhou:", err);
        }
      }
    });
  }
  return NextResponse.json({ ok: true });
}
