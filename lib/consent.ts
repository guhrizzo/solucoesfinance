// lib/consent.ts
// Estado de consentimento de cookies / tratamento de dados (LGPD — Lei 13.709/2018).
//
// Guardamos a escolha do usuário em localStorage. O banner (CookieConsent.tsx)
// só volta a aparecer se não houver registro OU se a versão do texto mudar
// (CONSENT_VERSION) — nesse caso pedimos o consentimento de novo.

export const CONSENT_KEY = "nexusfi-cookie-consent";

// Suba esta versão sempre que as finalidades / categorias abaixo mudarem de
// forma relevante. Isso força um novo pedido de consentimento.
export const CONSENT_VERSION = 1;

export type ConsentCategory = "essential" | "preferences" | "analytics";

export interface ConsentState {
  version: number;
  /** ISO string do momento em que o usuário decidiu */
  timestamp: string;
  categories: Record<ConsentCategory, boolean>;
}

export const CATEGORY_INFO: Record<
  ConsentCategory,
  { label: string; required: boolean; description: string }
> = {
  essential: {
    label: "Essenciais",
    required: true,
    description:
      "Necessários para você entrar na conta, manter a sessão ativa e usar o " +
      "sistema com segurança (autenticação, proteção contra fraude). Sem eles " +
      "a plataforma não funciona. Base legal: execução de contrato e legítimo " +
      "interesse (art. 7º, V e IX da LGPD).",
  },
  preferences: {
    label: "Preferências",
    required: false,
    description:
      "Lembram escolhas suas, como tema claro/escuro, layout do menu e o " +
      "período exibido nos painéis. Base legal: consentimento (art. 7º, I).",
  },
  analytics: {
    label: "Análise de uso",
    required: false,
    description:
      "Nos ajudam a entender de forma agregada quais telas são mais usadas e " +
      "onde há erros, para melhorar o produto. Base legal: consentimento " +
      "(art. 7º, I).",
  },
};

const DENIED: ConsentState["categories"] = {
  essential: true,
  preferences: false,
  analytics: false,
};

const GRANTED: ConsentState["categories"] = {
  essential: true,
  preferences: true,
  analytics: true,
};

// ── Store para useSyncExternalStore (leitura client-only sem mismatch) ──────
let cachedRaw: string | null = null;
let cachedState: ConsentState | null = null;

/** Snapshot estável: só recalcula quando o valor cru do localStorage muda. */
export function getConsentSnapshot(): ConsentState | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(CONSENT_KEY);
  } catch {
    raw = null;
  }
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = readConsent();
  }
  return cachedState;
}

export function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener("nexusfi-consent-change", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("nexusfi-consent-change", onChange);
  };
}

export function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    if (!parsed || parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeConsent(
  categories: Partial<Record<ConsentCategory, boolean>>,
): ConsentState {
  const state: ConsentState = {
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
    categories: { ...DENIED, ...categories, essential: true },
  };
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("nexusfi-consent-change", { detail: state }));
  } catch {
    /* localStorage indisponível (aba anônima, etc.) — segue sem persistir */
  }
  return state;
}

export const acceptAll = () => writeConsent(GRANTED);
export const rejectOptional = () => writeConsent(DENIED);

/** `true` se o usuário permitiu aquela categoria (essential é sempre `true`). */
export function hasConsent(category: ConsentCategory): boolean {
  if (category === "essential") return true;
  return readConsent()?.categories[category] ?? false;
}
