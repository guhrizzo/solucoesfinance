"use client";

import { useTranslations } from "next-intl";
import { RotateCcw, Sparkles } from "lucide-react";
import type { ChatItem } from "./useMidasSession";
import { ModuleCard } from "./ModuleCard";
import { CtaCard, WhatsAppButton } from "./CtaCard";

interface Props {
  items: ChatItem[];
  typing: boolean;
  sessionId: string;
  onRetry: () => void;
  retryDisabled: boolean;
}

/** Histórico da conversa. Todo texto é renderizado como texto puro (sem HTML nem links automáticos). */
export function MessageList({ items, typing, sessionId, onRetry, retryDisabled }: Props) {
  const t = useTranslations("midas");

  return (
    <>
    <div className="midas-log" role="log" aria-live="polite" aria-relevant="additions">
      {items.map((item, i) => {
        const prev = items[i - 1];
        // Nome da Midas acima do primeiro balão de cada sequência dela.
        const showName = item.role === "bot" && (!prev || prev.role !== "bot");

        if (item.role === "user") {
          return (
            <div key={item.id} className="midas-msg midas-msg--user">
              <span className="sr-only">{t("common.you")}: </span>
              <p>{item.text}</p>
            </div>
          );
        }

        return (
          <div key={item.id} className={`midas-msg midas-msg--bot midas-msg--${item.kind}`}>
            {showName && (
              <p className="midas-msg__name">
                <span className="midas-avatar midas-avatar--sm" aria-hidden="true">
                  <Sparkles size={12} />
                </span>
                {t("header.title")}
              </p>
            )}
            {item.kind === "text" && (
              <>
                <p>{item.text}</p>
                {item.whatsapp && <WhatsAppButton compact />}
              </>
            )}
            {item.kind === "error" && (
              <div className="midas-error">
                <p>{item.text}</p>
                <button type="button" className="midas-chip" onClick={onRetry} disabled={retryDisabled}>
                  <RotateCcw size={13} aria-hidden="true" />
                  {t("errors.retry")}
                </button>
              </div>
            )}
            {item.kind === "modules" && (
              <div className="midas-modules">
                {(item.modules ?? []).map((id) => (
                  <ModuleCard key={id} id={id} />
                ))}
              </div>
            )}
            {item.kind === "cta" && <CtaCard sessionId={sessionId} />}
          </div>
        );
      })}

    </div>
    {/* Fora da região aria-live: os pontos são decorativos e o rótulo sr-only não é re-anunciado. */}
    {typing && (
      <div className="midas-msg midas-msg--bot midas-msg--typing">
        {(!items.length || items[items.length - 1].role !== "bot") && (
          <p className="midas-msg__name" aria-hidden="true">
            <span className="midas-avatar midas-avatar--sm">
              <Sparkles size={12} />
            </span>
            {t("header.title")}
          </p>
        )}
        <span className="sr-only">{t("common.typing")}</span>
        <div className="midas-typing" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    )}
    </>
  );
}
