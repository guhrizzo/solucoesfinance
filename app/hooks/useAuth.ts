"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { useRouter, usePathname } from "next/navigation";

const PUBLIC_ROUTES = ["/", "/login", "/register"];

export function useAuth() {
  const router   = useRouter();
  const pathname = usePathname();

  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      const { getFirebase }        = await import("../lib/firebase");
      const { auth }               = await getFirebase();
      const { onAuthStateChanged } = await import("firebase/auth");

      unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        setLoading(false);

        const isPublic = PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
        if (!u && !isPublic) router.replace("/login");
        if (u && (pathname === "/login" || pathname === "/register")) router.replace("/dashboard");
      });
    })();

    return () => unsub?.();
  }, [pathname, router]);

  return { user, loading };
}