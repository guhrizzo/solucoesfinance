// lib/analytics/downloadClicks.ts
// Leitura dos cliques no botão "Baixar app" da landing (gravados por
// app/api/track/download). Server-only (Admin SDK). Sem TTL: é o total de
// pessoas que já clicaram, não uma janela.

import { getAdminDb } from "@/lib/firebaseAdmin";

/** Um doc por visitante (id = cookie nxfi_vid): firstClick, lastClick, clicks. */
export const DOWNLOAD_CLICKERS_COLLECTION = "analytics_download_clickers";
/** Agregado: doc único com uniquePeople e clicks. */
export const DOWNLOAD_SUMMARY_COLLECTION = "analytics_summary";
export const DOWNLOAD_SUMMARY_DOC = "desktop_download";

export interface DownloadClicksOverview {
  pessoasUnicas: number;
  cliques: number;
  erro: boolean;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export async function getDownloadClicks(): Promise<DownloadClicksOverview> {
  try {
    const db = await getAdminDb();
    const snap = await db.collection(DOWNLOAD_SUMMARY_COLLECTION).doc(DOWNLOAD_SUMMARY_DOC).get();
    return {
      pessoasUnicas: num(snap.get("uniquePeople")),
      cliques: num(snap.get("clicks")),
      erro: false,
    };
  } catch (e) {
    console.error("[analytics/downloadClicks]", e);
    return { pessoasUnicas: 0, cliques: 0, erro: true };
  }
}
