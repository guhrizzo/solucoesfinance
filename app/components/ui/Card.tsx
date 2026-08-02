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

const variantClass: Record<CardVariant, string> = {
  default: "cf-card",
  kpi: "cf-card cf-kpi",
  interactive: "cf-card cf-kpi clickable",
};

export function Card({ variant = "default", padding = "md", className = "", children, ...rest }: CardProps) {
  return (
    <div className={`${variantClass[variant]} rounded-2xl ${paddingStyles[padding]} ${className}`} {...rest}>
      {children}
    </div>
  );
}
