"use client";

import { useEffect, useState } from "react";
import { hasPermission as hasPermissionOf, type AccountScope, type PermissionKey } from "@/lib/accountScope";

export type { AccountScope, PermissionKey };
export { hasPermissionOf as hasPermission };

interface ScopeState extends AccountScope {
  loading: boolean;
}

const INITIAL: ScopeState = { loading: true, uid: "", ownerUid: "", isOwner: true, permissions: "all" };

/**
 * Versão client, ao vivo, de `resolveAccountScope` — ouve tanto o login
 * quanto o próprio doc de permissão (`users/{uid}/profile/access`) via
 * `onSnapshot`, então uma mudança de permissão feita pelo dono reflete no
 * membro já logado sem precisar de reload. Usada pelo Navbar (filtrar menu)
 * e por `RequirePermission` (bloquear página).
 */
export function useAccountScope(): ScopeState {
  const [scope, setScope] = useState<ScopeState>(INITIAL);

  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    let unsubAccess: (() => void) | undefined;

    (async () => {
      try {
        const [{ getFirebase }, { onAuthStateChanged }, { doc, onSnapshot }] = await Promise.all([
          import("@/lib/firebase"),
          import("firebase/auth"),
          import("firebase/firestore"),
        ]);
        const { auth, db } = await getFirebase();

        unsubAuth = onAuthStateChanged(auth, (u) => {
          unsubAccess?.();
          if (!u) {
            setScope({ loading: false, uid: "", ownerUid: "", isOwner: true, permissions: "all" });
            return;
          }
          unsubAccess = onSnapshot(
            doc(db, "users", u.uid, "profile", "access"),
            (snap) => {
              if (!snap.exists()) {
                setScope({ loading: false, uid: u.uid, ownerUid: u.uid, isOwner: true, permissions: "all" });
                return;
              }
              const data = snap.data();
              const ownerUid = typeof data.ownerId === "string" && data.ownerId ? data.ownerId : u.uid;
              setScope({
                loading: false,
                uid: u.uid,
                ownerUid,
                isOwner: ownerUid === u.uid,
                permissions: Array.isArray(data.permissions) ? data.permissions : [],
              });
            },
            () => {
              // Sem permissão de leitura ou erro de rede — trata como membro
              // sem nenhuma categoria liberada (nunca abre em modo "dono" por
              // falha, isso vazaria dados de quem não devia).
              setScope({ loading: false, uid: u.uid, ownerUid: u.uid, isOwner: false, permissions: [] });
            }
          );
        });
      } catch {
        setScope({ loading: false, uid: "", ownerUid: "", isOwner: true, permissions: "all" });
      }
    })();

    return () => { unsubAuth?.(); unsubAccess?.(); };
  }, []);

  return scope;
}
