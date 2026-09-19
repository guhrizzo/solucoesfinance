// Publica uma release no GitHub (repo guhrizzo/solucoesfinance) com os artefatos
// do electron-builder. Feito à mão via API porque o `--publish` nativo do
// electron-builder cria DUAS releases draft quando ainda não existe uma
// (draft não tem tag → ele não consegue deduplicar).
//
// Fluxo: build → cria/reusa 1 draft pra v<versão> → sobe latest.yml + .exe +
// .blockmap (substituindo se já existir) → imprime a URL. Você publica o draft
// no GitHub e os apps passam a ver a atualização.
//
// Requer GH_TOKEN em desktop/electron-builder.env (escopo public_repo).

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(dir, '..')
const buildDir = path.join(root, 'build')

const REPO = 'guhrizzo/solucoesfinance'
const API = `https://api.github.com/repos/${REPO}`

// ── token ────────────────────────────────────────────────────────────────
function loadToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim()
  try {
    const raw = fs.readFileSync(path.join(root, 'electron-builder.env'), 'utf8')
    const m = raw.match(/^\s*GH_TOKEN\s*=\s*(.+)\s*$/m)
    if (m) return m[1].trim()
  } catch {}
  console.error('Faltando GH_TOKEN. Preencha desktop/electron-builder.env (ver desktop/README.md).')
  process.exit(1)
}
const TOKEN = loadToken()
const H = {
  Authorization: `Bearer ${TOKEN}`,
  'User-Agent': 'nexus-fi-release',
  Accept: 'application/vnd.github+json',
}

const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
const tag = `v${version}`

// ── 1. build ─────────────────────────────────────────────────────────────
console.log(`\n▶ build ${tag}`)
execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })

const INSTALLER = 'Nexus-Fi-Setup.exe' // nome fixo — ver lib/desktopDownload.ts no site
const assets = ['latest.yml', INSTALLER, `${INSTALLER}.blockmap`]
for (const a of assets) {
  if (!fs.existsSync(path.join(buildDir, a))) {
    console.error(`Artefato não encontrado: build/${a}`)
    process.exit(1)
  }
}

// ── 1b. assinatura + hash ────────────────────────────────────────────────
// Sem assinatura Authenticode o SmartScreen avisa "Windows protegeu o computador".
// Não bloqueia a release (dá pra publicar sem), mas deixa o estado à vista.
let signature = 'NotChecked'
if (process.platform === 'win32') {
  try {
    signature = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `(Get-AuthenticodeSignature '${path.join(buildDir, INSTALLER)}').Status`],
      { encoding: 'utf8' },
    ).trim()
  } catch {}
}
if (signature !== 'Valid') {
  console.warn(`
⚠ Instalador SEM assinatura válida (status: ${signature}) — o SmartScreen vai avisar.`)
  console.warn('  Configure CSC_LINK + CSC_KEY_PASSWORD (ver desktop/README.md › Assinatura de código).')
}
const sha256 = createHash('sha256').update(fs.readFileSync(path.join(buildDir, INSTALLER))).digest('hex')
console.log(`▶ SHA-256 ${sha256}`)

// ── 2. cria ou reusa o draft ─────────────────────────────────────────────
async function gh(url, init) {
  const res = await fetch(url.startsWith('http') ? url : API + url, { ...init, headers: { ...H, ...(init?.headers || {}) } })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

const releases = await gh('/releases?per_page=100')
let release = releases.find((r) => r.tag_name === tag)

if (release && !release.draft) {
  console.error(`\nA release ${tag} já existe e está publicada. Suba a versão em package.json.`)
  process.exit(1)
}

if (release) {
  console.log(`▶ reusando draft existente (${release.id})`)
} else {
  console.log(`▶ criando draft ${tag}`)
  release = await gh('/releases', {
    method: 'POST',
    body: JSON.stringify({
      tag_name: tag,
      name: `Nexus Fi ${version}`,
      draft: true,
      body: `Instalador para Windows (64 bits): \`${INSTALLER}\`

SHA-256: \`${sha256}\``,
    }),
  })
}

// ── 3. sobe os assets (substitui os de mesmo nome) ───────────────────────
const uploadBase = release.upload_url.replace(/\{.*\}/, '')
for (const name of assets) {
  const existing = release.assets.find((a) => a.name === name)
  if (existing) {
    await gh(`/releases/assets/${existing.id}`, { method: 'DELETE' })
  }
  const body = fs.readFileSync(path.join(buildDir, name))
  process.stdout.write(`▶ upload ${name} (${(body.length / 1e6).toFixed(1)} MB) … `)
  await gh(`${uploadBase}?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(body.length) },
    body,
  })
  console.log('ok')
}

console.log(`\n✔ draft pronto: ${release.html_url}`)
console.log('  Publique a release no GitHub ("Publish release") pra os apps enxergarem.')
