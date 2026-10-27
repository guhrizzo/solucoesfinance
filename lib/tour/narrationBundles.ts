// lib/tour/narrationBundles.ts
// Textos de narração por idioma (mesma fonte do modal). Separado do
// audioService para este poder ser testado com node --test (sem JSON import).
import ptBR from "@/messages/pt-BR/tour.json";
import en from "@/messages/en/tour.json";
import es from "@/messages/es/tour.json";
import type { NarrationBundles } from "./audioService";

export const NARRATION_BUNDLES: NarrationBundles = { "pt-BR": ptBR, en, es };
