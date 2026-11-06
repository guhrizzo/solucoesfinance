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
import { shouldResendCompleted } from "@/lib/midas/resend";
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
const TURN_TIMEOUT_MS = 15_000;
const RESEND_COMPLETED_MS = 10_000;
const NEAR_BOTTOM_PX = 120;

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
  /** Visão geral vista na tela inicial, ANTES do aceite (sem rede, sem lead). */
  const [introOverview, setIntroOverview] = useState(false);

  const leadStartedRef = useRef(boot.leadStarted);
  const lastSyncedRef = useRef(boot.state.consented ? serialize(boot.state) : "");
  const retryRef = useRef<(() => void) | null>(null);
  const stateRef = useRef(state);
  const itemsRef = useRef<ChatItem[]>([]);
  /** Reenvio único do "completed" quando o servidor não confirmou (sessão rápida demais). */
  const resendTriedRef = useRef(false);
  const resendTimerRef = useRef<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const introRef = useRef<HTMLElement>(null);
  /** Token de requisição: restart/voltar incrementam e resultados antigos de /turn são descartados. */
  const reqTokenRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** Onde pôr o foco depois do próximo render. */
  const focusNextRef = useRef<"input" | "intro" | "overview" | null>(null);
  /** Rolagem: segue o fim só se o visitante já está perto dele (ou acabou de enviar). */
  const nearBottomRef = useRef(true);
  const forceScrollRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Foco pendente (aceite, chip, reinício): aplicado depois que o alvo existe no DOM.
  useEffect(() => {
    const target = focusNextRef.current;
    if (!target) return;
    focusNextRef.current = null;
    if (target === "input" && inputRef.current) inputRef.current.focus();
    else if (target === "intro") introRef.current?.focus();
    else if (target === "overview") document.getElementById("midas-overview")?.focus();
    else logRef.current?.focus();
  });

  // Cancela /turn pendente ao desmontar.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (resendTimerRef.current) window.clearTimeout(resendTimerRef.current);
    },
    [],
  );

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

  // Rolagem automática até a última mensagem (sem arrancar quem está lendo lá em cima).
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    if (nearBottomRef.current || forceScrollRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    forceScrollRef.current = false;
  }, [items.length, queue.length, busy]);

  // Persistência local (retomada da sessão).
  useEffect(() => {
    itemsRef.current = [...items, ...queue];
    saveSession({ sessionId, state, items: [...items, ...queue], shownModules: shownFrom([...items, ...queue]), leadStarted: leadStartedRef.current });
  }, [sessionId, state, items, queue]);

  // Lead: um POST a cada avanço do fluxo, só depois do consentimento.
  useEffect(() => {
    if (!state.consented) return;
    const key = serialize(state);
    if (key === lastSyncedRef.current) return;
    lastSyncedRef.current = key;
    const status = state.step === "cta" ? "completed" : leadStartedRef.current ? "in_progress" : "started";
    const all = [...items, ...queue];
    if (!leadStartedRef.current) {
      leadStartedRef.current = true;
      // Grava já, no mesmo passe: recarregar logo após o 1º POST não reenvia "started".
      saveSession({ sessionId, state, items: all, shownModules: shownFrom(all), leadStarted: true });
    }
    const token = reqTokenRef.current;
    void syncLead(buildLeadPayload(sessionId, locale, state, all, shownFrom(all), status)).then((res) => {
      // Falhou duas vezes: o próximo passe reenvia (desde que a sessão ainda seja a mesma).
      if (!res.ok && token === reqTokenRef.current && lastSyncedRef.current === key) lastSyncedRef.current = "";
      // No CTA e o servidor não confirmou "completed" (ex.: sessão muito rápida): reenvia uma vez após ~10s.
      if (
        res.ok && status === "completed" && token === reqTokenRef.current &&
        shouldResendCompleted(true, res.status) && !resendTriedRef.current
      ) {
        resendTriedRef.current = true;
        resendTimerRef.current = window.setTimeout(() => {
          resendTimerRef.current = null;
          const cur = stateRef.current;
          if (token !== reqTokenRef.current || cur.step !== "cta") return;
          const latest = itemsRef.current;
          void syncLead(buildLeadPayload(sessionId, locale, cur, latest, shownFrom(latest), "completed"));
        }, RESEND_COMPLETED_MS);
      }
    });
  }, [state, items, queue, sessionId, locale]);

  const focusInput = useCallback(() => {
    focusNextRef.current = "input";
  }, []);

  /** Chama a IA opcional. kind "doubt": dúvida livre; "slot": texto que o dicionário não entendeu. */
  const askAi = useCallback(
    async (message: string, kind: "doubt" | "slot", historyItems: ChatItem[], turn: number) => {
      if (!stateRef.current.consented) return; // nunca antes do aceite
      const token = reqTokenRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timer = window.setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);
      setBusy(true);
      retryRef.current = null;
      const prior = historyItems.filter((i) => i.kind === "text" && i.text);
      // A mensagem atual vai em `message`; não duplica no histórico.
      const last = prior[prior.length - 1];
      if (last && last.role === "user" && last.text === message) prior.pop();
      const history = prior
        .slice(-6)
        .map((i) => ({ role: i.role, text: i.text as string }));
      let reply: string | null = null;
      let slots: Record<string, unknown> = {};
      try {
        const res = await fetch("/api/midas/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message, history, locale, consented: true }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("turn");
        const data = (await res.json()) as { reply?: unknown; slots?: unknown };
        reply = typeof data.reply === "string" && data.reply.trim() ? data.reply.trim() : null;
        slots = data.slots && typeof data.slots === "object" ? (data.slots as Record<string, unknown>) : {};
      } catch {
        window.clearTimeout(timer);
        if (abortRef.current === controller) abortRef.current = null;
        // Resultado de uma sessão/etapa que já mudou (restart/voltar): descarta tudo.
        if (token !== reqTokenRef.current) return;
        retryRef.current = () => {
          setItems((prev) => prev.filter((i) => i.kind !== "error"));
          void askAi(message, kind, historyItems, turn);
        };
        setQueue((q) => [...q, botItem(t("errors.network"), turn, { kind: "error", aux: true })]);
        setBusy(false);
        return;
      }
      window.clearTimeout(timer);
      if (abortRef.current === controller) abortRef.current = null;
      if (token !== reqTokenRef.current) return;

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
      forceScrollRef.current = true;
      if (ai) void askAi(text, ai, history, turn);
      focusInput();
    },
    [askAi, focusInput, items, locked, queue, state, t],
  );

  /** Único ponto de aceite: "Ok, vamos lá" (= chip "start" do motor). A visão geral NÃO consente. */
  const consent = () => {
    let next = applyAnswer(state, { chip: "start" });
    next = { ...next, consented: true };
    if (topic) {
      next = applyTopic(next, topic);
      setTopic(null);
    }
    const out = [...enteringItems(t, { ...state, consented: true }, [], false), ...enteringItems(t, next, [], false)];
    setItems([]);
    setQueue(out);
    setState(next);
    setIntroOverview(false);
    nearBottomRef.current = true;
    focusInput();
  };

  /** Cancela qualquer /turn em andamento e invalida resultados que ainda cheguem. */
  const cancelPending = () => {
    reqTokenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    retryRef.current = null;
    setBusy(false);
  };

  const back = () => {
    if (locked) return;
    const next = goBack(state);
    if (next === state) return;
    cancelPending();
    const h = next.history.length;
    setItems([...items, ...queue].filter((i) => i.turn < h || (i.turn === h && i.role === "bot" && !i.aux && i.kind !== "error")));
    setQueue([]);
    setState(next);
    focusInput();
  };

  const restart = () => {
    cancelPending();
    clearSession();
    setIntroOverview(false);
    setTopic(null);
    focusNextRef.current = "intro";
    leadStartedRef.current = false;
    lastSyncedRef.current = "";
    resendTriedRef.current = false;
    if (resendTimerRef.current) window.clearTimeout(resendTimerRef.current);
    resendTimerRef.current = null;
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
        <main className="midas-intro" ref={introRef} tabIndex={-1}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nexus_fi_logo_preto.png" alt="NexusFi" className="midas-logo" />
          <h1 className="midas-intro__hello">{t("common.introHello")}</h1>
          <p className="midas-intro__line">{t("common.introLine")}</p>
          <p className="midas-intro__welcome">{t("common.introWelcome")}</p>
          {introOverview && (
            <p className="midas-intro__overview" id="midas-overview" tabIndex={-1}>
              {t("overview")}
            </p>
          )}
          <div className="midas-privacy">
            <p>{t("privacy.notice")}</p>
            <p>{t("privacy.retention")}</p>
            <p>{t("common.privacyAi")}</p>
            <Link href="/privacidade" className="midas-privacy__link" target="_blank" rel="noopener">
              {t("privacy.link")}
            </Link>
          </div>
          <div className="midas-intro__actions">
            <Button size="lg" onClick={consent} autoFocus>
              {t("common.introStart")}
            </Button>
            {!introOverview && (
              <Button
                size="lg"
                variant="secondary"
                aria-controls="midas-overview"
                onClick={() => {
                  // Só mostra o texto: nenhum aceite, nenhuma chamada de rede.
                  setIntroOverview(true);
                  focusNextRef.current = "overview";
                }}
              >
                {t("steps.welcome.chips.overview")}
              </Button>
            )}
          </div>
        </main>
      ) : (
        <>
          <main
            className="midas-scroll"
            ref={logRef}
            tabIndex={-1}
            onScroll={(e) => {
              const el = e.currentTarget;
              nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
            }}
          >
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
