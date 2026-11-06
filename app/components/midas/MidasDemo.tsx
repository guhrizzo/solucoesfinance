"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { SendHorizontal } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/app/components/ui/Button";
import {
  applyAnswer, chipsFor, goBack, initialState, progress, serialize, type MidasState,
} from "@/lib/midas/flow";
import { interpret } from "@/lib/midas/interpret";
import { MIDAS_MODULES } from "@/lib/midas/modules";
import type { Pain } from "@/lib/midas/types";
import { MidasHeader } from "./MidasHeader";
import { MessageList } from "./MessageList";
import { QuickReplies, type Chip } from "./QuickReplies";
import {
  buildLeadPayload, clearSession, loadSession, newItemId, newSessionId, saveSession, syncLead, topicToPain,
  type ChatItem,
} from "./useMidasSession";

// true só no client — mesma técnica do WhatsAppFab (sem setState em effect).
const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

/**
 * Demonstração guiada do Midas (/[locale]/demo). O conteúdo só monta no
 * cliente: a sessão vem do localStorage e o `?topic=` da URL.
 */
export function MidasDemo() {
  const mounted = useMounted();
  if (!mounted) return <div className="midas-page" aria-busy="true" />;
  return <MidasDemoInner />;
}

type Translator = ReturnType<typeof useTranslations>;

const SLOT_STEPS = ["segment", "pain", "tool"] as const;
type SlotStep = (typeof SLOT_STEPS)[number];
const isSlotStep = (s: string): s is SlotStep => (SLOT_STEPS as readonly string[]).includes(s);

const MORE_PAGE = 3;

function readTopic(): Pain | null {
  try {
    return topicToPain(new URLSearchParams(window.location.search).get("topic"));
  } catch {
    return null;
  }
}

/** Pré-seleciona a dor vinda de `?topic=` sem pular perguntas obrigatórias. */
function applyTopic(state: MidasState, pain: Pain): MidasState {
  if (state.step === "pain") return applyAnswer(state, { chip: pain });
  if ((state.step === "welcome" || state.step === "name" || state.step === "segment") && !state.ctx.pain) {
    return { ...state, ctx: { ...state.ctx, pain } };
  }
  return state;
}

function botItem(text: string, turn: number, extra: Partial<ChatItem> = {}): ChatItem {
  return { id: newItemId(), role: "bot", kind: "text", text, ts: Date.now(), turn, ...extra };
}

/** Falas da Midas ao entrar numa etapa (texto puro; {name} trocado aqui, nunca HTML). */
function enteringItems(t: Translator, s: MidasState, shown: string[], viaMore: boolean): ChatItem[] {
  const turn = s.history.length;
  const out: ChatItem[] = [];
  const name = s.ctx.name?.trim();
  const key = !name && t.has(`steps.${s.step}.botNoName`) ? `steps.${s.step}.botNoName` : `steps.${s.step}.bot`;
  const lines = (t.raw(key) as string[]) ?? [];

  if (s.step === "modules" && viaMore) {
    const seen = new Set([...shown, ...s.ctx.interestedModules]);
    const extra = MIDAS_MODULES.filter((m) => !seen.has(m.id)).slice(0, MORE_PAGE).map((m) => m.id);
    if (extra.length) out.push({ id: newItemId(), role: "bot", kind: "modules", modules: extra, ts: Date.now(), turn });
    else out.push(botItem(t("overview"), turn));
    return out;
  }

  for (const line of lines) out.push(botItem(line.split("{name}").join(name ?? ""), turn));
  if (s.step === "diagnosis") {
    if (s.ctx.pain) out.push(botItem(t(`diagnosis.${s.ctx.pain}`), turn));
    if (s.ctx.visibilityGap) out.push(botItem(t("diagnosis.visibilityGap"), turn));
  }
  if (s.step === "modules" && s.ctx.interestedModules.length) {
    out.push({ id: newItemId(), role: "bot", kind: "modules", modules: [...s.ctx.interestedModules], ts: Date.now(), turn });
  }
  if (s.step === "cta") out.push({ id: newItemId(), role: "bot", kind: "cta", ts: Date.now(), turn });
  return out;
}

const shownFrom = (list: ChatItem[]) => list.flatMap((i) => (i.kind === "modules" ? i.modules ?? [] : []));

interface Boot {
  sessionId: string;
  state: MidasState;
  items: ChatItem[];
  queue: ChatItem[];
  leadStarted: boolean;
  topic: Pain | null;
}

function MidasDemoInner() {
  const t = useTranslations("midas");
  const locale = useLocale();

  const [boot] = useState<Boot>(() => {
    const s = loadSession();
    const topic = readTopic();
    if (topic && s.state.consented) {
      const next = applyTopic(s.state, topic);
      const queue = next.step !== s.state.step ? enteringItems(t, next, shownFrom(s.items), false) : [];
      return { ...s, state: next, queue, topic: null };
    }
    return { ...s, queue: [], topic };
  });

  const [sessionId, setSessionId] = useState(boot.sessionId);
  const [state, setState] = useState<MidasState>(boot.state);
  const [items, setItems] = useState<ChatItem[]>(boot.items);
  const [queue, setQueue] = useState<ChatItem[]>(boot.queue);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [topic, setTopic] = useState<Pain | null>(boot.topic);

  const leadStartedRef = useRef(boot.leadStarted);
  const lastSyncedRef = useRef(boot.state.consented ? serialize(boot.state) : "");
  const retryRef = useRef<(() => void) | null>(null);
  const stateRef = useRef(state);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const typing = queue.length > 0;
  const locked = typing || busy;

  // Digitação: revela uma fala por vez, com atraso proporcional ao tamanho.
  useEffect(() => {
    if (!queue.length) return;
    const next = queue[0];
    const len = next.kind === "text" ? (next.text ?? "").length : 60;
    const delay = Math.min(900, 400 + len * 4);
    const id = window.setTimeout(() => {
      setItems((prev) => [...prev, next]);
      setQueue((q) => q.slice(1));
    }, delay);
    return () => window.clearTimeout(id);
  }, [queue]);

  // Rolagem automática até a última mensagem.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items.length, queue.length, busy]);

  // Persistência local (retomada da sessão).
  useEffect(() => {
    saveSession({ sessionId, state, items: [...items, ...queue], shownModules: shownFrom([...items, ...queue]), leadStarted: leadStartedRef.current });
  }, [sessionId, state, items, queue]);

  // Lead: um POST a cada avanço do fluxo, só depois do consentimento.
  useEffect(() => {
    if (!state.consented) return;
    const key = serialize(state);
    if (key === lastSyncedRef.current) return;
    lastSyncedRef.current = key;
    const status = state.step === "cta" ? "completed" : leadStartedRef.current ? "in_progress" : "started";
    leadStartedRef.current = true;
    const all = [...items, ...queue];
    syncLead(buildLeadPayload(sessionId, locale, state, all, shownFrom(all), status));
  }, [state, items, queue, sessionId, locale]);

  const focusInput = useCallback((fromText: boolean) => {
    let fine = true;
    try {
      fine = window.matchMedia("(pointer: fine)").matches;
    } catch {
      /* ignore */
    }
    if (fromText || fine) inputRef.current?.focus();
  }, []);

  /** Chama a IA opcional. kind "doubt": dúvida livre; "slot": texto que o dicionário não entendeu. */
  const askAi = useCallback(
    async (message: string, kind: "doubt" | "slot", historyItems: ChatItem[], turn: number) => {
      setBusy(true);
      retryRef.current = null;
      const history = historyItems
        .filter((i) => i.kind === "text" && i.text)
        .slice(-6)
        .map((i) => ({ role: i.role, text: i.text as string }));
      let reply: string | null = null;
      let slots: Record<string, unknown> = {};
      try {
        const res = await fetch("/api/midas/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message, history, locale, consented: true }),
        });
        if (!res.ok) throw new Error("turn");
        const data = (await res.json()) as { reply?: unknown; slots?: unknown };
        reply = typeof data.reply === "string" && data.reply.trim() ? data.reply.trim() : null;
        slots = data.slots && typeof data.slots === "object" ? (data.slots as Record<string, unknown>) : {};
      } catch {
        retryRef.current = () => {
          setItems((prev) => prev.filter((i) => i.kind !== "error"));
          void askAi(message, kind, historyItems, turn);
        };
        setQueue((q) => [...q, botItem(t("errors.network"), turn, { kind: "error", aux: true })]);
        setBusy(false);
        return;
      }

      const out: ChatItem[] = [];
      if (kind === "doubt") {
        out.push(reply ? botItem(reply, turn, { aux: true }) : botItem(t("common.doubtFallback"), turn, { aux: true, whatsapp: true }));
        setQueue((q) => [...q, ...out]);
        setBusy(false);
        return;
      }

      // Slots só pelas vias do motor: a resposta da etapa atual vira o chip correspondente.
      const before = stateRef.current;
      let s = before;
      for (let guard = 0; guard < 3 && isSlotStep(s.step); guard++) {
        const value = slots[s.step];
        if (typeof value !== "string" || s.ctx[s.step]) break;
        const next = applyAnswer(s, { chip: value });
        if (next.step === s.step) break;
        s = next;
      }
      if (reply) out.push(botItem(reply, turn, { aux: true }));
      if (s !== before) {
        const shown = shownFrom(historyItems);
        out.push(...enteringItems(t, s, shown, false));
        setState(s);
      } else if (!reply) {
        out.push(botItem(t("common.didntUnderstand"), turn, { aux: true }));
      }
      setQueue((q) => [...q, ...out]);
      setBusy(false);
    },
    [locale, t],
  );

  const answer = useCallback(
    (ans: { chip?: string; text?: string; label: string }) => {
      if (locked) return;
      const prev = state;
      const text = (ans.text ?? "").trim();
      const turn = prev.history.length;
      const all = [...items, ...queue];
      const newItems: ChatItem[] = [];
      if (ans.label.trim()) {
        newItems.push({ id: newItemId(), role: "user", kind: "text", text: ans.label.trim().slice(0, 800), ts: Date.now(), turn });
      }
      // Remove erros de rede antigos (a resposta nova substitui o retry).
      const base = all.filter((i) => i.kind !== "error");
      retryRef.current = null;

      const next = applyAnswer(prev, ans.chip ? { chip: ans.chip } : { text });
      const out: ChatItem[] = [];
      let ai: "doubt" | "slot" | null = null;

      if (next.step !== prev.step || next.history.length !== prev.history.length) {
        out.push(...enteringItems(t, next, shownFrom(base), ans.chip === "more"));
      } else if (prev.step === "welcome" && next.overview) {
        out.push(botItem(t("overview"), turn, { aux: true }));
      } else if (next.ctx.retry) {
        if (!ans.chip && !text) out.push(botItem(t("errors.empty"), turn, { aux: true }));
        else if (!ans.chip && isSlotStep(prev.step)) ai = "slot";
        else out.push(botItem(t("common.didntUnderstand"), turn, { aux: true }));
      } else if (prev.step === "confirm" || prev.step === "doubts" || prev.step === "cta") {
        // "não"/"no" curto sem pergunta = recusa; qualquer outro texto vira dúvida
        // (o dicionário lê "no" do espanhol em frases como "funciona no celular?").
        const refusal = !ans.chip && !!text && interpret(text).no === true && !text.includes("?");
        if (!ans.chip && text && !refusal) ai = "doubt";
        else if (ans.chip === "doubts" || refusal) {
          for (const line of t.raw("steps.doubts.bot") as string[]) out.push(botItem(line, turn, { aux: true }));
        }
      }

      const history = [...base, ...newItems];
      setItems(history);
      setQueue(out);
      setState(next);
      setInput("");
      if (ai) void askAi(text, ai, history, turn);
      focusInput(!ans.chip);
    },
    [askAi, focusInput, items, locked, queue, state, t],
  );

  const consent = (chip: "start" | "overview") => {
    const consented: MidasState = { ...state, consented: true };
    let next = applyAnswer(consented, { chip });
    next = { ...next, consented: true };
    if (topic) {
      next = applyTopic(next, topic);
      setTopic(null);
    }
    const out = enteringItems(t, consented, [], false);
    if (chip === "overview") out.push(botItem(t("overview"), 0, { aux: true }));
    else out.push(...enteringItems(t, next, [], false));
    setItems([]);
    setQueue(out);
    setState(next);
  };

  const back = () => {
    if (locked) return;
    const next = goBack(state);
    if (next === state) return;
    const h = next.history.length;
    retryRef.current = null;
    setItems([...items, ...queue].filter((i) => i.turn < h || (i.turn === h && i.role === "bot" && !i.aux && i.kind !== "error")));
    setQueue([]);
    setState(next);
    focusInput(false);
  };

  const restart = () => {
    clearSession();
    retryRef.current = null;
    leadStartedRef.current = false;
    lastSyncedRef.current = "";
    setSessionId(newSessionId());
    setItems([]);
    setQueue([]);
    setBusy(false);
    setInput("");
    setState(initialState());
  };

  const labelStep = (state.step === "confirm" || state.step === "doubts") && state.ctx.doubts.length ? "doubts" : state.step;
  const chips: Chip[] = state.consented
    ? chipsFor(state).map((id) => ({ id, label: t(`steps.${labelStep}.chips.${id}`) }))
    : [];

  return (
    <div className="midas-page">
      <MidasHeader
        value={progress(state)}
        canGoBack={state.consented && state.history.length > 0 && !locked}
        onBack={back}
        canRestart={state.consented}
        onRestart={restart}
      />

      {!state.consented ? (
        <main className="midas-intro">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nexus_fi_logo_preto.png" alt="NexusFi" className="midas-logo" />
          <h1 className="midas-intro__hello">{t("common.introHello")}</h1>
          <p className="midas-intro__line">{t("common.introLine")}</p>
          <p className="midas-intro__welcome">{t("common.introWelcome")}</p>
          <div className="midas-privacy">
            <p>{t("privacy.notice")}</p>
            <p>{t("privacy.retention")}</p>
            <p>{t("common.privacyAi")}</p>
            <Link href="/privacidade" className="midas-privacy__link" target="_blank" rel="noopener">
              {t("privacy.link")}
            </Link>
          </div>
          <div className="midas-intro__actions">
            <Button size="lg" onClick={() => consent("start")} autoFocus>
              {t("common.introStart")}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => consent("overview")}>
              {t("steps.welcome.chips.overview")}
            </Button>
          </div>
        </main>
      ) : (
        <>
          <main className="midas-scroll" ref={logRef}>
            <div className="midas-column">
              <MessageList
                items={items}
                typing={typing || busy}
                sessionId={sessionId}
                onRetry={() => retryRef.current?.()}
                retryDisabled={locked}
              />
              {!locked && (
                <QuickReplies chips={chips} disabled={locked} onPick={(c) => answer({ chip: c.id, label: c.label })} />
              )}
            </div>
          </main>

          <div className="midas-composer">
            <form
              className="midas-inputbar"
              onSubmit={(e) => {
                e.preventDefault();
                answer({ text: input, label: input });
              }}
            >
              <label htmlFor="midas-input" className="sr-only">
                {t("common.inputLabel")}
              </label>
              <input
                id="midas-input"
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("common.inputPlaceholder")}
                maxLength={800}
                autoComplete="off"
                readOnly={locked}
                aria-disabled={locked || undefined}
              />
              <button type="submit" aria-label={t("common.send")} title={t("common.send")} disabled={locked || !input.trim()}>
                <SendHorizontal size={17} aria-hidden="true" />
              </button>
            </form>
            <p className="midas-footnote">
              {t("common.footerNote")}{" "}
              <Link href="/privacidade" target="_blank" rel="noopener">
                {t("privacy.link")}
              </Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
