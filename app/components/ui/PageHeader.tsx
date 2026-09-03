import type { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Ex.: <Pill tone="info">setembro 2026</Pill> ao lado do título. */
  badge?: ReactNode;
  /** Botões de ação, alinhados à direita (embaixo no mobile). */
  actions?: ReactNode;
  className?: string;
}

/** Cabeçalho padrão de toda tela interna: título + contexto + ações. */
export function PageHeader({ title, subtitle, badge, actions, className = "" }: PageHeaderProps) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between ${className}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1
            className="font-display text-xl font-bold tracking-tight"
            style={{ color: "var(--text)" }}
          >
            {title}
          </h1>
          {badge}
        </div>
        {subtitle && (
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
