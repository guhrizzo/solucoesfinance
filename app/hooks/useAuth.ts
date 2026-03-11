"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useRouter, usePathname } from "next/navigation";

// Rotas que NÃO precisam de autenticação
const PUBLIC_ROUTES = ["/", "/login", "/register"];

export function useAuth() {
  const router   = useRouter();
  const pathname = usePathname();
  const [user, setUser]       = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);

      const isPublic = PUBLIC_ROUTES.includes(pathname);

      if (!firebaseUser && !isPublic) {
        // Não autenticado tentando acessar rota protegida → redireciona
        router.replace("/login");
      }

      if (firebaseUser && (pathname === "/login" || pathname === "/register")) {
        // Já autenticado tentando acessar login → vai pro dashboard
        router.replace("/dashboard");
      }
    });

    return () => unsub();
  }, [pathname, router]);

  return { user, loading };
}