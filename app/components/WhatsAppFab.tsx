"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X, Send } from "lucide-react";
import { getConsentSnapshot, subscribeConsent } from "@/lib/consent";
import { useAccessibilityWidget } from "@/app/hooks/useAccessibilityWidget";

// Número de contato (formato internacional, só dígitos) — +55 11 92619-8042
const WHATSAPP_NUMBER = "5511926198042";

// true só no client — sem setState em effect (lint: react-hooks/set-state-in-effect).
// Mesma técnica do useMounted() em app/[locale]/page.tsx.
const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

// Cada tópico vem de landing.whatsapp.topics (nos 3 idiomas): o rótulo do
// chip, a resposta pronta que o bot mostra na hora (`answer`) e a mensagem
// já pronta pra escalar pro WhatsApp (`message`).
type Topic = { label: string; message: string; answer: string };

type ChatMsg = {
  id: string;
  role: "user" | "bot";
  text: string;
  /** Mostra o botão de escalar pro WhatsApp embaixo desta mensagem específica. */
  whatsappMessage?: string;
};

function WaGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

// Ícone do Midas — "badge" do Tabler (tabler.io/icons?icon=badge), traço só.
function MidasGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M17 17v-13l-5 3l-5 -3v13l5 3l5 -3" />
    </svg>
  );
}

/**
 * Botão flutuante na landing pública — estilo "zap" clássico: bolha verde
 * com anel pulsante, badge de mensagem e tooltip no hover.
 *
 * Ao clicar, abre um chat simples ali mesmo na página: chips de assunto
 * (baseados nos módulos do produto) respondem na hora com um texto pronto,
 * e um campo de texto livre chama `/api/chat` (Claude API, quando
 * configurada no servidor) pra perguntas mais abertas. Se a IA não estiver
 * disponível, falhar, ou o visitante preferir, um botão de WhatsApp sempre
 * visível escala pra um humano (`wa.me` com a mensagem já pronta).
 *
 * Canto inferior DIREITO, empilhado ACIMA do widget de acessibilidade
 * (AccessibilityWidget.tsx). Renderizado em portal no <body>: a landing
 * envolve tudo num container com `filter: blur(0px)` (efeito de reveal),
 * que vira bloco de contenção e quebraria o `position: fixed`.
 * Estilos em globals.css (`.wa-fab`, `.wa-modal`, `.wa-chat__*`).
 */
export function WhatsAppFab() {
  const t = useTranslations("landing.whatsapp");
  const mounted = useMounted();
  const { enabled: a11yWidgetOn } = useAccessibilityWidget();
  const consent = useSyncExternalStore(subscribeConsent, getConsentSnapshot, () => null);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const idRef = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const nextId = () => `msg-${idRef.current++}`;

  // Esc fecha o chat e trava o scroll do fundo enquanto aberto.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("modal-open");
    };
  }, [open]);

  // Saudação inicial, uma vez só, na primeira abertura.
  useEffect(() => {
    if (!open || messages.length > 0) return;
    setMessages([{ id: nextId(), role: "bot", text: t("greeting") }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Rola pro fim sempre que a conversa muda.
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, sending]);

  if (!mounted) return null;

  // O botão de acessibilidade fica em bottom:20 (ou 88 com o banner de
  // cookies ainda aberto) e tem 48px de altura. Subimos o zap pra ficar
  // logo acima dele, com uma folga.
  const cookieBarOpen = consent === null;
  const bottom = (cookieBarOpen ? 96 : 24) + (a11yWidgetOn ? 60 : 0);

  const topics = (t.raw("topics") as Topic[]) ?? [];
  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.text;

  const goToWhatsApp = (message: string) => {
    const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const handleTopic = (topic: Topic) => {
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: "user", text: topic.label },
      { id: nextId(), role: "bot", text: topic.answer },
    ]);
  };

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const history = messages.map((m) => ({ role: m.role, text: m.text }));
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text }]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json().catch(() => ({ reply: null }));
      const reply = typeof data?.reply === "string" && data.reply ? data.reply : null;
      setMessages((prev) => [
        ...prev,
        reply
          ? { id: nextId(), role: "bot", text: reply }
          : { id: nextId(), role: "bot", text: t("fallback"), whatsappMessage: text },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "bot", text: t("fallback"), whatsappMessage: text },
      ]);
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <>
      <button
        type="button"
        aria-label={t("aria")}
        aria-haspopup="dialog"
        className="wa-fab"
        style={{ bottom }}
        onClick={() => setOpen(true)}
      >
        <MidasGlyph />
        <span className="wa-fab__tooltip" aria-hidden="true">
          {t("tooltip")}
        </span>
      </button>

      {open && (
        <div
          className="wa-modal-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="wa-modal wa-chat" role="dialog" aria-modal="true" aria-label={t("modalTitle")}>
            <div className="wa-modal__head">
              <span className="wa-modal__icon" aria-hidden="true">
                <MidasGlyph />
              </span>
              <div>
                <p className="wa-modal__title">{t("modalTitle")}</p>
                <p className="wa-modal__subtitle">{t("modalSubtitle")}</p>
              </div>
              <button
                type="button"
                className="wa-modal__close"
                aria-label={t("close")}
                onClick={() => setOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="wa-chat__body" ref={bodyRef}>
              {messages.map((m) => (
                <div key={m.id} className={`wa-chat__bubble wa-chat__bubble--${m.role}`}>
                  <p>{m.text}</p>
                  {m.whatsappMessage !== undefined && (
                    <button
                      type="button"
                      className="wa-chat__wa-inline"
                      onClick={() => goToWhatsApp(m.whatsappMessage as string)}
                    >
                      <WaGlyph aria-hidden="true" />
                      {t("whatsappCta")}
                    </button>
                  )}
                </div>
              ))}
              {sending && (
                <div className="wa-chat__bubble wa-chat__bubble--bot wa-chat__bubble--typing" aria-label={t("typing")}>
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>

            {topics.length > 0 && (
              <div className="wa-chat__topics">
                {topics.map((topic, i) => (
                  <button key={i} type="button" className="wa-chat__topic-chip" onClick={() => handleTopic(topic)}>
                    {topic.label}
                  </button>
                ))}
              </div>
            )}

            <form
              className="wa-chat__inputbar"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("inputPlaceholder")}
                maxLength={800}
              />
              <button type="submit" aria-label={t("send")} disabled={!input.trim() || sending}>
                <Send size={16} />
              </button>
            </form>

            <button type="button" className="wa-chat__footer-cta" onClick={() => goToWhatsApp(lastUserText ?? t("prefill"))}>
              <WaGlyph aria-hidden="true" />
              {t("whatsappCta")}
            </button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
