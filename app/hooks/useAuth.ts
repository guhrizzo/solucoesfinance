"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { useRouter, usePathname } from "@/i18n/navigation";

const PUBLIC_ROUTES = ["/", "/login", "/register"];

export function useAuth() {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      const { getFirebase } = await import("@/lib/firebase");
      const { auth } = await getFirebase();
      const { onAuthStateChanged } = await import("firebase/auth");

      unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);

        const isPublic = PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
        if (!u && !isPublic) {
          // Preserva a intenção de assinar (?plano= / ?checkout=) até o login.
          const q = new URLSearchParams(window.location.search);
          const plano = q.get("plano") || q.get("checkout");
          router.replace(plano ? `/login?plano=${encodeURIComponent(plano)}` : "/login");
        }
        if (u && (pathname === "/login" || pathname === "/register")) router.replace("/dashboard");
      });
    })();

    return () => unsub?.();
  }, [pathname, router]);

  return { user, loading };
}