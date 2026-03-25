"use client";

import { useState, useEffect } from "react";

/**
 * Hook de tema compartilhado.
 * - Fonte de verdade: atributo `data-theme` no <html>
 * - Persiste em localStorage sob a chave "nexusfi-theme"
 * - Qualquer componente que use este hook recebe atualizações reativas
 *   via MutationObserver (mesma aba) e StorageEvent (outras abas)
 */
export function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    // Prioriza o atributo já aplicado no <html> (setado pela Navbar)
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr) return attr === "dark";
    return localStorage.getItem("nexusfi-theme") === "dark";
  });

  // Aplica no DOM + persiste (só deve ser chamado por quem controla o toggle)
  const setTheme = (nextDark: boolean) => {
    localStorage.setItem("nexusfi-theme", nextDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", nextDark ? "dark" : "light");
    // setDark será disparado pelo MutationObserver abaixo
  };

  const toggle = () => setTheme(!dark);

  useEffect(() => {
    // Observa mudanças no atributo data-theme (mesma aba, qualquer componente)
    const observer = new MutationObserver(() => {
      const next = document.documentElement.getAttribute("data-theme") === "dark";
      setDark(next);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // Observa mudanças via localStorage (outras abas)
    const onStorage = (e: StorageEvent) => {
      if (e.key === "nexusfi-theme") {
        setDark(e.newValue === "dark");
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { dark, toggle, setTheme };
}