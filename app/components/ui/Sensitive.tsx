"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface SensitiveProps {
  /** Conteúdo real (valor formatado, ex.: "R$ 1.234,56"). */
  children: ReactNode;
  /** Quando true, os dígitos viram "••••" (estilo InfinitePay). */
  hidden: boolean;
  /** Classe extra no wrapper — útil pra herdar alinhamento/tamanho da célula. */
  className?: string;
  /** Renderiza um <tspan> em vez de <span>, pra usar dentro de <text> no SVG. */
  svg?: boolean;
}

const MASK = "••••";
const GLITCH = "<>_*{}[]^=~#%+•";
const DURATION = 320; // ms — o embaralhamento inteiro
const TICK = 40; // ms entre trocas de caractere

/** "R$ 1.234,56" → "R$ ••••"; "-R$ 10,00" → "-R$ ••••". Mantém o prefixo (moeda/sinal). */
function maskOf(text: string): string {
  const i = text.search(/\d/);
  return (i < 0 ? text : text.slice(0, i)) + MASK;
}

/**
 * Esconde um valor sensível trocando os dígitos por "••••", com a animação de
 * "embaralhar" da InfinitePay: ao alternar, cada caractere passa por símbolos
 * aleatórios e vai se resolvendo da esquerda pra direita até o texto final
 * (máscara ao esconder, valor real ao mostrar). O prefixo "R$" fica parado.
 * Só anima quando `hidden` muda — no 1º render já nasce no estado certo.
 *
 * Feito à mão de propósito: a lib use-scramble desliga o efeito sob
 * prefers-reduced-motion (o projeto força movimento, ver lib/motion.ts) e
 * perde o passo quando o valor é alternado várias vezes seguidas.
 */
export function Sensitive({ children, hidden, className = "", svg = false }: SensitiveProps) {
  const text = typeof children === "string" || typeof children === "number" ? String(children) : null;
  const masked = text !== null ? maskOf(text) : MASK;
  const [frame, setFrame] = useState<string | null>(null);
  const prevHidden = useRef(hidden);

  useLayoutEffect(() => {
    if (prevHidden.current === hidden || text === null) {
      prevHidden.current = hidden;
      return;
    }
    prevHidden.current = hidden;
    const to = hidden ? masked : text;
    const fixed = Math.min(Math.max(0, text.search(/\d/)), to.length); // prefixo que não embaralha
    const start = performance.now();
    const draw = () => {
      const p = (performance.now() - start) / DURATION;
      if (p >= 1) {
        window.clearInterval(id);
        setFrame(null);
        return;
      }
      let s = to.slice(0, fixed);
      for (let i = fixed; i < to.length; i++) {
        const resolved = (i - fixed) / Math.max(1, to.length - fixed) < p * p; // acelera no fim
        s += resolved ? to[i] : GLITCH[Math.floor(Math.random() * GLITCH.length)];
      }
      setFrame(s);
    };
    const id = window.setInterval(draw, TICK);
    draw(); // 1º quadro já embaralhado — sem piscar o valor final antes
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage à troca de hidden
  }, [hidden]);

  const Tag = svg ? "tspan" : "span";
  if (frame !== null) return <Tag className={`select-none ${className}`} aria-hidden="true">{frame}</Tag>;
  if (!hidden) return <>{children}</>;
  return <Tag className={`select-none ${className}`} aria-hidden="true">{masked}</Tag>;
}
