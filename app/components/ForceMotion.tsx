"use client";

import { useEffect } from "react";
import { installForcedSmoothScroll } from "../lib/motion";

/**
 * Força rolagem suave e animações mesmo quando o SO/navegador está em
 * "desempenho melhorado" / "reduzir animações" (prefers-reduced-motion:
 * reduce). Nesse modo o navegador ignora `scroll-behavior: smooth` e trata
 * todo `behavior: "smooth"` como salto instantâneo — aqui reimpomos a
 * suavização por JS (requestAnimationFrame). O usuário pediu explicitamente
 * esse comportamento.
 *
 * As animações CSS (@keyframes / transitions) não são desligadas pelo
 * navegador nesse modo; só eram zeradas por uma regra em globals.css que
 * foi removida.
 */
export function ForceMotion() {
  useEffect(() => installForcedSmoothScroll(), []);
  return null;
}
