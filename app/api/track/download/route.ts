// app/api/track/download/route.ts
// Registra o clique no botão "Baixar app" da landing, pra contar PESSOAS
// ÚNICAS que tentaram baixar (o download_count do GitHub — lib/analytics/
// downloads.ts — conta cada download, inclusive repetidos e auto-update).
// Só vale pra quem clica no botão: link direto pro GitHub não passa por aqui.
//
// "Pessoa" = o mesmo cookie de visitante do resto do analytics (nxfi_vid),
// ou seja, um navegador/dispositivo. Mesmo espírito de app/api/track: sempre
// 204, nunca trava o clique de quem chamou.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isBotUserAgent } from "@/lib/analytics/bots";
import {
  DOWNLOAD_CLICKERS_COLLECTION,
  DOWNLOAD_SUMMARY_COLLECTION,
  DOWNLOAD_SUMMARY_DOC,
} from "@/lib/analytics/downloadClicks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "nxfi_vid";
const UUID_RE = /^[0-9a-f-]{36}$/i;

const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest): Promise<Response> {
  try {
    if (isBotUserAgent(req.headers.get("user-agent"))) return noContent();

    const jar = await cookies();
    const vid = jar.get(VISITOR_COOKIE)?.value;
    if (!vid || !UUID_RE.test(vid)) return noContent();

    const db = await getAdminDb();
    const now = Timestamp.now();
    const markerRef = db.collection(DOWNLOAD_CLICKERS_COLLECTION).doc(vid);
    const summaryRef = db.collection(DOWNLOAD_SUMMARY_COLLECTION).doc(DOWNLOAD_SUMMARY_DOC);

    await db.runTransaction(async (tx) => {
      const marker = await tx.get(markerRef);
      const novo = !marker.exists;

      tx.set(
        summaryRef,
        {
          uniquePeople: FieldValue.increment(novo ? 1 : 0),
          clicks: FieldValue.increment(1),
          updatedAt: now,
        },
        { merge: true }
      );

      if (novo) {
        tx.set(markerRef, { firstClick: now, lastClick: now, clicks: 1 });
      } else {
        tx.update(markerRef, { lastClick: now, clicks: FieldValue.increment(1) });
      }
    });

    return noContent();
  } catch (e) {
    console.error("[track/download]", e);
    return noContent();
  }
}
