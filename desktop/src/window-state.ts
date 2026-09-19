import windowStateKeeper from 'electron-window-state'

// Guarda tamanho/posição/estado-maximizado da janela em
// `<userData>/window-state.json`. Wrapper fino pra manter o `main.ts` limpo.
export function createWindowState() {
  return windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 800,
    file: 'window-state.json',
  })
}
