import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Ação primária opcional (ex.: <Button>Novo lançamento</Button>). */
  action?: ReactNode;
  className?: string;
}

/** Estado vazio padrão — lista sem itens, busca sem resultado, etc. */
export function EmptyState({ icon: Icon, title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-xl px-6 py-12 text-center ${className}`}
      style={{ border: "1px dashed var(--border-strong)" }}
    >
      {Icon && (
        <span
          className="mb-1 grid h-10 w-10 place-items-center rounded-full"
          style={{ background: "var(--sunken)", color: "var(--text-subtle)" }}
        >
          <Icon size={18} />
        </span>
      )}
      <p className="font-display text-sm font-semibold" style={{ color: "var(--text)" }}>
        {title}
      </p>
      {description && (
        <p className="max-w-sm text-[13px]" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
