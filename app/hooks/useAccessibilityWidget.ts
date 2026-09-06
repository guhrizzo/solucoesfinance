"use client";

import { useCallback, useSyncExternalStore } from "react";

// Liga/desliga o botão flutuante de acessibilidade (AccessibilityWidget.tsx).
// Mesmo padrão do resto das preferências "deste dispositivo" (tema, movimento):
// localStorage + atributo em <html>, com um evento pra sincronizar as várias
// instâncias do hook na mesma aba e `storage` pra sincronizar entre abas.
//
//   localStorage["nexusfi-a11y-widget"]  "0" = desligado (default: ligado)
//   <html data-a11y-widget="off">         espelha o "0" — o script inline de
//                                         layout.tsx aplica antes da hidratação
//                                         e globals.css esconde o widget na hora

const KEY = "nexusfi-a11y-widget";
const EVENT = "nexusfi-a11y-widget-change";

function readEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

function syncAttr(enabled: boolean) {
  if (enabled) document.documentElement.removeAttribute("data-a11y-widget");
  else document.documentElement.setAttribute("data-a11y-widget", "off");
}

function subscribe(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    syncAttr(e.newValue !== "0");
    callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, callback);
  };
}

export function useAccessibilityWidget() {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => true);

  const setEnabled = useCallback((next: boolean) => {
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* ambientes sem localStorage */
    }
    syncAttr(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { enabled, setEnabled };
}
