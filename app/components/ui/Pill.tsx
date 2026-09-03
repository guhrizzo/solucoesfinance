import type { ReactNode } from "react";

export type PillTone = "pos" | "neg" | "warn" | "info" | "muted";

interface PillProps {
  tone?: PillTone;
  /** Mostra o ponto colorido antes do texto (status). */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

const toneVars: Record<PillTone, { bg: string; fg: string }> = {
  pos: { bg: "--pos-weak", fg: "--pos" },
  neg: { bg: "--neg-weak", fg: "--neg" },
  warn: { bg: "--warn-weak", fg: "--warn" },
  info: { bg: "--brand-weak", fg: "--brand" },
  muted: { bg: "--sunken", fg: "--text-muted" },
};

/**
 * Pill de status — resolve a cor a partir do token semântico, nunca de hex.
 * Substitui STATUS_META / colorMap / .badge-* espalhados pelas páginas.
 */
export function Pill({ tone = "muted", dot = false, children, className = "" }: PillProps) {
  const v = toneVars[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${className}`}
      style={{ background: `var(${v.bg})`, color: `var(${v.fg})` }}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: "currentColor" }}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
