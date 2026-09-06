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
import { useAccessibilityWidget } from "../hooks/useAccessibilityWidget";
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

// VLibras não tem uma API de "destruir". A versão atual do plugin
// (vlibras-plugin.js, v7.x) injeta o botão flutuante dentro de um
// Shadow DOM, então NÃO adianta mirar os IDs internos
// (#vlibras-access / #vlibras-button / #vlibras-popup) a partir de um
// <style> global — o shadow boundary bloqueia esses seletores. Os únicos
// elementos que ficam no light DOM (e portanto atingíveis) são:
//   #vlibras-access-wrapper  — host do Shadow DOM = o botão flutuante
//   #vlibras-app-root        — painel do avatar quando aberto
// Também mantemos os seletores legados ([vw]*, #vlibras-access) por
// segurança, caso o usuário esteja numa versão antiga do plugin.
const VLIBRAS_HIDE_STYLE_ID = "vlibras-hide-style";

function showVLibras() {
  // Remove a regra de ocultação para revelar elementos existentes
  document.getElementById(VLIBRAS_HIDE_STYLE_ID)?.remove();

  // Se o script já foi injetado e o widget já existe, não faz nada
  // (evita empilhar vários hosts a cada vez que o usuário liga/desliga).
  if (document.getElementById("vlibras-access-wrapper")) return;

  // Remove container legado [vw] se existir de tentativas anteriores
  document.querySelector("[vw]")?.remove();

  // O plugin do governo não exige container HTML — o próprio script
  // injeta #vlibras-access diretamente no body ao inicializar.
  // Se o script já foi carregado (sessão anterior), chama o Widget novamente.
  const w = window as typeof window & { VLibras?: { Widget: new (url: string) => unknown } };
  if (w.VLibras) {
    new w.VLibras.Widget("https://vlibras.gov.br/app");
    return;
  }

  const script = document.createElement("script");
  script.id = "vlibras-script";
  script.src = "https://vlibras.gov.br/app/vlibras-plugin.js";
  script.onload = () => {
    const w2 = window as typeof window & { VLibras?: { Widget: new (url: string) => unknown } };
    if (w2.VLibras) new w2.VLibras.Widget("https://vlibras.gov.br/app");
  };
  document.body.appendChild(script);
}

function hideVLibras() {
  // Injeta uma <style> com os IDs reais que o VLibras cria, mais iframe
  // para cobrir o painel do avatar quando aberto.
  if (!document.getElementById(VLIBRAS_HIDE_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = VLIBRAS_HIDE_STYLE_ID;
    style.textContent = [
      // v7.x — elementos reais no light DOM
      "#vlibras-access-wrapper,",
      "#vlibras-app-root,",
      // legado / versões antigas do plugin
      "#vlibras-access,",
      "#vlibras-button,",
      "#vlibras-popup,",
      "iframe[src*='vlibras.gov.br'],",
      "[vw], [vw-access-button], [vw-plugin-wrapper]",
      "{ display: none !important; }",
    ].join(" ");
    document.head.appendChild(style);
  }
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
  const { enabled } = useAccessibilityWidget();

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

  // Se o usuário desliga o widget em Configurações com o Libras ativo, o botão
  // do VLibras (injetado no body, fora do React) ficaria órfão — some junto.
  // Ao religar, ele volta se a preferência de Libras continuava marcada.
  useEffect(() => {
    if (!vlibras) return;
    if (enabled) showVLibras();
    else hideVLibras();
  }, [enabled, vlibras]);

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

  // Desligado em Configurações > Aparência. O globals.css já esconde na
  // hidratação (data-a11y-widget="off"); aqui evitamos rodar o resto.
  if (!enabled) return null;

  // O plugin do VLibras injeta o próprio botão no mesmo canto inferior
  // direito — quando o Libras está ligado, subimos o widget pra não cobrir.
  const vlibrasGap = vlibras ? 64 : 0;

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
        style={{ bottom: (cookieBarVisible ? 88 : 20) + vlibrasGap }}
      >
        <Accessibility size={22} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Opções de acessibilidade"
          className="a11y-widget-panel"
          style={{ bottom: (cookieBarVisible ? 136 : 68) + vlibrasGap }}
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
