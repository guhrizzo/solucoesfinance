"use client";

import { useId, cloneElement, isValidElement, type ReactNode, type ReactElement } from "react";

interface FieldProps {
  label?: ReactNode;
  /** Texto de ajuda abaixo do campo. Suprimido quando há `error`. */
  hint?: ReactNode;
  error?: ReactNode;
  /** O controle do formulário (input/select/textarea ou um dos ui/). */
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper padrão de campo de formulário: label + controle + hint/erro.
 * Liga o `<label>` ao controle via `id` gerado, e propaga
 * `aria-invalid` / `aria-describedby` quando o filho aceita props.
 */
export function Field({ label, hint, error, children, className = "" }: FieldProps) {
  const id = useId();
  const describedById = error ? `${id}-err` : hint ? `${id}-hint` : undefined;

  const control =
    isValidElement(children)
      ? cloneElement(children as ReactElement<Record<string, unknown>>, {
          id: (children.props as Record<string, unknown>).id ?? id,
          "aria-invalid": error ? true : undefined,
          "aria-describedby": describedById,
        })
      : children;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={id} className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
          {label}
        </label>
      )}
      {control}
      {error ? (
        <span id={`${id}-err`} className="text-xs font-medium" style={{ color: "var(--neg)" }}>
          {error}
        </span>
      ) : hint ? (
        <span id={`${id}-hint`} className="text-xs" style={{ color: "var(--text-subtle)" }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
