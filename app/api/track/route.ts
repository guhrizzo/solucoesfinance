// app/api/track/route.ts
// Registra uma visita à plataforma (analytics de acesso — ver
// docs/superpowers/specs/2026-09-15-analytics-visitantes-plataforma-design.md).
//
// Diferente das rotas normais deste app: um Bearer ausente/inválido é um caso
// VÁLIDO aqui (visitante anônimo), não um erro — por isso não usa
// lib/apiScope.ts (que falha sem token). Sempre responde 204, mesmo em erro
// interno — nunca deve travar a navegação de quem chamou.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  FieldValue,
  Timestamp,
  type Transaction,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { isBotUserAgent } from "@/lib/analytics/bots";
import { dayKey, monthKey } from "@/lib/analytics/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISITOR_COOKIE = "nxfi_vid";
const DIA_MS = 24 * 60 * 60 * 1000;
const TTL_DIA_DIAS = 60;
const TTL_MES_DIAS = 400;
const UUID_RE = /^[0-9a-f-]{36}$/i;
const MAX_PATH_LEN = 512;
// Limite defensivo pro map de páginas — um path absurdamente comprido não
// deveria nem existir nas rotas reais do app, mas evita inflar o doc.
const MAX_PATH_KEY_LEN = 200;

const noContent = () => new NextResponse(null, { status: 204 });

function bearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer (.+)$/.exec(h.trim());
  return m ? m[1] : null;
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json().catch(() => null)) as { path?: unknown } | null;
    let path = typeof body?.path === "string" ? body.path : "";
    if (!path.startsWith("/") || path.length > MAX_PATH_LEN) return noContent();
    path = path.split("?")[0].split("#")[0];

    if (isBotUserAgent(req.headers.get("user-agent"))) return noContent();

    const jar = await cookies();
    const vid = jar.get(VISITOR_COOKIE)?.value;
    if (!vid || !UUID_RE.test(vid)) return noContent();

    // "Logado" = Bearer de um ID token válido. Ausência não é erro — só
    // conta como visita anônima (ver cabeçalho do arquivo).
    let logged = false;
    const token = bearerToken(req);
    if (token) {
      try {
        await (await getAdminAuth()).verifyIdToken(token);
        logged = true;
      } catch {
        logged = false;
      }
    }

    const db = await getAdminDb();
    const now = Timestamp.now();
    const day = dayKey();
    const month = monthKey();

    await registrarVisita(db, { day, month, vid, logged, now });

    await db
      .collection("analytics_page_daily")
      .doc(day)
      .set(
        {
          date: day,
          views: { [path.slice(0, MAX_PATH_KEY_LEN)]: FieldValue.increment(1) },
          updatedAt: now,
        },
        { merge: true }
      );

    return noContent();
  } catch (e) {
    console.error("[track]", e);
    return noContent();
  }
}

async function registrarVisita(
  db: Firestore,
  { day, month, vid, logged, now }: { day: string; month: string; vid: string; logged: boolean; now: Timestamp }
): Promise<void> {
  const dailyRef = db.collection("analytics_daily").doc(day);
  const monthlyRef = db.collection("analytics_monthly").doc(month);
  const dailyMarker = dailyRef.collection("visitors").doc(vid);
  const monthlyMarker = monthlyRef.collection("visitors").doc(vid);

  await db.runTransaction(async (tx) => {
    const [dm, mm] = await Promise.all([tx.get(dailyMarker), tx.get(monthlyMarker)]);

    aplicar(tx, dailyRef, dailyMarker, dm, day, logged, now, TTL_DIA_DIAS);
    aplicar(tx, monthlyRef, monthlyMarker, mm, month, logged, now, TTL_MES_DIAS);
  });
}

function aplicar(
  tx: Transaction,
  aggRef: DocumentReference,
  markerRef: DocumentReference,
  snap: DocumentSnapshot,
  dateStr: string,
  logged: boolean,
  now: Timestamp,
  ttlDias: number
): void {
  const novo = !snap.exists;
  const precisaLogado = logged && (novo || snap.get("logged") !== true);

  tx.set(
    aggRef,
    {
      date: dateStr,
      pageviews: FieldValue.increment(1),
      uniqueVisitors: FieldValue.increment(novo ? 1 : 0),
      loggedVisitors: FieldValue.increment(precisaLogado ? 1 : 0),
      updatedAt: now,
    },
    { merge: true }
  );

  if (novo) {
    tx.set(markerRef, {
      firstSeen: now,
      logged,
      expiresAt: Timestamp.fromMillis(now.toMillis() + ttlDias * DIA_MS),
    });
  } else if (precisaLogado) {
    tx.update(markerRef, { logged: true });
  }
}
