"use client";

import { X, Loader2 } from "lucide-react";

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
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 z-999999999"
      style={{ background: "var(--db-overlay)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)" }}
      onClick={loading ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border shadow-2xl animate-fade-in"
        style={{ background: "var(--db-card)", borderColor: "var(--db-border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b" style={{ borderColor: "var(--db-border)" }}>
          <h3 className="font-bold text-base" style={{ color: isDangerous ? "var(--danger)" : "var(--db-text)" }}>
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
