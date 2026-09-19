// Configuração fixada em build-time. Em produção o `.exe` não recebe env vars,
// então os defaults abaixo são o que vale de verdade. Em dev, o script `dev`
// exporta APP_ORIGIN apontando pro localhost.

export const APP_ORIGIN = process.env.APP_ORIGIN ?? 'https://nexusfi.com.br'

// Ponto de entrada do app desktop: sempre a tela de login (a landing `/` não
// abre dentro do app). Não há cookie de sessão neste projeto — a sessão é do
// Firebase Auth no navegador embutido (IndexedDB), então persiste entre aberturas.
export const APP_URL = process.env.APP_URL ?? `${APP_ORIGIN}/login`

// O feed de atualização (GitHub Releases) é configurado no electron-builder.yml
// e embutido no app-update.yml — não precisa de nada aqui.

// Origens tratadas como "dentro do app" — navegação livre.
export const APP_ORIGINS = [
  'https://nexusfi.com.br',
  'https://www.nexusfi.com.br',
  'http://localhost:3000',
]

// Landing pública (`/`, `/en`, `/es`) — o app desktop NÃO deve abri-la; qualquer
// navegação pra ela vira /login. O resto (login, cadastro, sistema, páginas
// legais) segue normal.
const LANDING_PATH = /^\/(en|es)?\/?$/

// Se `url` for a landing do próprio site, devolve pra onde redirecionar
// (a entrada do app). Senão, null.
export function internalRedirectFor(url: string): string | null {
  try {
    const u = new URL(url)
    if (!APP_ORIGINS.includes(u.origin)) return null
    if (LANDING_PATH.test(u.pathname)) return `${u.origin}/login`
    return null
  } catch {
    return null
  }
}

// Fundo da janela (evita flash branco no carregamento).
export const BACKGROUND_COLOR = '#0b0d14'
