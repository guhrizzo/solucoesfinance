"use client";

import { useEffect } from "react";
import { installForcedSmoothScroll } from "../lib/motion";

/**
 * Força rolagem suave e animações mesmo quando o SO/navegador está em
 * "desempenho melhorado" / "reduzir animações" (prefers-reduced-motion:
 * reduce) — comportamento pedido explicitamente pelo usuário. Nesse modo o
 * navegador ignora `scroll-behavior: smooth` e trata todo `behavior:
 * "smooth"` como salto instantâneo — aqui reimpomos a suavização por JS
 * (requestAnimationFrame).
 *
 * Exceção: "Reduzir animações" em Configurações > Aparência
 * (app/hooks/useReducedMotion.ts) é uma escolha manual do usuário DENTRO do
 * app — nesse caso não instalamos a rolagem forçada (a pessoa pediu menos
 * movimento, então a rolagem cai pra instantânea, `scroll-behavior: auto`
 * nativo). Reage à mudança do atributo em tempo real, sem precisar recarregar
 * a página ao ligar/desligar em Configurações.
 *
 * As animações CSS (@keyframes / transitions) não são desligadas pelo
 * navegador em prefers-reduced-motion; a regra que as zerava quando
 * data-reduced-motion="1" está em globals.css.
 */
export function ForceMotion() {
  useEffect(() => {
    let uninstall: (() => void) | undefined;

    const sync = () => {
      const reduced = document.documentElement.hasAttribute("data-reduced-motion");
      if (reduced) {
        uninstall?.();
        uninstall = undefined;
      } else if (!uninstall) {
        uninstall = installForcedSmoothScroll();
      }
    };

    sync();

    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-reduced-motion"],
    });

    return () => {
      observer.disconnect();
      uninstall?.();
    };
  }, []);

  return null;
}
