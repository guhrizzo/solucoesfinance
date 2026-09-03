"use client";

import { useEffect, useState } from "react";
import { resolveSubscriptionState, type SubscriptionState } from "@/lib/billing";
import { isCompedEmail } from "@/lib/compAccounts";

// Estado ao vivo da assinatura da CONTA (o dono — membros herdam).
//
// - Chama GET /api/billing/status uma vez pra garantir o bootstrap do trial
//   (o client não pode escrever `profile/billing`).
// - Depois escuta `users/{ownerUid}/profile/billing` via onSnapshot, então
//   quando o webhook confirma o pagamento a UI destrava sozinha.

interface State extends SubscriptionState {
  loading: boolean;
  isOwner: boolean;
  /** true quando não há usuário logado (o gate deixa passar; useAuth redireciona). */
  signedOut: boolean;
}

const INITIAL: State = {
  loading: true,
  isOwner: true,
  signedOut: false,
  status: "trialing",
  isActive: true,
  accessUntil: 0,
  daysLeft: 0,
  plan: null,
  inTrial: true,
  comped: false,
};

export function useSubscription(): State {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    let unsubDoc: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const [{ getFirebase }, { onAuthStateChanged }, { doc, onSnapshot }, { authedFetch }] =
          await Promise.all([
            import("@/lib/firebase"),
            import("firebase/auth"),
            import("firebase/firestore"),
            import("@/lib/authedFetch"),
          ]);
        const { auth, db } = await getFirebase();

        unsubAuth = onAuthStateChanged(auth, async (u) => {
          unsubDoc?.();
          if (!u) {
            if (!cancelled) setState({ ...INITIAL, loading: false, signedOut: true });
            return;
          }

          // Conta cortesia (adm supremo): libera na hora, sem trial/paywall.
          // Não depende do doc de billing nem de ser dono ou membro.
          if (isCompedEmail(u.email)) {
            if (!cancelled) {
              setState({
                ...resolveSubscriptionState({ comped: true }),
                loading: false,
                isOwner: true,
                signedOut: false,
              });
            }
            return;
          }

          // 1. Bootstrap do trial + resolve ownerUid (a rota devolve isOwner).
          let ownerUid = u.uid;
          let isOwner = true;
          try {
            const res = await authedFetch("/api/billing/status");
            if (res.ok) {
              const d = await res.json();
              isOwner = !!d.isOwner;
            }
          } catch {
            /* segue pro snapshot mesmo assim */
          }

          // Descobre o ownerUid pra escutar o doc certo.
          try {
            const accessSnap = await (await import("firebase/firestore")).getDoc(
              doc(db, "users", u.uid, "profile", "access")
            );
            if (accessSnap.exists()) {
              const data = accessSnap.data();
              if (typeof data.ownerId === "string" && data.ownerId) {
                ownerUid = data.ownerId;
                isOwner = false;
              }
            }
          } catch {
            /* trata como dono */
          }

          // 2. Escuta o doc de billing do dono, ao vivo.
          unsubDoc = onSnapshot(
            doc(db, "users", ownerUid, "profile", "billing"),
            (snap) => {
              if (cancelled) return;
              const s = resolveSubscriptionState(snap.exists() ? (snap.data() as any) : null);
              setState({ ...s, loading: false, isOwner, signedOut: false });
            },
            () => {
              if (!cancelled) setState((p) => ({ ...p, loading: false, isOwner, signedOut: false }));
            }
          );
        });
      } catch {
        if (!cancelled) setState((p) => ({ ...p, loading: false }));
      }
    })();

    return () => {
      cancelled = true;
      unsubAuth?.();
      unsubDoc?.();
    };
  }, []);

  return state;
}
