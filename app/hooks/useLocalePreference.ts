"use client";

import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing, type AppLocale } from "@/i18n/routing";

// Troca de idioma "deste dispositivo". A fonte da verdade pro roteamento é o
// cookie NEXT_LOCALE (lido pelo proxy.ts). Ao navegar com o router do wrapper
// passando { locale }, o next-intl reescreve a URL pro novo prefixo e grava o
// cookie.
//
// FASE 1: só cookie (por dispositivo). A persistência no doc do membro no
// Firestore (o idioma acompanha a conta entre dispositivos) entra na Fase 3,
// junto com a UI de "Idioma" em Configurações > Aparência — ver
// docs/superpowers/specs/2026-09-06-i18n-multi-idioma-plan.md.
//
// Nenhuma tela consome este hook ainda; é a base pros seletores de idioma das
// Fases 2 e 3.

export function useLocalePreference() {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();

  const setLocale = (next: AppLocale) => {
    if (next === locale) return;
    router.replace(pathname, { locale: next });
  };

  return { locale, locales: routing.locales, setLocale };
}
