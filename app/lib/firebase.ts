// lib/firebase.ts
// Singleton robusto — inicializa UMA vez, guarda referências prontas para uso

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

let app:            FirebaseApp   | null = null;
let auth:           Auth          | null = null;
let db:             Firestore     | null = null;
let googleProvider: GoogleAuthProvider | null = null;

export function getFirebase() {
  if (typeof window === "undefined") {
    // SSR — nunca inicializa no servidor
    throw new Error("Firebase só pode ser usado no browser");
  }

  if (!app) {
    app            = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    auth           = getAuth(app);
    db             = getFirestore(app);
    googleProvider = new GoogleAuthProvider();
  }

  return { app: app!, auth: auth!, db: db!, googleProvider: googleProvider! };
}