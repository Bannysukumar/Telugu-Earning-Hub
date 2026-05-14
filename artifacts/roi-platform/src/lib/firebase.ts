import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import { getAuth, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCDMrNtJnTgtnkRYfJQItZ3cj8ATsNk9FE",
  authDomain: "telugu-earning-hub-2f74e.firebaseapp.com",
  projectId: "telugu-earning-hub-2f74e",
  storageBucket: "telugu-earning-hub-2f74e.firebasestorage.app",
  messagingSenderId: "308788856860",
  appId: "1:308788856860:web:99f0609e2daef1b2be77d9",
  measurementId: "G-XPC2C1RFFB",
};

export const firebaseApp: FirebaseApp = initializeApp(firebaseConfig);

export const firebaseAuth: Auth = getAuth(firebaseApp);

let analyticsPromise: Promise<Analytics | null> | null = null;

export function getFirebaseAnalytics(): Promise<Analytics | null> {
  if (!analyticsPromise) {
    analyticsPromise = isSupported().then((supported) =>
      supported ? getAnalytics(firebaseApp) : null,
    );
  }
  return analyticsPromise;
}

void getFirebaseAnalytics();
