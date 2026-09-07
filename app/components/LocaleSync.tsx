"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { useRouter, usePathname } from "@/i18n/navigation";
import { routing, LOCALE_COOKIE, type AppLocale } from "@/i18n/routing";

// Sincroniza Firestore → cookie no bootstrap de autenticação: se o doc do
// usuário (`users/{uid}/profile/settings.locale`) tem um idioma diferente do
// que está ativo neste dispositivo, aplica o do Firestore (a escolha
// acompanha a conta entre dispositivos). O caminho inverso — gravar no
// Firestore ao trocar — está em useLocalePreference.
//
// Montado uma vez no app/[locale]/layout.tsx. Em páginas públicas (sem
// usuário) não faz nada.

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function LocaleSync() {
  const activeLocale = useLocale() as AppLocale;
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const { getFirebase } = await import("@/lib/firebase");
        const { auth, db } = await getFirebase();
        const { onAuthStateChanged } = await import("firebase/auth");
        if (cancelled) return;

        unsub = onAuthStateChanged(auth, async (u) => {
          if (!u || cancelled) return;
          try {
            const { doc, getDoc } = await import("firebase/firestore");
            const snap = await getDoc(doc(db, "users", u.uid, "profile", "settings"));
            const saved = snap.exists()
              ? (snap.data()?.locale as string | undefined)
              : undefined;
            if (
              saved &&
              (routing.locales as readonly string[]).includes(saved) &&
              saved !== activeLocale
            ) {
              document.cookie = `${LOCALE_COOKIE}=${saved}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
              router.replace(pathname, { locale: saved as AppLocale });
            }
          } catch {
            /* offline / regra negou — mantém o idioma do dispositivo */
          }
        });
      } catch {
        /* firebase não carregou */
      }
    })();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [activeLocale, router, pathname]);

  return null;
}
