// app/api/tour/audio/route.ts
// Narração do tour guiado (ElevenLabs). Exige login; o texto vem do catálogo
// (nunca do cliente); rate limit por usuário; cache em memória + Storage.
// Sem ELEVENLABS_API_KEY → 503 e o front segue só com o texto.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireScope, isScopeError } from "@/lib/apiScope";
import { checkRateLimit } from "@/lib/rateLimit";
import { getAdminBucket } from "@/lib/firebaseAdmin";
import {
  getNarrationAudio,
  getNarrationText,
  getVoiceConfig,
  isTourLocale,
  isTourStepId,
  type PersistentCache,
} from "@/lib/tour/audioService";
import { NARRATION_BUNDLES } from "@/lib/tour/narrationBundles";

const storageCache: PersistentCache = {
  async get(key) {
    const file = (await getAdminBucket()).file(`tour-audio/${key}.mp3`);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [data] = await file.download();
    return data;
  },
  async set(key, data) {
    await (await getAdminBucket()).file(`tour-audio/${key}.mp3`).save(data, {
      contentType: "audio/mpeg",
      resumable: false,
    });
  },
};

export async function POST(request: Request) {
  const scope = await requireScope(request);
  if (isScopeError(scope)) return NextResponse.json({ error: scope.error }, { status: scope.status });

  let body: { stepId?: unknown; locale?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!isTourStepId(body.stepId) || !isTourLocale(body.locale)) {
    return NextResponse.json({ error: "invalid_params" }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const text = getNarrationText(NARRATION_BUNDLES, body.locale, body.stepId);
  if (!text) return NextResponse.json({ error: "invalid_params" }, { status: 400 });

  // 40 narrações a cada 10 min por usuário cobre o tour completo várias vezes.
  const rl = checkRateLimit(`tour-audio:${scope.uid}`, { windowMs: 10 * 60 * 1000, max: 40 });
  if (rl.limited) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }

  try {
    const audio = await getNarrationAudio(text, getVoiceConfig(), apiKey, { persistent: storageCache });
    return new Response(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.length),
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err) {
    // Só o status vai pro log — nada de chave, texto ou corpo da resposta.
    console.error("[tour/audio] falha ao gerar narração", err instanceof Error ? err.message : "erro");
    return NextResponse.json({ error: "upstream_failed" }, { status: 502 });
  }
}
