"use client";

import { forwardRef } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

type ButtonVariant = "primary" | "success" | "danger" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5 gap-1.5 rounded-lg",
  md: "text-sm px-4 py-2.5 gap-2 rounded-xl",
  lg: "text-base px-6 py-3.5 gap-2 rounded-xl",
};

const iconSize: Record<ButtonSize, number> = { sm: 13, md: 15, lg: 17 };

const variantStyle = (variant: ButtonVariant): React.CSSProperties => {
  switch (variant) {
    case "primary":
      return {
        background: "linear-gradient(135deg, var(--brand-500), var(--brand-600))",
        color: "#fff",
        border: "none",
        boxShadow: "0 4px 12px rgba(21, 101, 192, 0.3)",
      };
    case "success":
      return {
        background: "linear-gradient(135deg, var(--success), var(--success-dark))",
        color: "#fff",
        border: "none",
        boxShadow: "0 4px 12px rgba(16, 185, 129, 0.3)",
      };
    case "danger":
      return {
        background: "linear-gradient(135deg, var(--danger), var(--danger-dark))",
        color: "#fff",
        border: "none",
        boxShadow: "0 4px 12px rgba(239, 68, 68, 0.3)",
      };
    case "secondary":
      return {
        background: "var(--cf-card)",
        border: "1px solid var(--cf-border)",
        color: "var(--cf-text-2)",
      };
    case "ghost":
      return {
        background: "transparent",
        border: "1px solid transparent",
        color: "var(--cf-text-2)",
      };
  }
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon: Icon, loading = false, disabled, className = "", children, style, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold cursor-pointer transition-all duration-200 ease-in-out disabled:opacity-60 disabled:cursor-not-allowed ${sizeStyles[size]} ${className}`}
      style={{ ...variantStyle(variant), ...style }}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSize[size]} className="animate-spin" />
      ) : (
        Icon && <Icon size={iconSize[size]} />
      )}
      {children}
    </button>
  );
});
