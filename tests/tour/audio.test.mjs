import test from "node:test";
import assert from "node:assert/strict";
import {
  getNarrationAudio,
  getNarrationText,
  getVoiceConfig,
  isTourLocale,
  isTourStepId,
  narrationCacheKey,
  ElevenLabsError,
  __resetNarrationCacheForTests,
} from "@/lib/tour/audioService.ts";
import { TOUR_STEP_IDS } from "@/lib/tour/catalog.ts";
import { readFileSync } from "node:fs";

const bundles = Object.fromEntries(
  ["pt-BR", "en", "es"].map((l) => [l, JSON.parse(readFileSync(new URL(`../../messages/${l}/tour.json`, import.meta.url), "utf8"))])
);

const voice = getVoiceConfig({});

test("todo passo tem texto de narração nos 3 idiomas", () => {
  for (const l of ["pt-BR", "en", "es"]) for (const id of TOUR_STEP_IDS) assert.ok(getNarrationText(bundles, l, id), `${l}/${id}`);
});

test("validação de entrada", () => {
  assert.equal(isTourLocale("fr"), false);
  assert.equal(isTourStepId("../etc/passwd"), false);
  assert.equal(isTourStepId("fluxoCaixa"), true);
  assert.equal(getNarrationText(bundles, "pt-BR", "nao-existe"), null);
});

test("chave de cache muda com texto e voz", () => {
  const a = narrationCacheKey("oi", voice);
  assert.notEqual(a, narrationCacheKey("oi!", voice));
  assert.notEqual(a, narrationCacheKey("oi", { ...voice, voiceId: "outra" }));
  assert.equal(a, narrationCacheKey("oi", voice));
});

test("sintetiza uma vez só (cache + dedupe) e envia a chave só no header", async () => {
  __resetNarrationCacheForTests();
  let calls = 0;
  let seen;
  const fetchImpl = async (url, init) => {
    calls++;
    seen = { url, init };
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  };
  const [a, b] = await Promise.all([
    getNarrationAudio("texto", voice, "k", { fetchImpl }),
    getNarrationAudio("texto", voice, "k", { fetchImpl }),
  ]);
  await getNarrationAudio("texto", voice, "k", { fetchImpl });
  assert.equal(calls, 1);
  assert.deepEqual([...a], [1, 2, 3]);
  assert.equal(a, b);
  assert.equal(seen.init.headers["xi-api-key"], "k");
  assert.ok(!seen.url.includes("k="));
  assert.ok(JSON.parse(seen.init.body).text === "texto");
});

test("erro da ElevenLabs propaga e não fica em cache", async () => {
  __resetNarrationCacheForTests();
  const bad = async () => new Response("no", { status: 401 });
  await assert.rejects(getNarrationAudio("x", voice, "k", { fetchImpl: bad }), ElevenLabsError);
  const ok = async () => new Response(new Uint8Array([9]), { status: 200 });
  assert.deepEqual([...(await getNarrationAudio("x", voice, "k", { fetchImpl: ok }))], [9]);
});

test("cache persistente é consultado antes da API e preenchido depois", async () => {
  __resetNarrationCacheForTests();
  const store = new Map();
  const persistent = { get: async (k) => store.get(k) ?? null, set: async (k, d) => void store.set(k, d) };
  let calls = 0;
  const fetchImpl = async () => (calls++, new Response(new Uint8Array([7]), { status: 200 }));
  await getNarrationAudio("p", voice, "k", { fetchImpl, persistent });
  assert.equal(store.size, 1);
  __resetNarrationCacheForTests();
  await getNarrationAudio("p", voice, "k", { fetchImpl, persistent });
  assert.equal(calls, 1);
});
