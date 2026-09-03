"use client";

import { forwardRef } from "react";

export const inputBaseStyle: React.CSSProperties = {
  background: "var(--sunken)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  borderRadius: "var(--radius-control)",
};

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", style, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-xl px-3.5 py-2.5 text-sm outline-none ${className}`}
        style={{ ...inputBaseStyle, ...style }}
        {...rest}
      />
    );
  }
);

/** Parses a BRL-formatted string ("1.234,56") into a number. Accepts partial/plain input too. */
export function parseAmount(raw: string): number {
  const s = raw.trim().replace(/[^\d,.]/g, "");
  if (!s) return 0;
  if (s.includes(",")) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  return parseFloat(s) || 0;
}

/** Formats user input as BRL thousands-separated text while typing (does not force decimals). */
export function formatAmount(raw: string): string {
  const s = raw.replace(/[^\d,.]/g, "");
  if (!s) return "";
  if (s.includes(",")) {
    const [intPart, decPart] = s.split(",");
    const formatted = intPart.replace(/\./g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return decPart !== undefined ? formatted + "," + decPart : formatted;
  }
  return s;
}

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string;
  onValueChange: (formatted: string) => void;
}

/** Text input with a live BRL thousands-separator mask. Replaces the parseAmount/formatAmount pairs duplicated per page. */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onValueChange, className = "", style, placeholder = "0,00", ...rest },
  ref
) {
  return (
    <div className="relative">
      <span
        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium pointer-events-none"
        style={{ color: "var(--text-subtle)" }}
      >
        R$
      </span>
      <input
        ref={ref}
        inputMode="decimal"
        value={value}
        onChange={(e) => onValueChange(formatAmount(e.target.value))}
        placeholder={placeholder}
        className={`w-full rounded-xl pl-9 pr-3.5 py-2.5 text-sm outline-none mono ${className}`}
        style={{ ...inputBaseStyle, ...style }}
        {...rest}
      />
    </div>
  );
});
