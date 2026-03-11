import { initializeApp, getApps } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: "my-finance-9bd3a.firebaseapp.com",
    projectId: "my-finance-9bd3a",
    storageBucket: "my-finance-9bd3a.firebasestorage.app",
    messagingSenderId: "310589264866",
    appId: "1:310589264866:web:f42e53887eec75f485dfbb",
};



export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();