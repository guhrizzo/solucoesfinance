// app/components/midas/useMidasSession.ts
// Persistência local (localStorage) e sincronização do lead da demo do Midas.
// Só roda no cliente (MidasDemo monta o conteúdo depois da hidratação).
import { deserialize, initialState, serialize, type MidasState } from "@/lib/midas/flow";
import { MIDAS_MODULES, modulesForPain } from "@/lib/midas/modules";
import type { Pain } from "@/lib/midas/types";

export const STORAGE_KEY = "midas-demo-v1";
export const CONSENT_VERSION = "2026-11";
export const WHATSAPP_NUMBER = "5511926198042";

const MAX_ITEMS = 200;

export type ChatKind = "text" | "modules" | "cta" | "error";

export interface ChatItem {
  id: string;
  role: "bot" | "user";
  kind: ChatKind;
  text?: string;
  modules?: string[];
  /** Mostra o botão de WhatsApp humano logo abaixo da mensagem. */
  whatsapp?: boolean;
  ts: number;
  /** Tamanho do histórico do fluxo quando a mensagem nasceu (usado no "voltar"). */
  turn: number;
  /** Mensagem auxiliar (retry, visão geral, resposta da IA) — some ao voltar para a etapa. */
  aux?: boolean;
}

export interface MidasSession {
  sessionId: string;
  state: MidasState;
  items: ChatItem[];
  shownModules: string[];
  leadStarted: boolean;
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** UUID v4 (crypto.randomUUID quando existir; senão um gerador com o mesmo formato). */
export function newSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* segue pro fallback */
  }
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const variant = "89ab"[Math.floor(Math.random() * 4)];
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

let idSeq = 0;
export function newItemId(): string {
  idSeq += 1;
  return `m${Date.now().toString(36)}${idSeq}`;
}

function isItem(v: unknown): v is ChatItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    (o.role === "bot" || o.role === "user") &&
    (o.kind === "text" || o.kind === "modules" || o.kind === "cta") &&
    typeof o.ts === "number" &&
    typeof o.turn === "number" &&
    (o.text === undefined || typeof o.text === "string") &&
    (o.modules === undefined || (Array.isArray(o.modules) && o.modules.every((m) => typeof m === "string")))
  );
}

function fresh(): MidasSession {
  return { sessionId: newSessionId(), state: initialState(), items: [], shownModules: [], leadStarted: false };
}

/** Lê a sessão salva; qualquer coisa inválida vira sessão nova. */
export function loadSession(): MidasSession {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh();
    const o = JSON.parse(raw) as Record<string, unknown>;
    const state = typeof o.state === "string" ? deserialize(o.state) : null;
    if (!state || typeof o.sessionId !== "string" || !UUID_V4.test(o.sessionId)) return fresh();
    // Erros de rede não são persistidos (o retry depende do turno em memória).
    const items = Array.isArray(o.items) ? o.items.filter(isItem).slice(-MAX_ITEMS) : [];
    const known = new Set(MIDAS_MODULES.map((m) => m.id));
    const shownModules = Array.isArray(o.shownModules)
      ? o.shownModules.filter((m): m is string => typeof m === "string" && known.has(m))
      : [];
    return { sessionId: o.sessionId, state, items, shownModules, leadStarted: o.leadStarted === true };
  } catch {
    return fresh();
  }
}

export function saveSession(s: MidasSession): void {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sessionId: s.sessionId,
        state: serialize(s.state),
        items: s.items.filter((i) => i.kind !== "error").slice(-MAX_ITEMS),
        shownModules: s.shownModules,
        leadStarted: s.leadStarted,
      }),
    );
  } catch {
    /* modo privado / storage cheio: a demo segue sem retomada */
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

const PAINS: Pain[] = ["financeiro", "contas", "estoque", "vendas", "impostos", "relatorios", "canais", "tudo"];
/** Módulos Pro não aparecem em nenhuma dor do catálogo; mapeados pela área mais próxima. */
const PRO_TOPIC_PAIN: Record<string, Pain> = {
  cobrancaEmail: "contas",
  leitorNf: "impostos",
  pdv: "vendas",
};

/** `?topic=` → dor. Aceita id de dor ou de módulo; desconhecido → null. */
export function topicToPain(topic: string | null): Pain | null {
  if (!topic) return null;
  if ((PAINS as string[]).includes(topic)) return topic as Pain;
  if (PRO_TOPIC_PAIN[topic]) return PRO_TOPIC_PAIN[topic];
  if (!MIDAS_MODULES.some((m) => m.id === topic)) return null;
  // Primeiro a dor em que o módulo é o principal; senão, a primeira em que aparece.
  return (
    PAINS.find((p) => modulesForPain(p)[0] === topic) ??
    PAINS.find((p) => modulesForPain(p).includes(topic)) ??
    null
  );
}

export type LeadStatus = "started" | "in_progress" | "completed";

export interface LeadPayload {
  sessionId: string;
  locale: string;
  name?: string;
  segment?: string;
  mainPain?: string;
  currentTools: string[];
  painPoints: string[];
  interestedModules: string[];
  transcript: { role: "user" | "bot"; text: string; ts: number }[];
  status: LeadStatus;
  consent: { accepted: true; version: string };
}

/** Monta o payload compatível com sanitizeLeadInput (lib/midas/leadServer.ts). */
export function buildLeadPayload(
  sessionId: string,
  locale: string,
  state: MidasState,
  items: ChatItem[],
  shownModules: string[],
  status: LeadStatus,
): LeadPayload {
  const { ctx } = state;
  const painPoints = [ctx.pain, ctx.visibilityGap ? "visibilityGap" : undefined].filter((v): v is string => !!v);
  const interested = Array.from(new Set([...ctx.interestedModules, ...shownModules])).slice(0, 10);
  const transcript = items
    .filter((i) => i.kind === "text" && i.text)
    .map((i) => ({ role: i.role, text: (i.text as string).slice(0, 800), ts: i.ts }))
    .slice(-40);
  const out: LeadPayload = {
    sessionId,
    locale: ["pt-BR", "en", "es"].includes(locale) ? locale : "pt-BR",
    currentTools: ctx.tool ? [ctx.tool] : [],
    painPoints,
    interestedModules: interested,
    transcript,
    status,
    consent: { accepted: true, version: CONSENT_VERSION },
  };
  const name = ctx.name?.trim();
  if (name) out.name = name.slice(0, 60);
  if (ctx.segment) out.segment = ctx.segment;
  if (ctx.pain) out.mainPain = ctx.pain;
  return out;
}

export interface SyncResult {
  ok: boolean;
  /** Status salvo no servidor (quando a resposta o traz). */
  status?: string;
}

/**
 * Fire-and-forget com no máximo uma nova tentativa. Nunca rejeita.
 * HTTP 200 com `{ ok: false }` (consentimento recusado, limite de taxa) conta como falha.
 */
export function syncLead(payload: LeadPayload): Promise<SyncResult> {
  const send = (): Promise<SyncResult> =>
    fetch("/api/midas/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    })
      .then((r) => {
        if (!r.ok) throw new Error("lead");
        return r.json() as Promise<{ ok?: unknown; status?: unknown }>;
      })
      .then((d) => {
        if (!d || d.ok !== true) throw new Error("lead");
        return { ok: true, status: typeof d.status === "string" ? d.status : undefined };
      });
  return send().catch(
    () =>
      new Promise<SyncResult>((resolve) => {
        setTimeout(() => {
          send().then(resolve, () => resolve({ ok: false }));
        }, 1500);
      }),
  );
}

export function whatsappHref(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
