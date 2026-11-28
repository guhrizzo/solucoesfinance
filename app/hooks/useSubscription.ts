"use client";

import { useEffect, useState } from "react";
import { resolveSubscriptionState, type BillingDoc, type SubscriptionState } from "@/lib/billing";
import { isCompedEmail, requiresSupremeAdminEmailVerification } from "@/lib/compAccounts";

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
  verificationRequired: boolean;
}

const INITIAL: State = {
  loading: true,
  isOwner: true,
  signedOut: false,
  verificationRequired: false,
  status: "trialing",
  isActive: true,
  accessUntil: 0,
  daysLeft: 0,
  plan: null,
  inTrial: true,
  comped: false,
  rhEnabled: false,
  autoRenews: false,
  cancelled: false,
  inGrace: false,
  cardTrialEligible: false,
};

export function useSubscription(): State {
  const [state, setState] = useState<State>(INITIAL);

  useEffect(() => {
    let unsubAuth: (() => void) | undefined;
    let unsubDoc: (() => void) | undefined;
    let cancelled = false;
    let authRevision = 0;

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
        if (cancelled) return;

        unsubAuth = onAuthStateChanged(auth, async (u) => {
          const revision = ++authRevision;
          const isCurrent = () => !cancelled && revision === authRevision;
          unsubDoc?.();
          unsubDoc = undefined;
          if (!u) {
            if (isCurrent()) setState({ ...INITIAL, loading: false, signedOut: true });
            return;
          }
          if (!isCurrent()) return;
          setState(INITIAL);

          if (requiresSupremeAdminEmailVerification(u.email) && !u.emailVerified) {
            // O link pode ter sido aberto em outra aba, com a sessão atual ainda desatualizada.
            await u.reload().catch(() => {});
            if (!isCurrent()) return;
            if (requiresSupremeAdminEmailVerification(u.email) && !u.emailVerified) {
              setState({ ...INITIAL, ...resolveSubscriptionState(null), loading: false, verificationRequired: true });
              return;
            }
            await u.getIdToken(true).catch(() => {});
            if (!isCurrent()) return;
          }

          // Conta cortesia (adm supremo): libera na hora, sem trial/paywall.
          // Não depende do doc de billing nem de ser dono ou membro.
          if (isCompedEmail(u.email, u.emailVerified)) {
            if (isCurrent()) {
              setState({
                ...resolveSubscriptionState({ comped: true }),
                loading: false,
                isOwner: true,
                signedOut: false,
                verificationRequired: false,
              });
            }
            return;
          }

          // 1. Bootstrap do trial + resolve ownerUid (a rota devolve isOwner).
          // A resposta já vem com o estado calculado (status/daysLeft/etc) —
          // usa direto aqui pra pintar o banner/paywall na hora, em vez de
          // esperar o onSnapshot do Firestore conectar (esse round-trip a
          // mais era o motivo de precisar dar F5 pra ver o aviso de trial
          // logo que entra: os dados já estavam prontos, só não eram usados).
          let ownerUid = u.uid;
          let isOwner = true;
          try {
            const res = await authedFetch("/api/billing/status");
            if (res.ok) {
              const d = await res.json();
              isOwner = !!d.isOwner;
              if (isCurrent()) {
                setState({
                  status: d.status,
                  isActive: d.isActive,
                  accessUntil: d.accessUntil,
                  daysLeft: d.daysLeft,
                  plan: d.plan,
                  inTrial: d.inTrial,
                  comped: !!d.comped,
                  rhEnabled: d.rhEnabled === true,
                  autoRenews: !!d.autoRenews,
                  cancelled: !!d.cancelled,
                  inGrace: !!d.inGrace,
                  cardTrialEligible: !!d.cardTrialEligible,
                  loading: false,
                  isOwner,
                  signedOut: false,
                  verificationRequired: false,
                });
              }
            }
          } catch {
            /* segue pro snapshot mesmo assim */
          }
          if (!isCurrent()) return;

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
          if (!isCurrent()) return;

          // 2. Escuta o doc de billing do dono, ao vivo.
          unsubDoc = onSnapshot(
            doc(db, "users", ownerUid, "profile", "billing"),
            (snap) => {
              if (!isCurrent()) return;
              const s = resolveSubscriptionState(snap.exists() ? (snap.data() as BillingDoc) : null);
              setState({ ...s, loading: false, isOwner, signedOut: false, verificationRequired: false });
            },
            () => {
              if (isCurrent()) setState((p) => ({ ...p, loading: false, isOwner, signedOut: false }));
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
