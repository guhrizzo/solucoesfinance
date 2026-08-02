"use client";

import { useState, useEffect, useRef } from "react";

export function useTheme() {
  // Starts false unconditionally — matches what the server always renders (it has no
  // access to localStorage/data-theme). The mount effect below re-syncs this from the
  // DOM attribute the inline script in layout.tsx already applied. Reading localStorage
  // synchronously here caused the client's first render to diverge from the server's,
  // which React detected as a hydration mismatch and reacted to by discarding and
  // re-rendering the whole subtree on the client (visible in dev server logs as
  // "Hydration failed because the server rendered HTML didn't match the client").
  const [dark, setDark] = useState<boolean>(false);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: corrects the SSR-safe `false` default to the real value once we're past hydration, not a computation that belongs in render
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