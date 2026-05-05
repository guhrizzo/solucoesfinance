"use client";

import { useEffect } from "react";

/**
 * ThemeInitializer - Sincroniza tema entre abas e monitora mudanças
 * O script inline no layout.tsx já carrega o tema antes de render
 * Este componente cuida de manter sincronizado
 */
export function ThemeInitializer() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initTheme = () => {
      const savedTheme = localStorage.getItem("nexusfi-theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      
      // Define tema: salvo > preferência do sistema > padrão (light)
      const theme = savedTheme || (prefersDark ? "dark" : "light");
      
      // Aplica ao HTML
      document.documentElement.setAttribute("data-theme", theme);
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.classList.toggle("light", theme === "light");
      
      // Salva no localStorage se não estava
      if (!savedTheme) {
        localStorage.setItem("nexusfi-theme", theme);
      }
      
      console.log("✅ Tema sincronizado:", theme);
    };

    // Inicializa
    initTheme();

    // ─── Monitora mudanças no data-theme (quando usuário clica no botão) ───
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "data-theme") {
          const currentTheme = document.documentElement.getAttribute("data-theme");
          console.log("🔄 data-theme mudou para:", currentTheme);
          
          if (currentTheme) {
            // Salva no localStorage
            localStorage.setItem("nexusfi-theme", currentTheme);
            
            // Sincroniza classe .dark
            document.documentElement.classList.toggle("dark", currentTheme === "dark");
            document.documentElement.classList.toggle("light", currentTheme === "light");
          }
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // ─── Sincroniza entre abas ───
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "nexusfi-theme" && e.newValue) {
        console.log("📱 Sincronização entre abas:", e.newValue);
        
        document.documentElement.setAttribute("data-theme", e.newValue);
        document.documentElement.classList.toggle("dark", e.newValue === "dark");
        document.documentElement.classList.toggle("light", e.newValue === "light");
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // ─── Cleanup ───
    return () => {
      observer.disconnect();
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return null;
}