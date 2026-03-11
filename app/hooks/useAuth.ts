"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { useRouter, usePathname } from "next/navigation";

// Rotas públicas — não precisam de autenticação
const PUBLIC_ROUTES = ["/", "/login", "/register"];

export function useAuth() {
  const router   = useRouter();
  const pathname = usePathname();

  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Importa auth dinamicamente para garantir que só rode no browser
    import("../lib/firebase").then(({ auth }) => {
      const unsub = onAuthStateChanged(auth, (firebaseUser) => {
        setUser(firebaseUser);
        setLoading(false);

        const isPublic = PUBLIC_ROUTES.some((r) => pathname.startsWith(r));

        if (!firebaseUser && !isPublic) {
          router.replace("/login");
        }

        if (firebaseUser && (pathname === "/login" || pathname === "/register")) {
          router.replace("/dashboard");
        }
      });

      return () => unsub();
    });
  }, [pathname, router]);

  return { user, loading };
}