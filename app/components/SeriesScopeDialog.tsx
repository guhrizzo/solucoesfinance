"use client";

import { Loader2, Layers, FileText } from "lucide-react";

export type SeriesScope = "one" | "forward";

interface SeriesScopeDialogProps {
  open: boolean;
  title: string;
  message: string;
  /** Rótulo da ação (ex.: "Salvar", "Excluir"). */
  actionLabel: string;
  loading?: boolean;
  onPick: (scope: SeriesScope) => void;
  onCancel: () => void;
}

/**
 * Modal pequeno pra ações sobre uma parcela que faz parte de uma série "numeral":
 * o usuário escolhe se a ação vale só pra esta parcela ou pra esta e as próximas
 * ainda não quitadas. Estilo alinhado aos modais de Contas a Pagar/Receber
 * (variáveis --cf-*).
 */
export default function SeriesScopeDialog({
  open,
  title,
  message,
  actionLabel,
  loading = false,
  onPick,
  onCancel,
}: SeriesScopeDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-999999999 flex items-center justify-center p-4"
      style={{ background: "rgba(13,17,23,0.5)", backdropFilter: "blur(8px)" }}
      onClick={loading ? undefined : onCancel}
    >
      <div
        className="cf-card p-6 w-full max-w-sm"
        style={{ animation: "slideUp .3s cubic-bezier(.34,.1,.64,.88)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-heading text-base font-bold mb-1" style={{ color: "var(--cf-text)" }}>
          {title}
        </p>
        <p className="text-xs mb-5" style={{ color: "var(--cf-text-2)" }}>
          {message}
        </p>

        <div className="space-y-2">
          <button
            onClick={() => onPick("one")}
            disabled={loading}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-left cursor-pointer transition-all disabled:opacity-60"
            style={{ border: "1px solid var(--cf-border)", background: "var(--cf-input)" }}
          >
            <FileText size={16} style={{ color: "var(--cf-text-2)" }} />
            <span className="flex-1">
              <span className="block text-sm font-bold" style={{ color: "var(--cf-text)" }}>
                Só esta parcela
              </span>
              <span className="block text-[11px]" style={{ color: "var(--cf-text-2)" }}>
                Não altera as outras parcelas da série
              </span>
            </span>
          </button>

          <button
            onClick={() => onPick("forward")}
            disabled={loading}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-left cursor-pointer transition-all disabled:opacity-60"
            style={{ border: "1px solid var(--cf-border)", background: "var(--cf-input)" }}
          >
            <Layers size={16} style={{ color: "var(--cf-text-2)" }} />
            <span className="flex-1">
              <span className="block text-sm font-bold" style={{ color: "var(--cf-text)" }}>
                Esta e as próximas não pagas
              </span>
              <span className="block text-[11px]" style={{ color: "var(--cf-text-2)" }}>
                Parcelas já quitadas não são afetadas
              </span>
            </span>
          </button>
        </div>

        <button
          onClick={onCancel}
          disabled={loading}
          className="w-full mt-3 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1"
          style={{ border: "1px solid var(--cf-border)", color: "var(--cf-text-2)" }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          {loading ? `${actionLabel}…` : "Cancelar"}
        </button>
      </div>
    </div>
  );
}
