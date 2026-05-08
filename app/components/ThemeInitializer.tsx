"use client";

import { useEffect } from "react";

export function ThemeInitializer() {
  useEffect(() => {
    // Sincroniza as classes .dark/.light com o data-theme já aplicado
    const applyClasses = (theme: string) => {
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.classList.toggle("light", theme === "light");
    };

    // Aplica nas classes o que o script inline já setou no atributo
    const initial = document.documentElement.getAttribute("data-theme");
    if (initial) applyClasses(initial);

    // Sincroniza entre abas via localStorage
    const onStorage = (e: StorageEvent) => {
      if (e.key === "nexusfi-theme" && e.newValue) {
        document.documentElement.setAttribute("data-theme", e.newValue);
        applyClasses(e.newValue);
      }
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return null;
}