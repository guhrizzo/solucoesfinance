"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Linha secundária opcional (ex.: explicação curta). */
  hint?: string;
}

interface SelectProps<T extends string = string> {
  value: T | "";
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  /** Texto quando nada está selecionado. */
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Fundo/borda do campo — por padrão usa os tokens --db-* da área logada. */
  style?: React.CSSProperties;
  id?: string;
  "aria-label"?: string;
}

/**
 * Seleção customizada (lista própria, não o <select> nativo do sistema).
 * Segue os tokens do tema claro/escuro, abre para cima quando falta espaço
 * embaixo e tem teclado completo: ↑ ↓ Home End Enter Espaço Esc e digitar a
 * inicial para pular para a opção.
 */
export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Selecione…",
  disabled,
  invalid,
  style,
  id,
  "aria-label": ariaLabel,
}: SelectProps<T>) {
  const uid = useId();
  const listId = `${uid}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [active, setActive] = useState(-1);

  const selectedIdx = options.findIndex((o) => o.value === value);
  const selected = selectedIdx >= 0 ? options[selectedIdx] : null;

  const openList = () => {
    if (disabled) return;
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const need = Math.min(options.length * 44 + 12, 280);
      setDropUp(window.innerHeight - rect.bottom < need && rect.top > need);
    }
    setActive(selectedIdx >= 0 ? selectedIdx : 0);
    setOpen(true);
  };

  const close = () => setOpen(false);

  const choose = (idx: number) => {
    const opt = options[idx];
    if (!opt) return;
    onChange(opt.value);
    close();
  };

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  // Mantém a opção ativa visível ao navegar pelo teclado.
  useEffect(() => {
    if (!open || active < 0) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((i) => Math.min(options.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
        break;
      case "Home":
        e.preventDefault();
        setActive(0);
        break;
      case "End":
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        choose(active);
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
      case "Tab":
        close();
        break;
      default:
        if (e.key.length === 1) {
          const k = e.key.toLowerCase();
          const start = active + 1;
          const order = [...options.keys()];
          const idx = [...order.slice(start), ...order.slice(0, start)].find((i) =>
            options[i].label.toLowerCase().startsWith(k)
          );
          if (idx !== undefined) setActive(idx);
        }
    }
  };

  const borderColor = invalid
    ? "var(--danger)"
    : open
      ? "var(--brand-500)"
      : "var(--db-border)";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none flex items-center justify-between gap-2 text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        style={{
          background: "var(--db-card-alt)",
          border: `1px solid ${borderColor}`,
          boxShadow: open ? "0 0 0 3px color-mix(in srgb, var(--brand-500) 22%, transparent)" : undefined,
          color: selected ? "var(--db-text)" : "var(--db-text-3)",
          ...style,
        }}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          style={{
            flexShrink: 0,
            color: "var(--db-text-3)",
            transition: "transform 160ms ease",
            transform: open ? "rotate(180deg)" : "none",
          }}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-40 overflow-y-auto rounded-xl p-1.5"
          style={{
            [dropUp ? "bottom" : "top"]: "calc(100% + 6px)",
            maxHeight: 280,
            background: "var(--db-card)",
            border: "1px solid var(--db-border)",
            boxShadow: "var(--db-shadow-lg)",
          }}
        >
          {options.map((o, i) => {
            const isSel = o.value === value;
            const isActive = i === active;
            return (
              // Teclado tratado no combobox (onKeyDown do botão); o foco fica nele.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={o.value}
                role="option"
                aria-selected={isSel}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(i)}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm cursor-pointer"
                style={{
                  background: isActive
                    ? "color-mix(in srgb, var(--brand-500) 14%, transparent)"
                    : "transparent",
                  color: isSel ? "var(--brand-500)" : "var(--db-text)",
                  fontWeight: isSel ? 600 : 500,
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.hint && (
                    <span className="block text-xs font-normal" style={{ color: "var(--db-text-3)" }}>
                      {o.hint}
                    </span>
                  )}
                </span>
                {isSel && <Check size={15} aria-hidden="true" style={{ flexShrink: 0 }} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
