"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/app/hooks/useTheme";

// true só no client — evita divergência de hidratação (o servidor não sabe o
// tema salvo). Mesmo padrão de useMounted da landing.
const emptySubscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}

/**
 * Botão sol/lua para a parte pública (landing, login, cadastro, footer, páginas
 * legais). O tema em si já é aplicado antes da hidratação pelo script inline em
 * app/[locale]/layout.tsx; aqui só expomos o controle de troca.
 *
 * `className` controla cor/tamanho do container — o ícone herda `currentColor`.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { dark, toggle } = useTheme();
  const mounted = useMounted();
  const t = useTranslations("common.theme");

  // Antes de montar, renderiza a lua (estado "claro", igual ao SSR) para não
  // piscar; depois de montar reflete o tema real.
  const isDark = mounted && dark;
  const label = isDark ? t("light") : t("dark");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={t("toggle")}
      className={`inline-flex items-center justify-center rounded-full transition-colors cursor-pointer ${className}`}
    >
      {isDark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
    </button>
  );
}
