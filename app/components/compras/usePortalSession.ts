"use client";

// Sessão do portal do fornecedor: login do Firebase Auth + /api/compras/portal/me
// (vínculos ativos com empresas, e-mail verificado). Sem login → manda pro
// /fornecedor/entrar. Nada aqui lê o Firestore direto (as rules negam).

import { useCallback, useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { useRouter } from "@/i18n/navigation";
import { ComprasApiError, getPortalLink, portalApi, setPortalLink } from "./api";

export interface PortalLinkInfo { key: string; companyName: string; supplierName: string }
export interface PortalSupplier {
  id: string; razaoSocial: string; nomeFantasia: string; cnpj: string; ie: string; responsavel: string; email: string;
  telefone: string; whatsapp: string; categoria: string; status: string;
  endereco: { logradouro: string; numero: string; complemento: string; bairro: string; cep: string; cidade: string; uf: string };
}
interface MeResponse {
  emailVerified: boolean; email: string; links: PortalLinkInfo[]; current?: string | null; supplier?: PortalSupplier | null;
}

export type PortalState = "loading" | "unverified" | "noAccess" | "ready" | "error";

export function usePortalSession() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<PortalState>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await portalApi<MeResponse>("/me");
      setMe(r);
      if (!r.emailVerified) { setState("unverified"); return; }
      if (!r.links.length || !r.current) { setState("noAccess"); return; }
      if (r.current !== getPortalLink()) setPortalLink(r.current);
      setState("ready");
    } catch (err) {
      if (err instanceof ComprasApiError && err.code === "auth") { router.replace("/fornecedor/entrar"); return; }
      setError((err as Error).message);
      setState("error");
    }
  }, [router]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const [{ getFirebase }, { onAuthStateChanged }] = await Promise.all([import("@/lib/firebase"), import("firebase/auth")]);
      const { auth } = await getFirebase();
      unsub = onAuthStateChanged(auth, (u) => {
        setUser(u);
        if (!u) { router.replace("/fornecedor/entrar"); return; }
        load();
      });
    })();
    return () => unsub?.();
  }, [load, router]);

  /** Depois de confirmar o e-mail: renova o token (claim email_verified) e recarrega. */
  const refreshVerification = useCallback(async () => {
    const { getFirebase } = await import("@/lib/firebase");
    const { auth } = await getFirebase();
    await auth.currentUser?.reload();
    await auth.currentUser?.getIdToken(true);
    setState("loading");
    await load();
  }, [load]);

  const switchCompany = useCallback(async (key: string) => {
    setPortalLink(key);
    setState("loading");
    await load();
  }, [load]);

  const logout = useCallback(async () => {
    const [{ getFirebase }, { signOut }] = await Promise.all([import("@/lib/firebase"), import("firebase/auth")]);
    const { auth } = await getFirebase();
    await signOut(auth);
    router.replace("/fornecedor/entrar");
  }, [router]);

  const company = me?.links.find((l) => l.key === me.current)?.companyName ?? "";
  return { user, state, me, error, company, reload: load, refreshVerification, switchCompany, logout };
}
