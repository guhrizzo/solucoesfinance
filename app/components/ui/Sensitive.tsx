"use client";

import type { ReactNode } from "react";

interface SensitiveProps {
  /** Conteúdo real (valor formatado). */
  children: ReactNode;
  /** Quando true, o valor é coberto por uma faixa sólida (estilo app de banco). */
  hidden: boolean;
  /** Classe extra no wrapper — útil pra herdar alinhamento/tamanho da célula. */
  className?: string;
}

/**
 * Esconde um valor sensível cobrindo-o com uma faixa arredondada opaca, em vez
 * de trocar o texto por "•••". O conteúdo real continua no layout (invisível),
 * então a largura não muda ao ligar/desligar; `aria-hidden` + `user-select`
 * impedem leitura por leitor de tela ou cópia.
 */
export function Sensitive({ children, hidden, className = "" }: SensitiveProps) {
  if (!hidden) return <>{children}</>;
  return (
    <span className={`relative inline-flex items-center align-middle select-none ${className}`} aria-hidden="true">
      <span className="invisible whitespace-pre">{children}</span>
      <span
        className="absolute pointer-events-none"
        style={{
          left: "-0.15em",
          right: "-0.15em",
          top: "0.1em",
          bottom: "0.1em",
          borderRadius: "0.3em",
          background: "var(--db-text-4)",
        }}
      />
    </span>
  );
}
