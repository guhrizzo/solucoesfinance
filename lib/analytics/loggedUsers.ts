// lib/analytics/loggedUsers.ts
// Lista de contas que acessaram a plataforma LOGADAS nos últimos dias — pra
// aba Analytics de /configuracoes (só adm supremo, ver
// app/api/analytics/route.ts) enxergar quem, não só quantos.
//
// Fonte: o mesmo marcador `analytics_daily/{dia}/visitors/{vid}` que já
// existia pro KPI "visitantes logados" — desde a mudança em
// app/api/track/route.ts ele também grava o `uid` quando a visita é logada.
// Marcadores antigos (gravados antes dessa mudança) não têm `uid` e por
// isso não aparecem aqui — não há backfill retroativo.
//
// Consulta cada dia da janela como subcoleção direta (não collectionGroup)
// de propósito: um filtro de igualdade numa subcoleção normal não exige
// nenhum índice composto pra criar/fazer deploy — um collectionGroup com o
// mesmo filtro exigiria.

import { getAdminAuth, getAdminDb } from "@/lib/firebaseAdmin";
import { dayKey } from "@/lib/analytics/dates";
import type { Timestamp } from "firebase-admin/firestore";

export interface LoggedUser {
  uid: string;
  email: string | null;
  lastSeen: string; // ISO
}

const JANELA_DIAS = 7;
const LIMITE = 50;
const DIA_MS = 24 * 60 * 60 * 1000;

export async function getRecentLoggedUsers(): Promise<LoggedUser[]> {
  try {
    const db = await getAdminDb();
    const agora = Date.now();
    const dias = Array.from({ length: JANELA_DIAS }, (_, i) => dayKey(new Date(agora - i * DIA_MS)));

    const snaps = await Promise.all(
      dias.map((dia) =>
        db.collection("analytics_daily").doc(dia).collection("visitors").where("logged", "==", true).get()
      )
    );

    // Um mesmo uid pode ter acessado em dias diferentes da janela — fica
    // só o acesso mais recente.
    const ultimoAcessoPorUid = new Map<string, number>();
    for (const snap of snaps) {
      for (const doc of snap.docs) {
        const data = doc.data();
        const uid = typeof data.uid === "string" ? data.uid : null;
        if (!uid) continue;
        const firstSeen = data.firstSeen as Timestamp | undefined;
        const ms = firstSeen ? firstSeen.toMillis() : 0;
        if (ms > (ultimoAcessoPorUid.get(uid) ?? 0)) ultimoAcessoPorUid.set(uid, ms);
      }
    }

    const entradas = [...ultimoAcessoPorUid.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, LIMITE);
    if (entradas.length === 0) return [];

    const auth = await getAdminAuth();
    const { users } = await auth.getUsers(entradas.map(([uid]) => ({ uid })));
    const emailPorUid = new Map(users.map((u) => [u.uid, u.email ?? null]));

    return entradas.map(([uid, ms]) => ({
      uid,
      email: emailPorUid.get(uid) ?? null,
      lastSeen: new Date(ms).toISOString(),
    }));
  } catch (e) {
    console.error("[analytics/loggedUsers]", e);
    return [];
  }
}
