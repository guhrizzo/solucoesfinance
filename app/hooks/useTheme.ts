"use client";

import { useState, useEffect, useRef } from "react";

export function useTheme() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr) return attr === "dark";
    const saved = localStorage.getItem("nexusfi-theme");
    if (saved) return saved === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  const observerRef = useRef<MutationObserver | null>(null);
  const internalChangeRef = useRef(false); // 👈 flag para mudanças internas

  const setTheme = (nextDark: boolean) => {
    internalChangeRef.current = true; // marca que a mudança veio daqui
    localStorage.setItem("nexusfi-theme", nextDark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", nextDark ? "dark" : "light");
    setDark(nextDark);
  };

  const toggle = () => setTheme(!dark);

  useEffect(() => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    if (currentTheme) setDark(currentTheme === "dark");

    observerRef.current = new MutationObserver(() => {
      if (internalChangeRef.current) {
        internalChangeRef.current = false; // consome a flag e ignora
        return;
      }
      // Só chega aqui se a mudança veio de fora (outra instância, script externo)
      const next = document.documentElement.getAttribute("data-theme") === "dark";
      setDark(next);
    });

    observerRef.current.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    const onStorage = (e: StorageEvent) => {
      if (e.key === "nexusfi-theme" && e.newValue) {
        document.documentElement.setAttribute("data-theme", e.newValue);
        // O observer vai pegar essa mudança e atualizar o estado
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      observerRef.current?.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { dark, toggle, setTheme };
}