"use client";

import { useEffect, useId, useRef } from "react";
import { X, Loader2 } from "lucide-react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDangerous?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Modal de confirmação no estilo NexusFi — substitui o `confirm()` nativo do
 * navegador (aquele "localhost:3000 diz…"). Um único ponto de verdade pra
 * ações destrutivas: passe `isDangerous` pra pintar o botão de vermelho.
 */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  isDangerous = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // O useEffect roda depois do commit inteiro do React — dialogRef.current
    // já está populado aqui, sem precisar de requestAnimationFrame (que
    // nunca dispara com a aba/janela em segundo plano).
    const node = dialogRef.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    (first ?? node)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (!loading) onCancel();
        return;
      }
      if (e.key !== "Tab") return;
      const node = dialogRef.current;
      if (!node) return;
      const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null
      );
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onCancel, loading]);

  if (!open) return null;

  return (
    // Fechar no clique do backdrop é conveniência de mouse — Esc (tratado
    // acima) e o botão "Fechar" (aria-label) já cobrem teclado.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-999999999"
      style={{ background: "var(--db-overlay)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
      onClick={loading ? undefined : onCancel}
    >
      {/* Só impede que o clique dentro do card se propague até o backdrop
          (que fecharia o modal) — não é uma interação em si. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl border shadow-2xl animate-fade-in"
        style={{ background: "var(--db-card)", borderColor: "var(--db-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b" style={{ borderColor: "var(--db-border)" }}>
          <h3 id={titleId} className="font-bold text-base" style={{ color: isDangerous ? "var(--danger)" : "var(--db-text)" }}>
            {title}
          </h3>
          <button
            onClick={onCancel}
            disabled={loading}
            className="p-1.5 rounded-lg hover:opacity-70 transition-opacity cursor-pointer disabled:opacity-50"
            aria-label="Fechar"
          >
            <X size={16} style={{ color: "var(--db-text-2)" }} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-sm" style={{ color: "var(--db-text-2)" }}>
            {message}
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-5 border-t" style={{ borderColor: "var(--db-border)" }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl border cursor-pointer transition-opacity hover:opacity-70 disabled:opacity-50"
            style={{ borderColor: "var(--db-border)", color: "var(--db-text-2)" }}
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2.5 text-sm font-semibold rounded-xl text-white flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
            style={{ background: isDangerous ? "var(--danger)" : "var(--primary)" }}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
