"use client";

import { useEffect } from "react";

/**
 * ThemeInitializer - Restaura e sincroniza o tema no carregamento e navegação
 * Deve ser colocado no layout.tsx para funcionar globalmente
 */
export function ThemeInitializer() {
  useEffect(() => {
    // Restaura o tema no carregamento
    if (typeof window === "undefined") return;

    const initTheme = () => {
      const savedTheme = localStorage.getItem("nexusfi-theme");
      if (savedTheme) {
        document.documentElement.setAttribute("data-theme", savedTheme);
      } else {
        // Se não houver tema salvo, usa o padrão do sistema
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
        localStorage.setItem("nexusfi-theme", prefersDark ? "dark" : "light");
      }
    };

    // Inicializa no carregamento
    initTheme();

    // Monitora mudanças no data-theme e sincroniza com localStorage
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      if (currentTheme) {
        localStorage.setItem("nexusfi-theme", currentTheme);
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // Sincroniza entre abas
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "nexusfi-theme" && e.newValue) {
        document.documentElement.setAttribute("data-theme", e.newValue);
      }
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      observer.disconnect();
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return null;
}
