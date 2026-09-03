import { Pill, type PillTone } from "./Pill";

export type BadgeStatus = "success" | "warning" | "danger" | "info" | "entrada" | "saida";

interface BadgeProps {
  status: BadgeStatus;
  children: React.ReactNode;
  className?: string;
}

const toTone: Record<BadgeStatus, PillTone> = {
  success: "pos",
  entrada: "pos",
  warning: "warn",
  danger: "neg",
  saida: "neg",
  info: "info",
};

/**
 * @deprecated Use <Pill tone="…"> diretamente. Mantido enquanto as páginas
 * legadas ainda importam `Badge` / `BadgeStatus`.
 */
export function Badge({ status, children, className = "" }: BadgeProps) {
  return (
    <Pill tone={toTone[status]} className={className}>
      {children}
    </Pill>
  );
}
