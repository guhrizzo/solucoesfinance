"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ModalSize = "sm" | "md" | "lg";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: ModalSize;
  children: React.ReactNode;
  /** Renders as a bottom sheet on mobile (drag handle, rounded top corners only) and centered from sm: up. */
  mobileSheet?: boolean;
  /** Ignores backdrop clicks and Escape — e.g. while a save is in flight. Callers still own their own header/close-button guards. */
  closeDisabled?: boolean;
}

const sizeStyles: Record<ModalSize, string> = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

/** Centralizes overlay/blur/escape/scroll-lock behavior duplicated across contasPagar, contasReceber and OnboardingModal. */
export function Modal({ open, onClose, title, size = "md", children, mobileSheet = false, closeDisabled = false }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Guarda quem tinha foco antes de abrir, pra devolver ao fechar.
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    document.body.classList.add("modal-open");

    // Espera o portal montar antes de focar o primeiro elemento focável
    // (ou o próprio diálogo, se não houver nenhum).
    const raf = requestAnimationFrame(() => {
      const node = dialogRef.current;
      if (!node) return;
      const first = node.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? node).focus();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!closeDisabled) onClose();
        return;
      }
      if (e.key !== "Tab") return;

      // Focus trap: Tab/Shift+Tab não escapam do diálogo enquanto aberto.
      const node = dialogRef.current;
      if (!node) return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(raf);
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, closeDisabled]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    // Fechar no clique do backdrop é conveniência de mouse — quem usa
    // teclado já fecha pelo Esc (tratado no useEffect acima) ou pelo botão
    // "Fechar" (com aria-label), então não precisa de handler próprio aqui.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className={`fixed inset-0 z-[100] flex justify-center p-4 ${mobileSheet ? "items-end sm:items-center" : "items-center"}`}
      style={{ background: "var(--overlay)", animation: "fadeIn 0.2s ease both" }}
      onClick={() => !closeDisabled && onClose()}
    >
      {/* Só impede que o clique dentro do card se propague até o backdrop
          (que fecharia o modal) — não é uma interação em si. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`w-full ${sizeStyles[size]} overflow-hidden ${mobileSheet ? "rounded-t-3xl sm:rounded-2xl" : "rounded-2xl"}`}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-pop)",
          animation: "slideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1) both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {mobileSheet && (
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1.5 rounded-full" style={{ background: "var(--border)" }} />
          </div>
        )}
        {title && (
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <h2 id={titleId} className="font-display font-bold text-sm md:text-base" style={{ color: "var(--text)" }}>
              {title}
            </h2>
            <button
              onClick={() => !closeDisabled && onClose()}
              disabled={closeDisabled}
              className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: "var(--text-muted)" }}
              aria-label="Fechar"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
