import { contextBridge, ipcRenderer } from 'electron'

// Superfície mínima exposta pra página. A página "sem conexão" usa `retry`.
contextBridge.exposeInMainWorld('nexusDesktop', {
  retry: () => ipcRenderer.send('retry-load'),
  appVersion: () => ipcRenderer.invoke('app-version') as Promise<string>,
})
