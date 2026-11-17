"use client";

// Boletos do Banco Inter da conta (users/{ownerUid}/boletos) em tempo real e o
// estado da cobrança (profile/interStatus). Só o servidor escreve nestes
// documentos; aqui é leitura. Só assina para contas Pro (`enabled`).

import { useEffect, useState } from "react";
import type { BoletoDoc } from "@/lib/interBoletoRegras";
import { boletosEstado, type BoletosEstado } from "@/lib/interBoletosEstado";
import type { InterStatus } from "@/lib/interTypes";

export type UseBoletos = {
  boletos: BoletoDoc[];
  loading: boolean;
  error?: string;
};

export function useBoletos(ownerUid: string | null, enabled = true): UseBoletos {
  const [state, setState] = useState<UseBoletos>({ boletos: [], loading: true });

  useEffect(() => {
    if (!enabled || !ownerUid) {
      setState({ boletos: [], loading: false });
      return;
    }
    let cancelled = false;
    let unsub: (() => void) | undefined;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    (async () => {
      try {
        const [{ getFirebase }, { collection, query, orderBy, onSnapshot }] = await Promise.all([
          import("@/lib/firebase"),
          import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();
        if (cancelled) return;
        unsub = onSnapshot(
          query(collection(db, "users", ownerUid, "boletos"), orderBy("createdAt", "desc")),
          (snap) => {
            if (cancelled) return;
            setState({
              boletos: snap.docs.map((d) => ({ ...(d.data() as BoletoDoc), id: d.id })),
              loading: false,
            });
          },
          (err) => {
            if (cancelled) return;
            setState({ boletos: [], loading: false, error: err.code || err.message });
          },
        );
      } catch (e) {
        if (!cancelled) setState({ boletos: [], loading: false, error: (e as Error)?.message || "erro" });
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [ownerUid, enabled]);

  return state;
}

/** Estado da cobrança por boleto no Inter para esta conta (null enquanto carrega). */
export function useBoletosEstado(ownerUid: string | null, enabled = true): BoletosEstado | null {
  const [estado, setEstado] = useState<BoletosEstado | null>(null);

  useEffect(() => {
    if (!enabled || !ownerUid) {
      setEstado(null);
      return;
    }
    let cancelled = false;
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const [{ getFirebase }, { doc, onSnapshot }] = await Promise.all([
          import("@/lib/firebase"),
          import("firebase/firestore"),
        ]);
        const { db } = await getFirebase();
        if (cancelled) return;
        unsub = onSnapshot(
          doc(db, "users", ownerUid, "profile", "interStatus"),
          (s) => !cancelled && setEstado(boletosEstado(s.exists() ? (s.data() as InterStatus) : null)),
          () => !cancelled && setEstado("indisponivel"),
        );
      } catch {
        if (!cancelled) setEstado("indisponivel");
      }
    })();
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [ownerUid, enabled]);

  return estado;
}
