import { contextBridge, ipcRenderer } from 'electron'

// Superfície mínima exposta pra página. A página "sem conexão" usa `retry`;
// as telas de login/cadastro usam `loginWithBrowser` (ver lib/desktopBridge.ts
// no site).
contextBridge.exposeInMainWorld('nexusDesktop', {
  retry: () => ipcRenderer.send('retry-load'),
  appVersion: () => ipcRenderer.invoke('app-version') as Promise<string>,
  // Login pelo navegador do sistema (Google). Resolve quando o app já recebeu o
  // código e navegou pra concluir a sessão; rejeita em erro/timeout (3 min).
  loginWithBrowser: () => ipcRenderer.invoke('login-with-browser') as Promise<void>,
})
