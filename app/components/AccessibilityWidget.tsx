"use client";

// components/AccessibilityWidget.tsx
//
// Botão flutuante de acessibilidade, visível em toda a plataforma (site
// público + área logada — montado uma vez em app/layout.tsx). Inspirado no
// widget do site https://yasmintorquato.com.br. Controles:
//   - Tamanho do texto (escala o <html>, afeta toda unidade rem/em do app)
//   - Sublinhar links (ajuda a distinguir link de texto comum)
//   - Reduzir animações (reaproveita o mesmo estado de Configurações >
//     Aparência — ver app/hooks/useReducedMotion.ts)
//   - Tradução em Libras (widget oficial do governo, vlibras.gov.br)
//
// Cada preferência é salva em localStorage e aplicada via atributo/estilo em
// <html>, no mesmo padrão de app/hooks/useTheme.ts e useReducedMotion.ts.
// Um script inline em app/layout.tsx aplica tamanho de texto e sublinhado
// ANTES da hidratação, pra não piscar no recarregamento da página.

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Accessibility, Type, Underline, Zap, ZapOff, Hand, X, RotateCcw } from "lucide-react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { getConsentSnapshot, subscribeConsent } from "@/lib/consent";

const FONT_SCALE_KEY = "nexusfi-font-scale";
const UNDERLINE_KEY = "nexusfi-underline-links";
const VLIBRAS_KEY = "nexusfi-vlibras";

const FONT_MIN = 80;
const FONT_MAX = 150;
const FONT_STEP = 10;
const FONT_DEFAULT = 100;

function applyFontScale(scale: number) {
  document.documentElement.style.fontSize = `${scale}%`;
}

function applyUnderline(on: boolean) {
  if (on) document.documentElement.setAttribute("data-underline-links", "1");
  else document.documentElement.removeAttribute("data-underline-links");
}

// VLibras não tem uma API de "destruir" — uma vez injetado, mantemos o script
// carregado pelo resto da sessão e só escondemos/mostramos o contêiner que
// ele próprio gerencia (é onde a biblioteca desenha seu ícone e avatar).
function showVLibras() {
  const existing = document.querySelector<HTMLElement>("[vw]");
  if (existing) {
    existing.style.display = "";
    return;
  }
  const container = document.createElement("div");
  container.setAttribute("vw", "");
  container.className = "enabled";
  container.innerHTML =
    '<div vw-access-button class="active"></div>' +
    '<div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>';
  document.body.appendChild(container);

  const script = document.createElement("script");
  script.id = "vlibras-script";
  script.src = "https://vlibras.gov.br/app/vlibras-plugin.js";
  script.onload = () => {
    const w = window as typeof window & { VLibras?: { Widget: new (url: string) => unknown } };
    if (w.VLibras) new w.VLibras.Widget("https://vlibras.gov.br/app");
  };
  document.body.appendChild(script);
}

function hideVLibras() {
  const existing = document.querySelector<HTMLElement>("[vw]");
  if (existing) existing.style.display = "none";
}

function ToggleRow({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div className="a11y-widget-row">
      <span className="a11y-widget-row-label">
        <Icon size={15} aria-hidden="true" />
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={label}
        onClick={onClick}
        className="a11y-widget-switch"
        data-on={active || undefined}
      >
        <span className="a11y-widget-switch-thumb" />
      </button>
    </div>
  );
}

export function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [fontScale, setFontScale] = useState(FONT_DEFAULT);
  const [underline, setUnderline] = useState(false);
  const [vlibras, setVlibras] = useState(false);
  const { reduced, setReducedMotion } = useReducedMotion();

  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sabemos se o banner de cookies ainda está pedindo decisão (nesse caso ele
  // ocupa a faixa inferior da tela inteira) pra não desenhar o botão por cima.
  const consent = useSyncExternalStore(subscribeConsent, getConsentSnapshot, () => null);
  const cookieBarVisible = consent === null;

  // Restaura preferências salvas após montar (evita divergência de
  // hidratação — o script inline de layout.tsx já cobre o "flash" inicial).
  useEffect(() => {
    try {
      const savedScale = Number(localStorage.getItem(FONT_SCALE_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- corrige o default SSR-safe com o valor salvo, uma vez, após a hidratação
      if (savedScale >= FONT_MIN && savedScale <= FONT_MAX) setFontScale(savedScale);

      const savedUnderline = localStorage.getItem(UNDERLINE_KEY) === "1";
      if (savedUnderline) setUnderline(true);

      const savedVlibras = localStorage.getItem(VLIBRAS_KEY) === "1";
      if (savedVlibras) {
        setVlibras(true);
        showVLibras();
      }
    } catch {
      /* ambientes sem localStorage */
    }
  }, []);

  // Fecha ao clicar fora do botão/painel.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (btnRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Esc fecha e devolve o foco pro botão que abriu.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const changeFontScale = (next: number) => {
    const clamped = Math.min(FONT_MAX, Math.max(FONT_MIN, next));
    setFontScale(clamped);
    applyFontScale(clamped);
    try {
      localStorage.setItem(FONT_SCALE_KEY, String(clamped));
    } catch {
      /* noop */
    }
  };

  const toggleUnderline = () => {
    const next = !underline;
    setUnderline(next);
    applyUnderline(next);
    try {
      localStorage.setItem(UNDERLINE_KEY, next ? "1" : "0");
    } catch {
      /* noop */
    }
  };

  const toggleVlibras = () => {
    const next = !vlibras;
    setVlibras(next);
    if (next) showVLibras();
    else hideVLibras();
    try {
      localStorage.setItem(VLIBRAS_KEY, next ? "1" : "0");
    } catch {
      /* noop */
    }
  };

  const resetAll = () => {
    changeFontScale(FONT_DEFAULT);
    if (underline) toggleUnderline();
    if (reduced) setReducedMotion(false);
    if (vlibras) toggleVlibras();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Opções de acessibilidade"
        onClick={() => setOpen((v) => !v)}
        className="a11y-widget-btn"
        style={{ bottom: cookieBarVisible ? 88 : 20 }}
      >
        <Accessibility size={22} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Opções de acessibilidade"
          className="a11y-widget-panel"
          style={{ bottom: cookieBarVisible ? 136 : 68 }}
        >
          <div className="a11y-widget-header">
            <strong>Acessibilidade</strong>
            <button
              type="button"
              aria-label="Fechar opções de acessibilidade"
              onClick={() => {
                setOpen(false);
                btnRef.current?.focus();
              }}
              className="a11y-widget-close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="a11y-widget-row">
            <span className="a11y-widget-row-label">
              <Type size={15} aria-hidden="true" />
              Tamanho do texto
            </span>
            <div className="a11y-widget-steppers">
              <button
                type="button"
                aria-label="Diminuir tamanho do texto"
                onClick={() => changeFontScale(fontScale - FONT_STEP)}
                disabled={fontScale <= FONT_MIN}
              >
                A−
              </button>
              <button
                type="button"
                aria-label="Restaurar tamanho do texto padrão (100%)"
                onClick={() => changeFontScale(FONT_DEFAULT)}
                className="a11y-widget-stepper-value"
              >
                {fontScale}%
              </button>
              <button
                type="button"
                aria-label="Aumentar tamanho do texto"
                onClick={() => changeFontScale(fontScale + FONT_STEP)}
                disabled={fontScale >= FONT_MAX}
              >
                A+
              </button>
            </div>
          </div>

          <ToggleRow icon={Underline} label="Sublinhar links" active={underline} onClick={toggleUnderline} />
          <ToggleRow
            icon={reduced ? ZapOff : Zap}
            label="Reduzir animações"
            active={reduced}
            onClick={() => setReducedMotion(!reduced)}
          />
          <ToggleRow icon={Hand} label="Tradução em Libras" active={vlibras} onClick={toggleVlibras} />

          <button type="button" className="a11y-widget-reset" onClick={resetAll}>
            <RotateCcw size={13} aria-hidden="true" />
            Restaurar padrões
          </button>
        </div>
      )}
    </>
  );
}
