"use client";

// Reabre o banner de consentimento (CookieConsent.tsx) já na aba de detalhes.

import { Cookie } from "lucide-react";

export function CookiePreferencesButton() {
  return (
    <button
      type="button"
      onClick={() =>
        window.dispatchEvent(new Event("nexusfi-open-cookie-preferences"))
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold text-[var(--text)] transition-colors hover:bg-[var(--sunken)]"
    >
      <Cookie size={14} />
      Preferências de cookies
    </button>
  );
}
