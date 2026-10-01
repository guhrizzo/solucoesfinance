"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Copia `value` pra área de transferência (com fallback pra navegador antigo / webview de app de e-mail). */
export function CopyButton({ value, label, copiedLabel, primary = false }: {
  value: string; label: string; copiedLabel: string; primary?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-live="polite"
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-transform active:scale-[0.98] cursor-pointer"
      style={primary
        ? { background: "var(--pix)", color: "var(--pix-on)" }
        : { background: "var(--sunken)", color: "var(--text)", border: "1px solid var(--border)" }}
    >
      {copied ? <Check size={18} /> : <Copy size={18} />}
      {copied ? copiedLabel : label}
    </button>
  );
}
