// lib/desktopDownload.ts
// Onde o app desktop (pasta desktop/) é baixado. O instalador é publicado como
// asset das Releases do GitHub (repo público) com nome FIXO — sem versão — pra
// `releases/latest/download/…` sempre apontar pra versão mais nova. O nome vem de
// `artifactName` em desktop/electron-builder.yml; se mudar lá, mude aqui.

const REPO = "guhrizzo/solucoesfinance";

export const DESKTOP_INSTALLER_NAME = "Nexus-Fi-Setup.exe";

export const DESKTOP_DOWNLOAD_URL = `https://github.com/${REPO}/releases/latest/download/${DESKTOP_INSTALLER_NAME}`;

/** Página da versão mais recente (notas + SHA-256 do instalador). */
export const DESKTOP_RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
