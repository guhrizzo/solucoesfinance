import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type DeltaTone = "pos" | "neg" | "neutral";

interface KpiTileProps {
  label: ReactNode;
  value: ReactNode;
  /** Linha de variação abaixo do valor (ex.: "▲ 12,4% vs. ago"). */
  delta?: ReactNode;
  deltaTone?: DeltaTone;
  icon?: LucideIcon;
  /** Cor do próprio valor — use "pos"/"neg" para entradas/saídas. */
  valueTone?: DeltaTone;
  onClick?: () => void;
  className?: string;
}

const toneColor: Record<DeltaTone, string> = {
  pos: "var(--pos)",
  neg: "var(--neg)",
  neutral: "var(--text-subtle)",
};

/**
 * Tile de KPI: rótulo curto, valor em mono tabular, variação opcional.
 * Borda, sem sombra — separação por borda, não por elevação.
 */
export function KpiTile({
  label,
  value,
  delta,
  deltaTone = "neutral",
  icon: Icon,
  valueTone = "neutral",
  onClick,
  className = "",
}: KpiTileProps) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-col gap-1.5 p-4 ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
      }}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {Icon && <Icon size={14} />}
        {label}
      </span>
      <span
        className="mono text-xl font-medium tracking-tight"
        style={{ color: valueTone === "neutral" ? "var(--text)" : toneColor[valueTone] }}
      >
        {value}
      </span>
      {delta != null && (
        <span className="text-xs font-semibold" style={{ color: toneColor[deltaTone] }}>
          {delta}
        </span>
      )}
    </div>
  );
}
