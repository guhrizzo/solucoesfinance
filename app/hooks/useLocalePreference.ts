"use client";

import { useCallback } from "react";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing, LOCALE_COOKIE, type AppLocale } from "@/i18n/routing";

// Troca de idioma. Fonte da verdade pro roteamento é o cookie NEXT_LOCALE
// (lido pelo proxy.ts); `router.replace(pathname, { locale })` reescreve a URL
// pro novo prefixo e o next-intl grava o cookie.
//
// Quando há usuário logado, o idioma também é persistido em
// `users/{authUid}/profile/settings.locale` (best-effort, não bloqueia a
// navegação) — assim a escolha acompanha a conta entre dispositivos. O
// caminho inverso (Firestore → cookie no bootstrap) é feito pelo
// <LocaleSync> montado no layout.

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

async function persistToFirestore(next: AppLocale) {
  try {
    const { getFirebase } = await import("@/lib/firebase");
    const { auth, db } = await getFirebase();
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const { doc, setDoc } = await import("firebase/firestore");
    await setDoc(
      doc(db, "users", uid, "profile", "settings"),
      { locale: next },
      { merge: true },
    );
  } catch {
    /* sem rede / não logado — o cookie já basta pra este dispositivo */
  }
}

export function useLocalePreference() {
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();

  const setLocale = useCallback(
    (next: AppLocale) => {
      if (next === locale) return;
      try {
        document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
      } catch {
        /* noop */
      }
      void persistToFirestore(next);
      router.replace(pathname, { locale: next });
    },
    [locale, pathname, router],
  );

  return { locale, locales: routing.locales, setLocale };
}
