// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD5SkQqMp9L43wcnGcBybRCstAMurB4x24",
  authDomain: "my-finance-9bd3a.firebaseapp.com",
  projectId: "my-finance-9bd3a",
  storageBucket: "my-finance-9bd3a.firebasestorage.app",
  messagingSenderId: "310589264866",
  appId: "1:310589264866:web:f42e53887eec75f485dfbb",
  measurementId: "G-2WLYPM5QQK"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);