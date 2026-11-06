// lib/midas/leadServer.ts
// Persistência do lead da demo do Midas (coleção demoLeads/{sessionId}).
// SOMENTE servidor: quem fala com o Firestore é o Admin SDK (app/api/midas/*),
// e o `db` entra por parâmetro pra os testes injetarem um Firestore em memória.
import type { Lead, Pain, Segment } from "./types";

/** Retenção do lead: 12 meses ≈ 365 dias em ms (sem helper de calendário no projeto; simples e determinístico). */
export const LEAD_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export const LEAD_COLLECTION = "demoLeads";

/** Tempo mínimo entre o início da sessão e a conclusão pra disparar o aviso (anti-spam). */
export const MIN_SESSION_MS = 20_000;
/** Mensagens mínimas (e quantas do usuário) pra a conversa contar como real. */
const MIN_TRANSCRIPT_MSGS = 4;
const MIN_USER_MSGS = 2;

function hasRealConversation(t: Lead["transcript"] | undefined): boolean {
  return Array.isArray(t) && t.length >= MIN_TRANSCRIPT_MSGS && t.filter((m) => m.role === "user").length >= MIN_USER_MSGS;
}

type ClientStatus = "started" | "in_progress" | "completed";

/** O que o cliente pode enviar — nunca converted/convertedUid/startedTrial/expiresAt/whatsapp. */
export interface LeadInput {
  sessionId: string;
  locale: "pt-BR" | "en" | "es";
  name?: string;
  segment?: Segment;
  mainPain?: Pain;
  currentTools: string[];
  painPoints: string[];
  interestedModules: string[];
  transcript: Lead["transcript"];
  status: ClientStatus;
  consent: Lead["consent"];
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCALES = ["pt-BR", "en", "es"] as const;
const SEGMENTS: Segment[] = ["loja", "ecommerce", "servicos", "industria", "distribuidora", "outro"];
const PAINS: Pain[] = ["financeiro", "contas", "estoque", "vendas", "impostos", "relatorios", "canais", "tudo"];
const STATUSES: ClientStatus[] = ["started", "in_progress", "completed"];
const RANK: Record<Lead["status"], number> = { started: 0, in_progress: 1, completed: 2, converted: 3 };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, max);
  return t || undefined;
};
const strList = (v: unknown, itemMax: number, cap = 10): string[] =>
  Array.isArray(v) ? v.map((x) => str(x, itemMax)).filter((x): x is string => !!x).slice(0, cap) : [];

export function isValidSessionId(v: unknown): v is string {
  return typeof v === "string" && UUID_V4.test(v);
}

export function sanitizeLeadInput(raw: unknown): LeadInput | null {
  if (!isRecord(raw) || !isValidSessionId(raw.sessionId)) return null;

  const locale = (LOCALES as readonly string[]).includes(raw.locale as string) ? (raw.locale as LeadInput["locale"]) : "pt-BR";
  const status = STATUSES.includes(raw.status as ClientStatus) ? (raw.status as ClientStatus) : "started";

  let transcript: LeadInput["transcript"] = [];
  if (Array.isArray(raw.transcript)) {
    for (const m of raw.transcript) {
      if (!isRecord(m) || (m.role !== "user" && m.role !== "bot")) continue;
      const text = str(m.text, 800);
      if (!text) continue;
      const ts = typeof m.ts === "number" && Number.isFinite(m.ts) ? m.ts : 0;
      transcript.push({ role: m.role, text, ts });
    }
    transcript = transcript.slice(-40); // fica com as 40 mais recentes
  }

  const c = isRecord(raw.consent) ? raw.consent : {};
  if (c.accepted !== true) return null; // sem consentimento, nada é gravado
  const out: LeadInput = {
    sessionId: raw.sessionId,
    locale,
    currentTools: strList(raw.currentTools, 80),
    painPoints: strList(raw.painPoints, 80),
    interestedModules: strList(raw.interestedModules, 80),
    transcript,
    status,
    consent: { accepted: true, version: str(c.version, 20) ?? "" },
  };
  const name = str(raw.name, 60);
  if (name) out.name = name;
  if (SEGMENTS.includes(raw.segment as Segment)) out.segment = raw.segment as Segment;
  if (PAINS.includes(raw.mainPain as Pain)) out.mainPain = raw.mainPain as Pain;
  return out;
}

// Subconjunto do Firestore Admin que usamos (permite injetar o fake nos testes).
interface DbLike {
  doc(path: string): any;
  runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T>;
}

/** Cria ou atualiza o lead. Idempotente; o status só avança. */
export async function upsertLead(
  db: DbLike,
  input: LeadInput,
  now: number
): Promise<{ status: Lead["status"]; justCompleted: boolean }> {
  const ref = db.doc(`${LEAD_COLLECTION}/${input.sessionId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      // Nunca nasce "completed": só uma sessão já existente pode concluir.
      const status: Lead["status"] = input.status === "completed" ? "in_progress" : input.status;
      const doc: Record<string, unknown> = {
        ...input,
        status,
        startedAt: now,
        updatedAt: now,
        expiresAt: now + LEAD_RETENTION_MS,
        startedTrial: false,
      };
      tx.set(ref, doc);
      return { status, justCompleted: false };
    }
    const cur = snap.data() as Lead;
    if (cur.status === "converted") {
      // Convertido é terminal: só renova updatedAt.
      tx.set(ref, { updatedAt: now }, { merge: true });
      return { status: "converted" as const, justCompleted: false };
    }
    let status: Lead["status"] = RANK[input.status] > RANK[cur.status] ? input.status : cur.status;
    if (status === "completed" && cur.status !== "completed") {
      const eligible =
        (hasRealConversation(input.transcript) || hasRealConversation(cur.transcript)) &&
        now - cur.startedAt >= MIN_SESSION_MS;
      if (!eligible) status = "in_progress";
    }
    const justCompleted = status === "completed" && cur.status !== "completed";
    // Campos do servidor (startedAt, expiresAt, convertedUid, startedTrial, whatsapp) ficam de fora.
    const patch: Record<string, unknown> = {
      locale: input.locale,
      currentTools: input.currentTools,
      painPoints: input.painPoints,
      interestedModules: input.interestedModules,
      transcript: input.transcript,
      consent: input.consent,
      status,
      updatedAt: now,
    };
    if (input.name) patch.name = input.name;
    if (input.segment) patch.segment = input.segment;
    if (input.mainPain) patch.mainPain = input.mainPain;
    if (justCompleted) patch.completedAt = now;
    tx.set(ref, patch, { merge: true });
    return { status, justCompleted };
  });
}

/** Marca o lead como convertido (cadastro feito). false se o lead não existe. */
export async function markConverted(db: DbLike, sessionId: string, uid: string): Promise<boolean> {
  if (!isValidSessionId(sessionId) || !uid) return false;
  const ref = db.doc(`${LEAD_COLLECTION}/${sessionId}`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    if ((snap.data() as Lead).status === "converted") return true; // idempotente: não troca o convertedUid
    tx.set(ref, { status: "converted", convertedUid: uid, startedTrial: true, updatedAt: Date.now() }, { merge: true });
    return true;
  });
}

/** Grava o resultado do aviso de WhatsApp (best-effort, nunca lança). */
export async function setWhatsAppResult(db: DbLike, sessionId: string, result: "sent" | "not_configured" | "failed") {
  try {
    await db.doc(`${LEAD_COLLECTION}/${sessionId}`).set({ whatsapp: result }, { merge: true });
  } catch {
    /* ignore */
  }
}
