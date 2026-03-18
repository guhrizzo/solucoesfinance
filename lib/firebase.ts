// lib/firebase.ts
// Lazy singleton — ZERO imports estáticos do Firebase
// Funciona com Next.js SSR sem erros

let _cache: {
  app: import("firebase/app").FirebaseApp;
  auth: import("firebase/auth").Auth;
  db: import("firebase/firestore").Firestore;
  storage: import("firebase/storage").FirebaseStorage;
  googleProvider: import("firebase/auth").GoogleAuthProvider;
} | null = null;

export async function getFirebase() {
  if (_cache) return _cache;

  const [
    { initializeApp, getApps, getApp },
    { getAuth, GoogleAuthProvider },
    { getFirestore },
    { getStorage },
  ] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/firestore"),
    import("firebase/storage"),
  ]);

  const firebaseConfig = {
    apiKey: "AIzaSyD-C0_u_yANYCOV89EX5bZFSIwWnU-VKeE",
    authDomain: "finance-add95.firebaseapp.com",
    projectId: "finance-add95",
    storageBucket: "finance-add95.firebasestorage.app",
    messagingSenderId: "642933154268",
    appId: "1:642933154268:web:9366c791e2aab51bb32f19",
    measurementId: "G-JE3P61FDSL"
  };

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

  _cache = {
    app,
    auth:           getAuth(app),
    db:             getFirestore(app),
    storage:        getStorage(app),
    googleProvider: new GoogleAuthProvider(),
  };

  return _cache;
}