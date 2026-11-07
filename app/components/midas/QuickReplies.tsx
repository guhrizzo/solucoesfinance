"use client";

import { useTranslations } from "next-intl";

export interface Chip {
  id: string;
  label: string;
}

interface Props {
  chips: Chip[];
  disabled: boolean;
  onPick: (chip: Chip) => void;
}

export function QuickReplies({ chips, disabled, onPick }: Props) {
  const t = useTranslations("midas.common");
  if (!chips.length) return null;
  return (
    <div className="midas-replies">
      <p className="midas-replies__caption" id="midas-replies-caption">
        {t("chipsCaption")}
      </p>
      <div className="midas-replies__list" role="group" aria-labelledby="midas-replies-caption">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            className="midas-chip"
            disabled={disabled}
            onClick={() => onPick(c)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
