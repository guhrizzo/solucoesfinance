"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

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
  useEffect(() => {
    if (!open) return;

    document.body.classList.add("modal-open");
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose, closeDisabled]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex justify-center p-4 ${mobileSheet ? "items-end sm:items-center" : "items-center"}`}
      style={{ background: "var(--db-overlay)", animation: "fadeIn 0.2s ease both" }}
      onClick={() => !closeDisabled && onClose()}
    >
      <div
        className={`w-full ${sizeStyles[size]} overflow-hidden ${mobileSheet ? "rounded-t-3xl sm:rounded-2xl" : "rounded-2xl"}`}
        style={{
          background: "var(--cf-card)",
          border: "1px solid var(--cf-border)",
          boxShadow: "var(--cf-shadow-xl)",
          animation: "slideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1) both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {mobileSheet && (
          <div className="flex justify-center pt-3 pb-1 sm:hidden">
            <div className="w-10 h-1.5 rounded-full" style={{ background: "var(--cf-border)" }} />
          </div>
        )}
        {title && (
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "var(--cf-border)" }}
          >
            <h2 className="font-bold text-sm md:text-base" style={{ color: "var(--cf-text)" }}>
              {title}
            </h2>
            <button
              onClick={() => !closeDisabled && onClose()}
              disabled={closeDisabled}
              className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: "var(--cf-text-2)" }}
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
