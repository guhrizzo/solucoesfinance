export type BadgeStatus = "success" | "warning" | "danger" | "info" | "entrada" | "saida";

interface BadgeProps {
  status: BadgeStatus;
  children: React.ReactNode;
  className?: string;
}

const statusVars: Record<BadgeStatus, { bg: string; text: string; border: string }> = {
  success: { bg: "--status-success-bg", text: "--status-success-text", border: "--status-success-border" },
  warning: { bg: "--status-warning-bg", text: "--status-warning-text", border: "--status-warning-border" },
  danger: { bg: "--status-danger-bg", text: "--status-danger-text", border: "--status-danger-border" },
  info: { bg: "--status-info-bg", text: "--status-info-text", border: "--status-info-border" },
  entrada: { bg: "--entrada-bg", text: "--entrada-text", border: "--entrada-border" },
  saida: { bg: "--saida-bg", text: "--saida-text", border: "--saida-border" },
};

/** Status pill that resolves its color from the semantic token set — never a hardcoded hex. */
export function Badge({ status, children, className = "" }: BadgeProps) {
  const v = statusVars[status];
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${className}`}
      style={{
        background: `var(${v.bg})`,
        color: `var(${v.text})`,
        borderColor: `var(${v.border})`,
      }}
    >
      {children}
    </span>
  );
}
