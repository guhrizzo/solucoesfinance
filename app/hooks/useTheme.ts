"use client";

import { useState, useEffect, useRef } from "react";

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
    // Prioriza o atributo já aplicado no <html> (setado pelo ThemeInitializer)
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr) return attr === "dark";
    // Fallback para localStorage
    const saved = localStorage.getItem("nexusfi-theme");
    if (saved) return saved === "dark";
    // Fallback para preferência do sistema
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const observerRef = useRef<MutationObserver | null>(null);

  // Aplica no DOM + persiste (só deve ser chamado por quem controla o toggle)
  const setTheme = (nextDark: boolean) => {
    localStorage.setItem("nexusfi-theme", nextDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", nextDark ? "dark" : "light");
    setDark(nextDark);
  };

  const toggle = () => setTheme(!dark);

  useEffect(() => {
    // Sincroniza o estado inicial com o data-theme atual
    const currentTheme = document.documentElement.getAttribute("data-theme");
    if (currentTheme) {
      setDark(currentTheme === "dark");
    }

    // Desconecta observer antigo se existir
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Cria novo observer para mudanças no atributo data-theme
    observerRef.current = new MutationObserver(() => {
      const next = document.documentElement.getAttribute("data-theme") === "dark";
      setDark(next);
    });

    observerRef.current.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // Observa mudanças via localStorage (outras abas)
    const onStorage = (e: StorageEvent) => {
      if (e.key === "nexusfi-theme" && e.newValue) {
        const isDark = e.newValue === "dark";
        setDark(isDark);
        document.documentElement.setAttribute("data-theme", e.newValue);
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { dark, toggle, setTheme };
}
