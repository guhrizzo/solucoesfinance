import * as path from 'node:path'
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Menu,
  session,
  shell,
} from 'electron'
import {
  APP_URL,
  APP_ORIGIN,
  APP_ORIGINS,
  BACKGROUND_COLOR,
  browserUserAgent,
  internalRedirectFor,
  isAuthPopupOrigin,
} from './config'
import { createWindowState } from './window-state'
import { buildMenu } from './menu'
import { initUpdater, checkForUpdatesManual } from './updater'

const isDev = !app.isPackaged
const ASSETS = path.join(__dirname, '..', 'assets')
const OFFLINE_PAGE = path.join(ASSETS, 'offline.html')

// Sem "Electron/…" no User-Agent, senão o Google recusa o login (popup do
// Firebase). Precisa rodar antes de qualquer janela.
app.userAgentFallback = browserUserAgent(app.userAgentFallback)

// Códigos de erro de rede do Chromium que indicam "sem internet" (e não um
// redirect/abort normal). Ver net_error_list.h.
const NETWORK_ERROR_CODES = new Set([
  -2, // FAILED
  -7, // TIMED_OUT
  -21, // NETWORK_CHANGED
  -101, // CONNECTION_RESET
  -102, // CONNECTION_REFUSED
  -104, // CONNECTION_FAILED
  -105, // NAME_NOT_RESOLVED
  -106, // INTERNET_DISCONNECTED
  -109, // ADDRESS_UNREACHABLE
  -118, // CONNECTION_TIMED_OUT
  -137, // NAME_RESOLUTION_FAILED
  -324, // EMPTY_RESPONSE
])

let mainWindow: BrowserWindow | null = null
const getWindow = () => mainWindow

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

// Popups de login (Firebase/Google) são as únicas janelas filhas que podem
// navegar pra fora do site; a janela principal nunca.
function isAllowedNavigation(contents: Electron.WebContents, url: string): boolean {
  if (url.startsWith('file:') || url === 'about:blank') return true
  const origin = originOf(url)
  if (origin && APP_ORIGINS.includes(origin)) return true
  return contents !== mainWindow?.webContents && isAuthPopupOrigin(url)
}

function loadApp() {
  mainWindow?.loadURL(APP_URL)
}

function createWindow() {
  const winState = createWindowState()

  mainWindow = new BrowserWindow({
    x: winState.x,
    y: winState.y,
    width: winState.width,
    height: winState.height,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: BACKGROUND_COLOR,
    title: 'Nexus Fi',
    icon: path.join(ASSETS, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  })

  winState.manage(mainWindow)

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  // Rede de segurança: se o ready-to-show não vier (falha dura), mostra assim mesmo.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) mainWindow.show()
  }, 8000)

  mainWindow.webContents.on(
    'did-fail-load',
    (_e, errorCode, _errorDesc, validatedURL, isMainFrame) => {
      if (!isMainFrame) return
      if (validatedURL.startsWith('file:')) return // já é a página offline
      if (NETWORK_ERROR_CODES.has(errorCode)) {
        mainWindow?.loadFile(OFFLINE_PAGE)
      }
    },
  )

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  loadApp()
}

// ─── Guardas de navegação / links externos ────────────────────────────────
function hardenContents(contents: Electron.WebContents) {
  contents.setWindowOpenHandler(({ url }) => {
    const origin = originOf(url)
    // Mesma origem (ex.: "abrir PDF em nova aba") e popup de login do
    // Firebase/Google → janela filha no mesmo processo/sessão, herdando o
    // webPreferences endurecido do pai. O popup precisa de `window.opener`
    // pra devolver o resultado do login.
    if ((origin && APP_ORIGINS.includes(origin)) || isAuthPopupOrigin(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          backgroundColor: BACKGROUND_COLOR,
          autoHideMenuBar: true,
        },
      }
    }
    // Externo (checkout InfinitePay, WhatsApp, marketplaces…) → navegador do sistema.
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    // Landing pública → manda pro login.
    const internal = internalRedirectFor(url)
    if (internal) {
      event.preventDefault()
      mainWindow?.loadURL(internal)
      return
    }
    if (isAllowedNavigation(contents, url)) return
    event.preventDefault()
    if (/^https?:/.test(url)) shell.openExternal(url)
  })

  contents.on('will-redirect', (event, url) => {
    const internal = internalRedirectFor(url)
    if (internal) {
      event.preventDefault()
      mainWindow?.loadURL(internal)
      return
    }
    if (isAllowedNavigation(contents, url)) return
    event.preventDefault()
  })
}

// ─── App lifecycle ────────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.on('web-contents-created', (_e, contents) => hardenContents(contents))

  app.whenReady().then(() => {
    // Downloads (PDFs, relatórios): salva em Downloads e abre.
    session.defaultSession.on('will-download', (_e, item) => {
      const savePath = path.join(app.getPath('downloads'), item.getFilename())
      item.setSavePath(savePath)
      item.once('done', (_ev, state) => {
        if (state === 'completed') shell.openPath(savePath)
      })
    })

    // Nega permissões sensíveis que o sistema não usa.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => {
      cb(permission === 'clipboard-sanitized-write')
    })

    Menu.setApplicationMenu(
      buildMenu({
        isDev,
        siteUrl: APP_ORIGIN,
        onCheckUpdates: () => checkForUpdatesManual(getWindow),
      }),
    )

    createWindow()
    initUpdater(getWindow)

    if (isDev) {
      globalShortcut.register('CommandOrControl+Shift+I', () =>
        mainWindow?.webContents.toggleDevTools(),
      )
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => app.quit())
  app.on('will-quit', () => globalShortcut.unregisterAll())

  ipcMain.on('retry-load', () => loadApp())
  ipcMain.handle('app-version', () => app.getVersion())
}
