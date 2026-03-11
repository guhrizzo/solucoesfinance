import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: "my-finance-9bd3a.firebaseapp.com",
    projectId: "my-finance-9bd3a",
    storageBucket: "my-finance-9bd3a.firebasestorage.app",
    messagingSenderId: "310589264866",
    appId: "1:310589264866:web:f42e53887eec75f485dfbb",
};

// Evita re-inicializar em hot-reload e no SSR
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();