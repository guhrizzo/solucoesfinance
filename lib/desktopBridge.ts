// lib/desktopBridge.ts
// Ponte com o app desktop (Electron, pasta desktop/). O preload expõe
// `window.nexusDesktop`; no navegador comum ele não existe.
//
// Por que existe: o Google recusa OAuth dentro da janela embutida do Electron,
// então lá o botão "Google" delega o login pro navegador do sistema
// (/entrar-dispositivo) em vez de abrir o popup do Firebase.

interface NexusDesktop {
  /** Abre o navegador do sistema e resolve quando o app já recebeu o código de login. */
  loginWithBrowser?: () => Promise<void>;
}

declare global {
  interface Window {
    nexusDesktop?: NexusDesktop;
  }
}

/** true se estamos dentro do app desktop e ele sabe logar pelo navegador. */
export function canLoginWithSystemBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.nexusDesktop?.loginWithBrowser === "function";
}

/** Dispara o login pelo navegador do sistema. Só chame se canLoginWithSystemBrowser(). */
export async function loginWithSystemBrowser(): Promise<void> {
  await window.nexusDesktop!.loginWithBrowser!();
}
