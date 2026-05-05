"use client";

import { useEffect } from "react";

/**
 * Hook auxiliar para forçar sincronização do tema quando a página navega
 * Use este hook em páginas que precisam reagir a mudanças de tema
 */
export function useSyncTheme() {
  useEffect(() => {
    // Force sync do data-theme quando o componente monta
    const savedTheme = localStorage.getItem("nexusfi-theme");
    if (savedTheme) {
      const currentTheme = document.documentElement.getAttribute("data-theme");
      if (currentTheme !== savedTheme) {
        document.documentElement.setAttribute("data-theme", savedTheme);
      }
    }
  }, []);
}
