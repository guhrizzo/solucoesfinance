// lib/midas/convertClient.ts
// Avisa o servidor que o lead da demo virou conta. Fire-and-forget: nunca
// bloqueia o redirecionamento do cadastro e não tem efeito na interface.
import { LEAD_STORAGE_KEY, readLeadParam } from "./leadParam";

function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(LEAD_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Guarda o `lead` da URL no sessionStorage (backup se o param se perder). */
export function rememberLead(): string | null {
  const lead = readLeadParam(window.location.search, readStored());
  if (lead) {
    try {
      window.sessionStorage.setItem(LEAD_STORAGE_KEY, lead);
    } catch {
      /* storage indisponível: o param da URL ainda vale */
    }
  }
  return lead;
}

export function notifyLeadConverted(user: { getIdToken: () => Promise<string> }): void {
  void (async () => {
    try {
      const sessionId = readLeadParam(window.location.search, readStored());
      if (!sessionId) return;
      const token = await user.getIdToken();
      const res = await fetch("/api/midas/convert", {
        method: "POST",
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sessionId }),
        keepalive: true,
      });
      if (res.ok) {
        try {
          window.sessionStorage.removeItem(LEAD_STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* conversão é melhor-esforço */
    }
  })();
}
