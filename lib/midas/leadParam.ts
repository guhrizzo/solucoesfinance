// lib/midas/leadParam.ts
// Lê o id da sessão da demo (`?lead=`) com fallback no sessionStorage.
import { isValidSessionId } from "./leadServer";

export const LEAD_STORAGE_KEY = "midas-lead";

/** `lead` da query se for UUID v4 válido; senão o valor guardado, se válido; senão null. */
export function readLeadParam(search: string, stored: string | null): string | null {
  let fromQuery: string | null = null;
  try {
    fromQuery = new URLSearchParams(search).get("lead");
  } catch {
    fromQuery = null;
  }
  if (isValidSessionId(fromQuery)) return fromQuery;
  return isValidSessionId(stored) ? stored : null;
}
