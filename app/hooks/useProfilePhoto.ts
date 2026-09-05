"use client";

// app/hooks/useProfilePhoto.ts
//
// Store compartilhado (padrão useSyncExternalStore, como app/lib/consent.ts) do
// avatar do usuário logado. Qualquer componente — cabeçalho da /users, avatar
// da Navbar, cabeçalho de Configurações — lê daqui sem precisar receber prop.
//
// updateProfile() NÃO dispara onAuthStateChanged, então quem envia/remove a
// foto chama refresh() logo depois pra recalcular o snapshot.

import { useCallback, useSyncExternalStore } from "react";
import type { Auth, User } from "firebase/auth";
import { hasCustomPhoto, resolveAvatar } from "@/lib/profilePhoto";

interface Snapshot {
  src: string | null;
  initial: string;
  /** há foto enviada pelo próprio usuário (controla o "Remover foto") */
  custom: boolean;
  loading: boolean;
}

const SERVER_SNAPSHOT: Snapshot = { src: null, initial: "U", custom: false, loading: true };

let snapshot: Snapshot = SERVER_SNAPSHOT;
let authRef: Auth | null = null;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function applyUser(user: User | null) {
  const { src, initial } = resolveAvatar(user);
  const next: Snapshot = {
    src,
    initial,
    custom: user ? hasCustomPhoto(user) : false,
    loading: false,
  };
  if (
    next.src === snapshot.src &&
    next.initial === snapshot.initial &&
    next.custom === snapshot.custom &&
    next.loading === snapshot.loading
  ) {
    return;
  }
  snapshot = next;
  emit();
}

async function start() {
  if (started) return;
  started = true;
  try {
    const [{ getFirebase }, { onAuthStateChanged }] = await Promise.all([
      import("@/lib/firebase"),
      import("firebase/auth"),
    ]);
    const { auth } = await getFirebase();
    authRef = auth;
    onAuthStateChanged(auth, (user) => applyUser(user));
  } catch {
    // Firebase indisponível — mantém o snapshot de fallback (inicial "U").
    started = false;
  }
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  void start();
  return () => {
    listeners.delete(callback);
  };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => SERVER_SNAPSHOT;

/** Recalcula o avatar a partir do usuário atual (após upload/remoção). */
export async function refreshProfilePhoto(): Promise<void> {
  if (!authRef) return;
  try {
    await authRef.currentUser?.reload();
  } catch {
    /* ignora falha de reload — usa o que estiver em memória */
  }
  applyUser(authRef.currentUser);
}

export function useProfilePhoto() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const refresh = useCallback(() => refreshProfilePhoto(), []);
  return { ...snap, refresh };
}
