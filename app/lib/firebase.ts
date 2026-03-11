// lib/firebase.ts
// ─── NÃO inicializa Firebase no momento do import ────────────────────────────
// Toda inicialização acontece dentro de getFirebase(), que só é chamada
// no browser (dentro de useEffect / event handlers).

import type { Auth } from "firebase/auth";
import type { GoogleAuthProvider as GProvider } from "firebase/auth";

let _auth: Auth | null = null;
let _googleProvider: GProvider | null = null;

export async function getFirebase() {
    if (_auth && _googleProvider) {
        return { auth: _auth, googleProvider: _googleProvider };
    }

    const { initializeApp, getApps, getApp } = await import("firebase/app");
    const { getAuth, GoogleAuthProvider } = await import("firebase/auth");

    const firebaseConfig = {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        authDomain: "my-finance-9bd3a.firebaseapp.com",
        projectId: "my-finance-9bd3a",
        storageBucket: "my-finance-9bd3a.firebasestorage.app",
        messagingSenderId: "310589264866",
        appId: "1:310589264866:web:f42e53887eec75f485dfbb",
    };

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    _auth = getAuth(app);
    _googleProvider = new GoogleAuthProvider();

    return { auth: _auth, googleProvider: _googleProvider };
}