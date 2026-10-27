"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { PlayCircle, RotateCcw, BookOpen } from "lucide-react";
import type { TourStepDef } from "@/lib/tour/catalog";
import { StepIcon } from "./TourIllustration";
import "./tour.css";

interface Props {
  open: boolean;
  steps: TourStepDef[];
  /** Etapa que explica a página atual, se houver. */
  currentStep?: TourStepDef;
  /** Há um tour em andamento com etapa salva. */
  canResume: boolean;
  onClose: () => void;
  onPick: (id: string) => void;
  onRestart: () => void;
  onResume: () => void;
}

export function TourHelpMenu(p: Props) {
  const t = useTranslations("tour");
  const prevFocus = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (p.open) {
      prevFocus.current = document.activeElement as HTMLElement | null;
      menuRef.current?.querySelector<HTMLElement>("button")?.focus();
    } else if (wasOpen.current) {
      prevFocus.current?.focus?.();
    }
    wasOpen.current = p.open;
  }, [p.open]);

  useEffect(() => {
    if (!p.open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") p.onClose(); };
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!menuRef.current?.contains(n)) p.onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onDown); };
  }, [p.open, p]);

  return (
    <>
      {p.open && (
        <div ref={menuRef} className="nxt-menu" role="dialog" aria-label={t("ui.helpMenuTitle")}>
          <h2>{t("ui.helpMenuTitle")}</h2>
          {p.currentStep && (
            <button type="button" className="nxt-item nxt-item--hl" onClick={() => p.onPick(p.currentStep!.id)}>
              <BookOpen size={16} aria-hidden="true" />{t("ui.helpThisPage")}
            </button>
          )}
          {p.canResume && (
            <button type="button" className="nxt-item" onClick={p.onResume}><PlayCircle size={16} aria-hidden="true" />{t("ui.resume_tour")}</button>
          )}
          <button type="button" className="nxt-item" onClick={p.onRestart}><RotateCcw size={16} aria-hidden="true" />{t("ui.restartFull")}</button>
          <hr />
          <h2>{t("ui.helpChoose")}</h2>
          {p.steps.map((s) => (
            <button key={s.id} type="button" className="nxt-item" onClick={() => p.onPick(s.id)}>
              <StepIcon id={s.id} />{t(`steps.${s.id}.category`)}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
