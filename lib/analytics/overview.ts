// lib/analytics/overview.ts
// Agrega analytics_daily/analytics_monthly/analytics_page_daily pra aba
// "Analytics" de /configuracoes (só adm supremo — ver app/api/analytics/route.ts).
// Server-only (Admin SDK). Ver
// docs/superpowers/specs/2026-09-15-analytics-visitantes-plataforma-design.md.

import { getAdminDb } from "@/lib/firebaseAdmin";
import { dayKey, monthKey } from "@/lib/analytics/dates";
import type { LoggedUser } from "@/lib/analytics/loggedUsers";

export interface DiaSerie {
  date: string;
  uniqueVisitors: number;
  loggedVisitors: number;
  pageviews: number;
}

export interface PaginaTop {
  path: string;
  views: number;
}

interface Totais {
  uniqueVisitors: number;
  loggedVisitors: number;
  pageviews: number;
}

export interface AnalyticsOverview {
  hoje: Totais;
  mes: Totais & { label: string };
  serie30: DiaSerie[];
  topPaginas: PaginaTop[];
  erro: boolean;
}

/** Shape que a rota /api/analytics realmente responde: `getAnalyticsOverview` + `getRecentLoggedUsers` mesclados. */
export interface AnalyticsResponse extends AnalyticsOverview {
  usuariosLogados: LoggedUser[];
}

const ZERO: Totais = { uniqueVisitors: 0, loggedVisitors: 0, pageviews: 0 };

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function totais(data: FirebaseFirestore.DocumentData | undefined): Totais {
  if (!data) return { ...ZERO };
  return {
    uniqueVisitors: num(data.uniqueVisitors),
    loggedVisitors: num(data.loggedVisitors),
    pageviews: num(data.pageviews),
  };
}

function labelMes(mes: string): string {
  const d = new Date(`${mes}-01T12:00:00Z`);
  const s = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  const mesAtual = monthKey();
  try {
    const db = await getAdminDb();
    const [dailySnap, mensalSnap, paginasDiaSnap] = await Promise.all([
      db.collection("analytics_daily").orderBy("date", "desc").limit(30).get(),
      db.collection("analytics_monthly").doc(mesAtual).get(),
      db.collection("analytics_page_daily").orderBy("date", "desc").limit(30).get(),
    ]);

    const serie30: DiaSerie[] = dailySnap.docs
      .map((doc) => {
        const d = doc.data();
        return {
          date: typeof d.date === "string" ? d.date : doc.id,
          uniqueVisitors: num(d.uniqueVisitors),
          loggedVisitors: num(d.loggedVisitors),
          pageviews: num(d.pageviews),
        };
      })
      .reverse();

    const hojeKey = dayKey();
    const hoje = serie30.find((d) => d.date === hojeKey);
    const hojeTotais: Totais = hoje
      ? { uniqueVisitors: hoje.uniqueVisitors, loggedVisitors: hoje.loggedVisitors, pageviews: hoje.pageviews }
      : { ...ZERO };

    const mes = { ...totais(mensalSnap.data()), label: labelMes(mesAtual) };

    // Soma as visualizações por página nos últimos 30 dias.
    const somaPorPagina = new Map<string, number>();
    for (const doc of paginasDiaSnap.docs) {
      const views = doc.data().views;
      if (views && typeof views === "object") {
        for (const [path, n] of Object.entries(views as Record<string, unknown>)) {
          somaPorPagina.set(path, (somaPorPagina.get(path) ?? 0) + num(n));
        }
      }
    }

    const topPaginas: PaginaTop[] = [...somaPorPagina.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, views]) => ({ path, views }));

    return { hoje: hojeTotais, mes, serie30, topPaginas, erro: false };
  } catch (e) {
    console.error("[analytics/overview]", e);
    return {
      hoje: { ...ZERO },
      mes: { ...ZERO, label: labelMes(mesAtual) },
      serie30: [],
      topPaginas: [],
      erro: true,
    };
  }
}
