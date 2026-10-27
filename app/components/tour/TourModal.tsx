"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import {
  X, ChevronLeft, ChevronRight, Sparkles, PartyPopper,
  ExternalLink, ListChecks, Check,
} from "lucide-react";
import type { TourStepDef } from "@/lib/tour/catalog";
import { TourIllustration, StepIcon } from "./TourIllustration";
import { TourSpotlight, type SpotRect } from "./TourSpotlight";
import "./tour.css";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

interface FrameProps {
  label: string;
  rect: SpotRect | null;
  align: "center" | "top";
  small?: boolean;
  onEscape: () => void;
  children: React.ReactNode;
}

/** Moldura comum: portal, camadas de fundo, role=dialog, foco preso e Esc. */
function Frame({ label, rect, align, small, onEscape, children }: FrameProps) {
  const ref = useRef<HTMLDivElement>(null);
  const escRef = useRef(onEscape);
  useEffect(() => {
    escRef.current = onEscape;
  });

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const root = document.getElementById("conteudo-principal");
    root?.setAttribute("inert", "");
    document.body.classList.add("modal-open");
    ref.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        escRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return e.preventDefault();
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      else if (!ref.current.contains(active)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      root?.removeAttribute("inert");
      document.body.classList.remove("modal-open");
      prev?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="nxt-layer">
      <TourSpotlight rect={rect} />
      <div className="nxt-wrap" data-align={align}>
        <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className={`nxt-card${small ? " nxt-card--sm" : ""}`}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ───────── Boas-vindas ───────── */
export function WelcomeDialog({ onStart, onExplore }: { onStart: () => void; onExplore: () => void }) {
  const t = useTranslations("tour");
  const id = useId();
  return (
    <Frame label={t("welcome.title")} rect={null} align="center" small onEscape={onExplore}>
      <div className="nxt-center">
        <div className="nxt-big"><Sparkles size={32} aria-hidden="true" /></div>
        <h2 id={id} className="nxt-title" style={{ marginTop: 0 }}>{t("welcome.title")}</h2>
        <p className="nxt-text">{t("welcome.body")}</p>
      </div>
      <div className="nxt-stack">
        <button type="button" className="nxt-btn nxt-btn--primary" onClick={onStart}>{t("welcome.start")}</button>
        <button type="button" className="nxt-btn" onClick={onExplore}>{t("welcome.explore")}</button>
        <p className="nxt-text" style={{ textAlign: "center", fontSize: 12 }}>{t("welcome.hint")}</p>
      </div>
    </Frame>
  );
}

/* ───────── Conclusão ───────── */
const CONFETTI = ["var(--brand)", "var(--pos)", "var(--warn)", "var(--neg)"];
export function CompletionDialog({ onDone, onRestart }: { onDone: () => void; onRestart: () => void }) {
  const t = useTranslations("tour");
  return (
    <Frame label={t("completion.title")} rect={null} align="center" small onEscape={onDone}>
      <div className="nxt-confetti" aria-hidden="true">
        {Array.from({ length: 18 }, (_, i) => (
          <i key={i} style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % 4], animationDelay: `${(i % 6) * 0.12}s` }} />
        ))}
      </div>
      <div className="nxt-center">
        <div className="nxt-big"><PartyPopper size={32} aria-hidden="true" /></div>
        <h2 className="nxt-title" style={{ marginTop: 0 }}>{t("completion.title")}</h2>
        <p className="nxt-text">{t("completion.body")}</p>
      </div>
      <div className="nxt-stack">
        <button type="button" className="nxt-btn nxt-btn--primary" onClick={onDone}><Check size={16} aria-hidden="true" />{t("completion.done")}</button>
        <button type="button" className="nxt-btn" onClick={onRestart}>{t("completion.restart")}</button>
      </div>
    </Frame>
  );
}

/* ───────── Etapa ───────── */
interface StepDialogProps {
  step: TourStepDef;
  mode: "tour" | "single";
  index: number;
  total: number;
  rect: SpotRect | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onEnd: () => void;
  onMenu: () => void;
  onOpenPage?: () => void;
}

export function StepDialog(p: StepDialogProps) {
  const t = useTranslations("tour");
  const { step } = p;
  const base = `steps.${step.id}`;
  const last = p.index === p.total - 1;
  const pct = Math.round(((p.index + 1) / p.total) * 100);
  const align = p.rect && p.rect.top > window.innerHeight / 2 ? "top" : "center";

  return (
    <Frame label={t("ui.dialogLabel")} rect={p.rect} align={align} onEscape={p.onEnd}>
      <div className="nxt-head">
        <div className="nxt-headrow">
          <span className="nxt-chip"><StepIcon id={step.id} size={14} />{t(`${base}.category`)}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {p.mode === "tour" && <span className="nxt-step">{t("ui.stepOf", { current: p.index + 1, total: p.total })}</span>}
            <button type="button" className="nxt-iconbtn" onClick={p.onEnd} aria-label={t("ui.close")}><X size={16} aria-hidden="true" /></button>
          </span>
        </div>
        {p.mode === "tour" && (
          <div className="nxt-progress" role="progressbar" aria-label={t("ui.progress")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <span style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      <div className="nxt-body">
        {/* key = recria o bloco a cada etapa e dispara a animação de entrada */}
        <div key={step.id} className="nxt-content">
          <TourIllustration stepId={step.id} animation={step.animation} />
          <h2 className="nxt-title" aria-live="polite">{t(`${base}.title`)}</h2>
          <p className="nxt-text" style={{ color: "var(--text)" }}>{t(`${base}.description`)}</p>
          <div className="nxt-sec"><h3>{t("ui.purpose")}</h3><p>{t(`${base}.purpose`)}</p></div>
          <div className="nxt-sec"><h3>{t("ui.example")}</h3><p className="nxt-example">{t(`${base}.example`)}</p></div>
          <div className="nxt-sec"><h3>{t("ui.benefit")}</h3><p className="nxt-benefit">{t(`${base}.benefit`)}</p></div>
        </div>
      </div>

      <div className="nxt-foot">
        {p.mode === "tour" ? (
          <>
            <button type="button" className="nxt-btn" onClick={p.onBack} disabled={p.index === 0}>
              <ChevronLeft size={16} aria-hidden="true" />{t("ui.back")}
            </button>
            <button type="button" className="nxt-btn nxt-btn--primary" onClick={p.onNext}>
              {last ? t("ui.finish") : t("ui.next")}{last ? <Check size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
            </button>
            <span className="nxt-spacer" />
            <button type="button" className="nxt-link" onClick={p.onSkip}>{t("ui.skip")}</button>
            <button type="button" className="nxt-link" onClick={p.onEnd}>{t("ui.endTour")}</button>
          </>
        ) : (
          <>
            <button type="button" className="nxt-btn" onClick={p.onMenu}><ListChecks size={16} aria-hidden="true" />{t("ui.otherCategories")}</button>
            {p.onOpenPage && (
              <button type="button" className="nxt-btn" onClick={p.onOpenPage}><ExternalLink size={16} aria-hidden="true" />{t("ui.openPage")}</button>
            )}
            <span className="nxt-spacer" />
            <button type="button" className="nxt-btn nxt-btn--primary" onClick={p.onEnd}>{t("ui.close")}</button>
          </>
        )}
      </div>
    </Frame>
  );
}
