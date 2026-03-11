"use client";

// hooks/useAuth.ts
import { useEffect, useState } from "react";
import type { User }           from "firebase/auth";
import { useRouter, usePathname } from "next/navigation";

const PUBLIC_ROUTES = ["/", "/login", "/register"];

export function useAuth() {
  const router   = useRouter();
  const pathname = usePathname();

  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    // Tudo importado dinamicamente — nunca roda no servidor
    import("../lib/firebase").then(({ getFirebase }) =>
      getFirebase().then(({ auth }) => {
        import("firebase/auth").then(({ onAuthStateChanged }) => {
          unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
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
        });
      })
    );

    return () => unsubscribe?.();
  }, [pathname, router]);

  return { user, loading };
}