// lib/firebase.ts
// Lazy singleton — ZERO imports estáticos do Firebase
// Funciona com Next.js SSR sem erros

let _cache: {
  app:            import("firebase/app").FirebaseApp;
  auth:           import("firebase/auth").Auth;
  db:             import("firebase/firestore").Firestore;
  googleProvider: import("firebase/auth").GoogleAuthProvider;
} | null = null;

export async function getFirebase() {
  if (_cache) return _cache;

  const [
    { initializeApp, getApps, getApp },
    { getAuth, GoogleAuthProvider },
    { getFirestore },
  ] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/firestore"),
  ]);

  const config = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  };

  const app = getApps().length > 0 ? getApp() : initializeApp(config);

  _cache = {
    app,
    auth:           getAuth(app),
    db:             getFirestore(app),
    googleProvider: new GoogleAuthProvider(),
  };

  return _cache;
}