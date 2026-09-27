"use client";

import { useCallback, useEffect, useState } from "react";

// Rolagem horizontal com setas: diz se ainda há conteúdo escondido à
// esquerda/direita e expõe scrollBy(-1 | 1) pra rolar um "passo".
// `ref` é um callback ref: funciona mesmo se o elemento só montar depois
// (ex.: Navbar trocando do layout vertical pro horizontal).
export function useHScroll<T extends HTMLElement = HTMLDivElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const ref = useCallback((node: T | null) => setEl(node), []);

  useEffect(() => {
    if (!el) {
      setCanLeft(false);
      setCanRight(false);
      return;
    }
    const update = () => {
      setCanLeft(el.scrollLeft > 2);
      setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    // Itens adicionados/removidos (permissões, badges, abas filtradas).
    const mo = new MutationObserver(() => {
      Array.from(el.children).forEach((c) => ro.observe(c));
      update();
    });
    mo.observe(el, { childList: true });
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      mo.disconnect();
    };
  }, [el]);

  const scrollBy = useCallback((dir: -1 | 1) => {
    if (el) el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.6), behavior: "smooth" });
  }, [el]);

  return { ref, canLeft, canRight, scrollBy };
}
