// lib/tour/audioService.ts
// Camada de serviço da narração do tour (ElevenLabs). SOMENTE servidor.
//
// - O cliente nunca manda texto: manda (stepId, locale) e o texto sai de
//   messages/<locale>/tour.json. Assim a rota não vira proxy livre da API.
// - Configuração de voz centralizada aqui (env sobrescreve os padrões).
// - fetch injetável para testes (nunca gasta cota real da ElevenLabs).

import { createHash } from "node:crypto";
import { TOUR_STEP_IDS } from "./catalog";

export const TOUR_LOCALES = ["pt-BR", "en", "es"] as const;
export type TourLocale = (typeof TOUR_LOCALES)[number];

export type NarrationBundles = Record<TourLocale, { steps: Record<string, { audio?: string }> }>;

export interface VoiceConfig {
  voiceId: string;
  modelId: string;
  outputFormat: string;
  settings: { stability: number; similarity_boost: number; style: number; use_speaker_boost: boolean };
}

// Modelo multilíngue (cobre pt-BR com sotaque natural). Troque a voz em
// ELEVENLABS_VOICE_ID — escolha na ElevenLabs uma voz com bom pt-BR; o padrão
// é uma voz pré-fabricada da biblioteca e deve ser revisada por quem opera.
// Para menor latência/custo, ELEVENLABS_MODEL_ID=eleven_flash_v2_5.
export function getVoiceConfig(env: NodeJS.ProcessEnv = process.env): VoiceConfig {
  return {
    voiceId: env.ELEVENLABS_VOICE_ID?.trim() || "21m00Tcm4TlvDq8ikWAM",
    modelId: env.ELEVENLABS_MODEL_ID?.trim() || "eleven_multilingual_v2",
    outputFormat: "mp3_44100_64",
    settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
  };
}

export function isTourLocale(v: unknown): v is TourLocale {
  return typeof v === "string" && (TOUR_LOCALES as readonly string[]).includes(v);
}

export function isTourStepId(v: unknown): v is string {
  return typeof v === "string" && TOUR_STEP_IDS.includes(v);
}

/** `bundles` vem de lib/tour/narrationBundles.ts (JSONs de messages/<locale>/tour.json). */
export function getNarrationText(bundles: NarrationBundles, locale: TourLocale, stepId: string): string | null {
  const text = bundles[locale]?.steps?.[stepId]?.audio;
  return typeof text === "string" && text.trim() ? text : null;
}

/** Chave de cache: muda se o texto, a voz ou o modelo mudarem. */
export function narrationCacheKey(text: string, voice: VoiceConfig): string {
  return createHash("sha256").update(`${voice.voiceId}|${voice.modelId}|${voice.outputFormat}|${text}`).digest("hex");
}

export class ElevenLabsError extends Error {
  status: number;
  constructor(status: number) {
    super(`ElevenLabs respondeu ${status}`);
    this.status = status;
  }
}

export async function synthesize(
  text: string,
  voice: VoiceConfig,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 20_000
): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice.voiceId)}?output_format=${voice.outputFormat}`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: voice.modelId, voice_settings: voice.settings }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new ElevenLabsError(res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0) throw new ElevenLabsError(502);
  return buf;
}

// Cache em memória (por instância) + dedupe de requisições simultâneas.
const MEM_MAX = 40;
const mem = new Map<string, Buffer>();
const inflight = new Map<string, Promise<Buffer>>();

export interface PersistentCache {
  get(key: string): Promise<Buffer | null>;
  set(key: string, data: Buffer): Promise<void>;
}

/** Devolve o áudio do cache (memória → persistente) ou sintetiza uma única vez. */
export async function getNarrationAudio(
  text: string,
  voice: VoiceConfig,
  apiKey: string,
  opts: { fetchImpl?: typeof fetch; persistent?: PersistentCache } = {}
): Promise<Buffer> {
  const key = narrationCacheKey(text, voice);
  const hit = mem.get(key);
  if (hit) return hit;
  const pending = inflight.get(key);
  if (pending) return pending;

  const job = (async () => {
    const stored = await opts.persistent?.get(key).catch(() => null);
    if (stored) return stored;
    const audio = await synthesize(text, voice, apiKey, opts.fetchImpl);
    await opts.persistent?.set(key, audio).catch(() => undefined);
    return audio;
  })();
  inflight.set(key, job);
  try {
    const audio = await job;
    if (mem.size >= MEM_MAX) mem.delete(mem.keys().next().value as string);
    mem.set(key, audio);
    return audio;
  } finally {
    inflight.delete(key);
  }
}

export function __resetNarrationCacheForTests() {
  mem.clear();
  inflight.clear();
}
