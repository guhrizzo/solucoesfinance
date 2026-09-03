"use client";

import { forwardRef } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  loading?: boolean;
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-1.5 gap-1.5 rounded-lg",
  md: "text-sm px-4 py-2 gap-2 rounded-lg",
  lg: "text-base px-5 py-2.5 gap-2 rounded-lg",
};

const iconSize: Record<ButtonSize, number> = { sm: 13, md: 15, lg: 17 };

// Cor sólida via token — sem gradiente, sem sombra colorida (redesign 2026-09).
const variantClass: Record<ButtonVariant, string> = {
  primary: "text-[var(--brand-on)] bg-[var(--brand)] hover:bg-[var(--brand-hover)] border border-transparent",
  success: "text-white bg-[var(--pos)] hover:brightness-95 border border-transparent",
  secondary:
    "text-[var(--text)] bg-[var(--surface)] border border-[var(--border-strong)] hover:border-[var(--text-subtle)] hover:bg-[var(--sunken)]",
  ghost: "text-[var(--text-muted)] bg-transparent border border-transparent hover:bg-[var(--sunken)] hover:text-[var(--text)]",
  danger:
    "text-[var(--neg)] bg-transparent border border-[color-mix(in_srgb,var(--neg)_40%,var(--border))] hover:bg-[var(--neg-weak)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", icon: Icon, loading = false, disabled, className = "", children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold cursor-pointer transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${sizeStyles[size]} ${variantClass[variant]} ${className}`}
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
