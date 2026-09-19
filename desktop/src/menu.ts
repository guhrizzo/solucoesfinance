import {
  app,
  dialog,
  shell,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron'

interface MenuOptions {
  isDev: boolean
  siteUrl: string
  onCheckUpdates: () => void
}

function showAbout(opts: MenuOptions) {
  dialog
    .showMessageBox({
      type: 'info',
      title: 'Sobre o Nexus Fi',
      message: 'Nexus Fi',
      detail: `Versão ${app.getVersion()}\nElectron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
      buttons: ['OK', 'Procurar atualizações'],
      defaultId: 0,
      cancelId: 0,
    })
    .then((r) => {
      if (r.response === 1) opts.onCheckUpdates()
    })
}

export function buildMenu(opts: MenuOptions): Menu {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Nexus Fi',
      submenu: [
        { label: 'Sobre o Nexus Fi', click: () => showAbout(opts) },
        { label: 'Procurar atualizações…', click: opts.onCheckUpdates },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo', label: 'Desfazer' },
        { role: 'redo', label: 'Refazer' },
        { type: 'separator' },
        { role: 'cut', label: 'Recortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Colar' },
        { role: 'selectAll', label: 'Selecionar tudo' },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        { role: 'reload', label: 'Recarregar' },
        ...(opts.isDev
          ? [{ role: 'forceReload', label: 'Forçar recarregar' } as MenuItemConstructorOptions]
          : []),
        { type: 'separator' },
        { role: 'resetZoom', label: 'Zoom padrão' },
        { role: 'zoomIn', label: 'Aumentar zoom' },
        { role: 'zoomOut', label: 'Diminuir zoom' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tela cheia' },
      ],
    },
    {
      label: 'Janela',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'close', label: 'Fechar' },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        {
          label: 'Abrir site no navegador',
          click: () => shell.openExternal(opts.siteUrl),
        },
        { label: 'Procurar atualizações…', click: opts.onCheckUpdates },
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}
