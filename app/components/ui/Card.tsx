type CardVariant = "default" | "kpi" | "interactive";
type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

const paddingStyles: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4 md:p-5",
  lg: "p-4 md:p-6",
};

/**
 * Painel de superfície: borda de 1px, sem sombra por padrão (separação por
 * borda). `variant="kpi"` / `"interactive"` mantidos por compat — para KPIs
 * novos prefira <KpiTile>.
 */
export function Card({ variant = "default", padding = "md", className = "", style, children, ...rest }: CardProps) {
  return (
    <div
      className={`${variant === "interactive" ? "cursor-pointer" : ""} ${paddingStyles[padding]} ${className}`}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-card)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
