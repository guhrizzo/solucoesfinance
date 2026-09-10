"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X, ChevronRight } from "lucide-react";
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

// Cada assunto do menu vem de landing.whatsapp.topics (nos 3 idiomas): o
// rótulo do botão e a mensagem já pronta que abre no WhatsApp.
type Topic = { label: string; message: string };

function WaGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.372-.025-.521-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

/**
 * Botão flutuante do WhatsApp na landing pública — estilo "zap" clássico:
 * bolha verde com anel pulsante, badge de mensagem e tooltip no hover.
 *
 * Ao clicar, abre um modal onde o visitante escolhe o assunto da dúvida
 * (baseado nos módulos do produto — fluxo de caixa, contas, impostos,
 * estoque/marketplaces, vendas, equipe/PIN, planos…). A escolha abre o
 * WhatsApp já com a mensagem certa.
 *
 * Canto inferior DIREITO, empilhado ACIMA do widget de acessibilidade
 * (AccessibilityWidget.tsx). Renderizado em portal no <body>: a landing
 * envolve tudo num container com `filter: blur(0px)` (efeito de reveal),
 * que vira bloco de contenção e quebraria o `position: fixed`.
 * Estilos em globals.css (`.wa-fab`, `.wa-modal`).
 */
export function WhatsAppFab() {
  const t = useTranslations("landing.whatsapp");
  const mounted = useMounted();
  const { enabled: a11yWidgetOn } = useAccessibilityWidget();
  const consent = useSyncExternalStore(subscribeConsent, getConsentSnapshot, () => null);
  const [open, setOpen] = useState(false);

  // Esc fecha o modal e trava o scroll do fundo enquanto aberto.
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

  if (!mounted) return null;

  // O botão de acessibilidade fica em bottom:20 (ou 88 com o banner de
  // cookies ainda aberto) e tem 48px de altura. Subimos o WhatsApp pra
  // ficar logo acima dele, com uma folga.
  const cookieBarOpen = consent === null;
  const bottom = (cookieBarOpen ? 96 : 24) + (a11yWidgetOn ? 60 : 0);

  const topics = (t.raw("topics") as Topic[]) ?? [];

  const goToWhatsApp = (message: string) => {
    const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
    window.open(href, "_blank", "noopener,noreferrer");
    setOpen(false);
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
        <span className="wa-fab__badge" aria-hidden="true">
          1
        </span>
        <WaGlyph />
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
          <div className="wa-modal" role="dialog" aria-modal="true" aria-label={t("modalTitle")}>
            <div className="wa-modal__head">
              <span className="wa-modal__icon" aria-hidden="true">
                <WaGlyph />
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
            <div className="wa-modal__list">
              {topics.map((topic, i) => (
                <button
                  key={i}
                  type="button"
                  className="wa-modal__topic"
                  onClick={() => goToWhatsApp(topic.message)}
                >
                  <span>{topic.label}</span>
                  <ChevronRight aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
