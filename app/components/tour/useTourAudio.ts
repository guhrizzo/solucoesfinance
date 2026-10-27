"use client";

// Player da narração do tour. Um único <audio> por provider: iniciar uma
// narração sempre interrompe a anterior (nunca dois áudios ao mesmo tempo).
// O áudio vem de /api/tour/audio (ElevenLabs, gerado no servidor); a chave
// nunca chega ao navegador.

import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetch } from "@/lib/authedFetch";

export type AudioStatus =
  | "idle"
  | "loading"
  | "playing"
  | "paused"
  | "ended"
  | "error"
  | "unavailable"
  | "offline"
  | "blocked";

const VOLUME_KEY = "nexusfi-tour-volume";

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) && v > 0 && v <= 1 ? v : 1;
  } catch {
    return 1;
  }
}

export function useTourAudio(locale: string) {
  const [status, setStatus] = useState<AudioStatus>("idle");
  const [volume, setVolumeState] = useState(1);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlsRef = useRef(new Map<string, string>());
  const abortRef = useRef<AbortController | null>(null);
  const currentRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const volumeRef = useRef(1);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "auto";
      a.volume = volumeRef.current;
      a.addEventListener("ended", () => setStatus("ended"));
      a.addEventListener("playing", () => setStatus("playing"));
      a.addEventListener("error", () => {
        if (a.src) setStatus("error");
      });
      audioRef.current = a;
    }
    return audioRef.current;
  }, []);

  const stop = useCallback(() => {
    requestRef.current++; // invalida qualquer carregamento em andamento
    abortRef.current?.abort();
    abortRef.current = null;
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    currentRef.current = null;
    setStatus("idle");
  }, []);

  const play = useCallback(
    async (stepId: string) => {
      stop();
      const myRequest = requestRef.current;
      currentRef.current = stepId;

      if (typeof navigator !== "undefined" && navigator.onLine === false && !urlsRef.current.has(`${locale}:${stepId}`)) {
        setStatus("offline");
        return;
      }

      const cacheKey = `${locale}:${stepId}`;
      let url = urlsRef.current.get(cacheKey);
      try {
        if (!url) {
          setStatus("loading");
          const ctrl = new AbortController();
          abortRef.current = ctrl;
          const res = await authedFetch("/api/tour/audio", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ stepId, locale }),
            signal: ctrl.signal,
          });
          if (myRequest !== requestRef.current) return;
          if (res.status === 503) return setStatus("unavailable");
          if (!res.ok) return setStatus("error");
          const blob = await res.blob();
          if (myRequest !== requestRef.current) return;
          url = URL.createObjectURL(blob);
          urlsRef.current.set(cacheKey, url);
        }
        const a = ensureAudio();
        a.src = url;
        a.volume = volumeRef.current;
        await a.play();
      } catch (err) {
        if (myRequest !== requestRef.current) return; // cancelado de propósito
        if ((err as DOMException)?.name === "NotAllowedError") return setStatus("blocked");
        if (typeof navigator !== "undefined" && navigator.onLine === false) return setStatus("offline");
        setStatus("error");
      }
    },
    [ensureAudio, locale, stop]
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
    setStatus((s) => (s === "playing" ? "paused" : s));
  }, []);

  const resume = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.play().catch(() => setStatus("blocked"));
  }, []);

  const replay = useCallback(() => {
    const id = currentRef.current;
    if (id) void play(id);
  }, [play]);

  const setVolume = useCallback((v: number) => {
    const next = Math.min(1, Math.max(0, v));
    volumeRef.current = next;
    setVolumeState(next);
    if (audioRef.current) audioRef.current.volume = next;
    try {
      localStorage.setItem(VOLUME_KEY, String(next));
    } catch {
      /* armazenamento indisponível — só não lembra o volume */
    }
  }, []);

  useEffect(() => {
    const v = readVolume();
    volumeRef.current = v;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restaura o volume salvo uma vez, após a hidratação
    setVolumeState(v);
    const urls = urlsRef.current;
    const req = requestRef;
    return () => {
      req.current++;
      abortRef.current?.abort();
      audioRef.current?.pause();
      audioRef.current = null;
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  return { status, volume, play, pause, resume, replay, stop, setVolume };
}
