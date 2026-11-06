// POST /api/midas/lead — salva/atualiza o lead da demo do Midas (público).
// Sempre responde { ok } e nunca expõe erro técnico.
import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { sendWhatsAppAlert, isWhatsAppConfigured, toWhatsAppNumber } from "@/lib/whatsapp";
import { sanitizeLeadInput, upsertLead, setWhatsAppResult } from "@/lib/midas/leadServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEAM_WHATSAPP_FALLBACK = "5511926198042";

export async function POST(request: Request) {
  try {
    const { limited } = checkRateLimit(`midas-lead:${getClientIp(request)}`, { windowMs: 5 * 60 * 1000, max: 60 });
    if (limited) return NextResponse.json({ ok: false }, { status: 200 });

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false }, { status: 200 });
    }
    const input = sanitizeLeadInput(body);
    if (!input) return NextResponse.json({ ok: false }, { status: 200 });

    const db = await getAdminDb();
    const { justCompleted } = await upsertLead(db, input, Date.now());

    if (justCompleted) {
      let result: "sent" | "not_configured" | "failed" = "failed";
      try {
        const phone = toWhatsAppNumber(process.env.MENTOR_LEAD_WHATSAPP || TEAM_WHATSAPP_FALLBACK);
        if (!isWhatsAppConfigured() || !phone) {
          result = "not_configured";
        } else {
          const text = [
            "Novo lead concluiu a demo do Midas",
            input.segment ? `segmento: ${input.segment}` : null,
            input.mainPain ? `dor: ${input.mainPain}` : null,
            input.currentTools.length ? `usa: ${input.currentTools.slice(0, 3).join(", ")}` : null,
          ]
            .filter(Boolean)
            .join(" | ");
          const r = await sendWhatsAppAlert({ phone, name: "equipe", companyName: "NexusFi", text });
          result = r.ok ? "sent" : r.reason === "not_configured" ? "not_configured" : "failed";
        }
      } catch {
        result = "failed";
      }
      await setWhatsAppResult(db, input.sessionId, result);
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
