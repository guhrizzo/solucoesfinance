"use client";

import { useTranslations } from "next-intl";
import { ArrowLeft, RotateCcw, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { LocaleSwitcher } from "@/app/components/LocaleSwitcher";

interface Props {
  /** 0..1 — progress(state) do motor. */
  value: number;
  canGoBack: boolean;
  onBack: () => void;
  canRestart: boolean;
  onRestart: () => void;
}

export function MidasHeader({ value, canGoBack, onBack, canRestart, onRestart }: Props) {
  const t = useTranslations("midas");
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);

  return (
    <header className="midas-header">
      <div className="midas-header__row">
        <button
          type="button"
          className="midas-iconbtn"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label={t("common.back")}
          title={t("common.back")}
        >
          <ArrowLeft size={17} aria-hidden="true" />
        </button>

        <span className="midas-avatar" aria-hidden="true">
          <Sparkles size={18} />
        </span>
        <div className="midas-header__titles">
          <p className="midas-header__title">{t("header.title")}</p>
          <p className="midas-header__subtitle">{t("header.subtitle")}</p>
        </div>

        <div className="midas-header__tools">
          <LocaleSwitcher className="midas-header__locale" />
          {canRestart && (
            <button
              type="button"
              className="midas-iconbtn"
              onClick={onRestart}
              aria-label={t("common.restart")}
              title={t("common.restart")}
            >
              <RotateCcw size={15} aria-hidden="true" />
            </button>
          )}
          <ThemeToggle className="midas-iconbtn" />
        </div>
      </div>

      <div
        className="midas-progress"
        role="progressbar"
        aria-label={t("common.progress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <span className="midas-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </header>
  );
}
