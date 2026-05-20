"use client";

import { useEffect } from "react";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import type { Toast } from "./useToast";

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: number) => void;
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  const typeConfig = {
    success: {
      bg: "linear-gradient(135deg, #10b981, #059669)",
      icon: CheckCircle,
      border: "border-green-600",
    },
    error: {
      bg: "linear-gradient(135deg, #ef4444, #dc2626)",
      icon: AlertCircle,
      border: "border-red-600",
    },
    warning: {
      bg: "linear-gradient(135deg, #f59e0b, #d97706)",
      icon: AlertTriangle,
      border: "border-amber-600",
    },
    info: {
      bg: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
      icon: Info,
      border: "border-blue-600",
    },
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const config = typeConfig[toast.type];
        const Icon = config.icon;

        return (
          <div
            key={toast.id}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-white pointer-events-auto shadow-lg animate-in slide-in-from-top-4 duration-300"
            style={{ background: config.bg }}
          >
            <Icon size={18} className="flex-shrink-0" />
            <span className="flex-1">{toast.message}</span>
            <button
              onClick={() => onRemove(toast.id)}
              className="p-0.5 hover:opacity-70 transition-opacity"
              aria-label="Fechar notificação"
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}