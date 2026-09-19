// lib/analytics/downloads.ts
// Quantas vezes o instalador do app desktop foi baixado. A fonte é o
// `download_count` que o GitHub mantém em cada asset das Releases (o link
// público da landing — lib/desktopDownload.ts — aponta pra lá), então conta
// qualquer origem: botão da landing, link direto, etc.
//
// Limites do número (o GitHub não expõe mais que isso):
// - não é "pessoas únicas": quem baixa duas vezes conta duas;
// - inclui o auto-update do app, que baixa o mesmo .exe da release.
// Server-only. Rota: app/api/analytics/route.ts.

import { DESKTOP_INSTALLER_NAME, DESKTOP_REPO } from "@/lib/desktopDownload";

export interface DownloadPorVersao {
  versao: string;
  publicadoEm: string | null;
  downloads: number;
}

export interface DownloadsOverview {
  total: number;
  porVersao: DownloadPorVersao[];
  erro: boolean;
}

interface GithubAsset {
  name?: unknown;
  download_count?: unknown;
}

interface GithubRelease {
  tag_name?: unknown;
  draft?: unknown;
  published_at?: unknown;
  assets?: unknown;
}

export async function getDesktopDownloads(): Promise<DownloadsOverview> {
  try {
    // Sem token o limite é 60 req/h por IP; o cache de 5 min cobre folgado.
    // GITHUB_TOKEN (opcional) só sobe esse limite — o repo é público.
    const token = process.env.GITHUB_TOKEN;
    const res = await fetch(`https://api.github.com/repos/${DESKTOP_REPO}/releases?per_page=100`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`GitHub respondeu ${res.status}`);

    const releases = (await res.json()) as GithubRelease[];
    const porVersao: DownloadPorVersao[] = [];
    for (const r of releases) {
      if (r.draft === true || !Array.isArray(r.assets)) continue;
      const installer = (r.assets as GithubAsset[]).find((a) => a.name === DESKTOP_INSTALLER_NAME);
      if (!installer) continue;
      porVersao.push({
        versao: typeof r.tag_name === "string" ? r.tag_name : "?",
        publicadoEm: typeof r.published_at === "string" ? r.published_at : null,
        downloads:
          typeof installer.download_count === "number" && Number.isFinite(installer.download_count)
            ? installer.download_count
            : 0,
      });
    }

    return { total: porVersao.reduce((s, v) => s + v.downloads, 0), porVersao, erro: false };
  } catch (e) {
    console.error("[analytics/downloads]", e);
    return { total: 0, porVersao: [], erro: true };
  }
}
