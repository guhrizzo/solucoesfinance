"use client";

// ─── Hook de PIN global por usuário ──────────────────────────────────────────
// O PIN é um número de 4 dígitos armazenado como hash SHA-256 no Firestore
// em users/{uid}/profile.pin
//
// Bloqueio: após 3 tentativas erradas, bloqueia por 5 minutos (sessionStorage)

import { useState, useCallback } from "react";

const LOCK_KEY = "nexusfi:pin_locked_until";
const ATTEMPT_KEY = "nexusfi:pin_attempts";
const MAX_ATTEMPTS = 3;
const LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutos

// ─── SHA-256 via Web Crypto API ───────────────────────────────────────────────
export async function sha256(text: string): Promise<string> {
    const encoded = new TextEncoder().encode(text);
    const buffer = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

// ─── Verificar bloqueio ───────────────────────────────────────────────────────
export function getPinLockStatus(): { locked: boolean; remainingMs: number } {
    const lockedUntil = Number(sessionStorage.getItem(LOCK_KEY) ?? 0);
    const now = Date.now();
    if (lockedUntil > now) {
        return { locked: true, remainingMs: lockedUntil - now };
    }
    return { locked: false, remainingMs: 0 };
}

function getAttempts(): number {
    return Number(sessionStorage.getItem(ATTEMPT_KEY) ?? 0);
}

function incrementAttempts(): number {
    const next = getAttempts() + 1;
    sessionStorage.setItem(ATTEMPT_KEY, String(next));
    if (next >= MAX_ATTEMPTS) {
        sessionStorage.setItem(LOCK_KEY, String(Date.now() + LOCK_DURATION_MS));
    }
    return next;
}

function resetAttempts() {
    sessionStorage.removeItem(ATTEMPT_KEY);
    sessionStorage.removeItem(LOCK_KEY);
}

// ─── Carregar hash do PIN do Firestore ────────────────────────────────────────
export async function loadPinHash(uid: string): Promise<string | null> {
    const [{ getFirebase }, { doc, getDoc }] = await Promise.all([
        import("@/lib/firebase"),
        import("firebase/firestore"),
    ]);
    const { db } = await getFirebase();
    const snap = await getDoc(doc(db, "users", uid, "profile", "pin"));
    if (!snap.exists()) return null;
    return (snap.data() as { hash: string }).hash ?? null;
}

// ─── Salvar hash do PIN no Firestore ─────────────────────────────────────────
export async function savePinHash(uid: string, pin: string): Promise<void> {
    const hash = await sha256(pin);
    const [{ getFirebase }, { doc, setDoc }] = await Promise.all([
        import("@/lib/firebase"),
        import("firebase/firestore"),
    ]);
    const { db } = await getFirebase();
    await setDoc(doc(db, "users", uid, "profile", "pin"), { hash, updatedAt: Date.now() });
    resetAttempts();
}

// ─── Remover PIN do Firestore ─────────────────────────────────────────────────
export async function deletePinHash(uid: string): Promise<void> {
    const [{ getFirebase }, { doc, deleteDoc }] = await Promise.all([
        import("@/lib/firebase"),
        import("firebase/firestore"),
    ]);
    const { db } = await getFirebase();
    await deleteDoc(doc(db, "users", uid, "profile", "pin"));
    resetAttempts();
}

// ─── Verificar PIN ────────────────────────────────────────────────────────────
export async function verifyPin(uid: string, pin: string): Promise<"ok" | "wrong" | "locked" | "no_pin"> {
    const { locked } = getPinLockStatus();
    if (locked) return "locked";

    const storedHash = await loadPinHash(uid);
    if (!storedHash) return "no_pin";

    const inputHash = await sha256(pin);
    if (inputHash === storedHash) {
        resetAttempts();
        return "ok";
    }

    incrementAttempts();
    const { locked: nowLocked } = getPinLockStatus();
    if (nowLocked) return "locked";
    return "wrong";
}

// ─── Hook para uso em componentes ────────────────────────────────────────────
export function usePinState() {
    const [attempts, setAttempts] = useState(getAttempts);
    const [lockStatus, setLockStatus] = useState(getPinLockStatus);

    const refresh = useCallback(() => {
        setAttempts(getAttempts());
        setLockStatus(getPinLockStatus());
    }, []);

    return { attempts, lockStatus, refresh, maxAttempts: MAX_ATTEMPTS };
}
