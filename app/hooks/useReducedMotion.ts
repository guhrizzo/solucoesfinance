"use client";

import { useState, useEffect, useRef } from "react";

// "Reduzir animações" — escolha manual do usuário (Configurações >
// Aparência), NÃO ligada a prefers-reduced-motion do sistema operacional.
// Mesmo padrão de app/hooks/useTheme.ts: atributo em <html> + localStorage,
// com um MutationObserver pra manter várias instâncias do hook em sincronia
// e um listener de `storage` pra sincronizar entre abas.

export function useReducedMotion() {
  // Começa `false` incondicionalmente — bate com o que o servidor sempre
  // renderiza (sem acesso a localStorage/data-reduced-motion). O efeito de
  // montagem abaixo resincroniza a partir do atributo que o script inline
  // do layout.tsx já aplicou, evitando divergência de hidratação.
  const [reduced, setReduced] = useState<boolean>(false);

  const observerRef = useRef<MutationObserver | null>(null);
  const internalChangeRef = useRef(false);

  const setReducedMotion = (next: boolean) => {
    internalChangeRef.current = true;
    localStorage.setItem("nexusfi-reduced-motion", next ? "1" : "0");
    if (next) {
      document.documentElement.setAttribute("data-reduced-motion", "1");
    } else {
      document.documentElement.removeAttribute("data-reduced-motion");
    }
    setReduced(next);
  };

  const toggle = () => setReducedMotion(!reduced);

  useEffect(() => {
    const current = document.documentElement.hasAttribute("data-reduced-motion");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: corrige o default SSR-safe pro valor real, uma vez, após a hidratação
    if (current) setReduced(true);

    observerRef.current = new MutationObserver(() => {
      if (internalChangeRef.current) {
        internalChangeRef.current = false;
        return;
      }
      setReduced(document.documentElement.hasAttribute("data-reduced-motion"));
    });

    observerRef.current.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-reduced-motion"],
    });

    const onStorage = (e: StorageEvent) => {
      if (e.key === "nexusfi-reduced-motion") {
        const next = e.newValue === "1";
        if (next) document.documentElement.setAttribute("data-reduced-motion", "1");
        else document.documentElement.removeAttribute("data-reduced-motion");
        // O observer acima pega essa mudança e atualiza o estado.
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      observerRef.current?.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { reduced, toggle, setReducedMotion };
}
