"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Modal } from "./ui";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

interface Props {
  open: boolean;
  onClose: () => void;
  /** Mês selecionado hoje (usa só ano/mês). */
  value: Date;
  /** Chamado com o primeiro dia do mês escolhido. */
  onSelect: (d: Date) => void;
}

/** Modal pra pular pra qualquer mês — stepper de ano + grade de 12 meses.
 *  Ligado ao mês global via a prop onSelect (ver app/hooks/usePeriod.tsx). */
export function MonthPickerModal({ open, onClose, value, onSelect }: Props) {
  const [year, setYear] = useState(value.getFullYear());

  // Ao abrir, parte sempre do ano do mês atualmente selecionado.
  useEffect(() => {
    if (open) setYear(value.getFullYear());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const now = new Date();
  const selMonth = value.getMonth();
  const selYear = value.getFullYear();

  const pick = (m: number) => {
    onSelect(new Date(year, m, 1));
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Escolher mês" size="sm">
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button" onClick={() => setYear(y => y - 1)} aria-label="Ano anterior"
            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
            style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="font-bold text-base" style={{ color: "var(--cf-text)" }}>{year}</span>
          <button
            type="button" onClick={() => setYear(y => y + 1)} aria-label="Próximo ano"
            className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer"
            style={{ background: "var(--cf-input)", color: "var(--cf-text-2)" }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {MESES.map((label, m) => {
            const isSelected = m === selMonth && year === selYear;
            const isCurrent = m === now.getMonth() && year === now.getFullYear();
            return (
              <button
                key={label}
                type="button"
                onClick={() => pick(m)}
                className="py-2.5 rounded-lg text-sm font-semibold cursor-pointer transition-colors"
                style={isSelected
                  ? { background: "var(--primary)", color: "var(--brand-on)" }
                  : { background: "var(--cf-input)", color: "var(--cf-text)", border: isCurrent ? "1px solid var(--primary)" : "1px solid transparent" }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => { onSelect(new Date(now.getFullYear(), now.getMonth(), 1)); onClose(); }}
          className="w-full py-2 rounded-lg text-xs font-bold cursor-pointer"
          style={{ background: "var(--cf-input)", color: "var(--primary)" }}
        >
          Mês atual
        </button>
      </div>
    </Modal>
  );
}
