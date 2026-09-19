import { app, dialog, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'

const SIX_HOURS = 6 * 60 * 60 * 1000
let manualCheck = false
let wired = false

function wire(getWindow: () => BrowserWindow | null) {
  if (wired) return
  wired = true

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  // Feed = GitHub Releases (guhrizzo/solucoesfinance), lido do app-update.yml que o
  // electron-builder embute a partir do bloco `publish` do electron-builder.yml.

  autoUpdater.on('update-downloaded', async (info) => {
    const win = getWindow() ?? undefined
    const res = await dialog.showMessageBox(win as BrowserWindow, {
      type: 'info',
      title: 'Atualização disponível',
      message: `A versão ${info.version} do Nexus Fi foi baixada.`,
      detail: 'Reinicie o aplicativo para instalar. Suas informações continuam salvas.',
      buttons: ['Reiniciar agora', 'Depois'],
      defaultId: 0,
      cancelId: 1,
    })
    if (res.response === 0) autoUpdater.quitAndInstall()
  })

  autoUpdater.on('update-not-available', () => {
    if (!manualCheck) return
    manualCheck = false
    dialog.showMessageBox({
      type: 'info',
      title: 'Atualizações',
      message: 'Você já está na versão mais recente.',
    })
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater]', err)
    if (!manualCheck) return
    manualCheck = false
    dialog.showMessageBox({
      type: 'warning',
      title: 'Atualizações',
      message: 'Não foi possível verificar atualizações agora.',
      detail: 'Verifique sua conexão e tente novamente mais tarde.',
    })
  })
}

/** Chamado no boot (só quando empacotado). Verifica agora e a cada 6h. */
export function initUpdater(getWindow: () => BrowserWindow | null) {
  if (!app.isPackaged) return
  wire(getWindow)
  autoUpdater.checkForUpdates().catch(() => {})
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), SIX_HOURS)
}

/** Item de menu "Procurar atualizações…". */
export function checkForUpdatesManual(getWindow: () => BrowserWindow | null) {
  if (!app.isPackaged) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Atualizações',
      message: 'A verificação de atualizações só funciona no aplicativo instalado.',
    })
    return
  }
  wire(getWindow)
  manualCheck = true
  autoUpdater.checkForUpdates().catch(() => {})
}
