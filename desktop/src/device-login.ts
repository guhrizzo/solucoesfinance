import * as http from 'node:http'
import { randomBytes } from 'node:crypto'
import { app, shell, BrowserWindow } from 'electron'
import { APP_ORIGIN } from './config'

// Login com Google no app: o Google recusa OAuth em janela embutida
// ("signin/rejected"), então delegamos pro navegador do sistema. O app sobe um
// servidor loopback, abre /entrar-dispositivo no navegador, e recebe de volta um
// `code` de uso único. Com ele, a própria janela do app abre
// /entrar-dispositivo/concluir, que troca o código por um custom token do
// Firebase e faz o signInWithCustomToken (ver lib/deviceLogin.ts no site).

const TIMEOUT_MS = 3 * 60 * 1000
let emAndamento: http.Server | null = null

const PAGINA_OK = `<!doctype html><meta charset="utf-8">
<title>Nexus Fi</title>
<body style="font-family:system-ui;background:#0b0d14;color:#e7e9ee;display:grid;place-items:center;height:100vh;margin:0">
<div style="text-align:center">
<h1 style="font-size:20px">Login concluído</h1>
<p style="color:#9aa0ad">Pode fechar esta aba e voltar para o app Nexus Fi.</p>
</div>`

const PAGINA_ERRO = `<!doctype html><meta charset="utf-8">
<title>Nexus Fi</title>
<body style="font-family:system-ui;background:#0b0d14;color:#e7e9ee;display:grid;place-items:center;height:100vh;margin:0">
<p style="color:#9aa0ad">Requisição inválida. Volte ao app e tente de novo.</p>`

function encerra(server: http.Server, timer: NodeJS.Timeout) {
  clearTimeout(timer)
  server.close()
  if (emAndamento === server) emAndamento = null
}

export function loginWithBrowser(getWindow: () => BrowserWindow | null): Promise<void> {
  return new Promise((resolve, reject) => {
    emAndamento?.close()

    const state = randomBytes(16).toString('hex')
    const server = http.createServer((req, res) => {
      let url: URL
      try {
        url = new URL(req.url ?? '', 'http://127.0.0.1')
      } catch {
        res.writeHead(400).end()
        return
      }
      if (req.method !== 'GET' || url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }

      const code = url.searchParams.get('code') ?? ''
      if (url.searchParams.get('state') !== state || !/^[0-9a-f]{64}$/.test(code)) {
        res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }).end(PAGINA_ERRO)
        return // não resolve/rejeita — pode ser ruído; deixa o timeout agir
      }

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(PAGINA_OK)
      encerra(server, timer)

      const win = getWindow()
      if (win) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        win.loadURL(`${APP_ORIGIN}/entrar-dispositivo/concluir?code=${code}`)
      }
      resolve()
    })
    emAndamento = server

    const timer = setTimeout(() => {
      encerra(server, timer)
      reject(new Error('timeout'))
    }, TIMEOUT_MS)

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const porta = typeof addr === 'object' && addr ? addr.port : 0
      if (!porta) {
        encerra(server, timer)
        reject(new Error('sem porta'))
        return
      }
      const loginUrl = `${APP_ORIGIN}/entrar-dispositivo?porta=${porta}&state=${state}`
      if (!app.isPackaged) console.log('[device-login]', loginUrl)
      shell.openExternal(loginUrl)
    })
  })
}
