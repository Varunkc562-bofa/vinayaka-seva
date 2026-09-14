import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBSP0eDeyiwvrEvgvVu7HbS8D984S0aZHI",
  authDomain: "ganasetu.firebaseapp.com",
  projectId: "ganasetu",
  storageBucket: "ganasetu.firebasestorage.app",
  messagingSenderId: "718468112679",
  appId: "1:718468112679:web:7ed9b9ac8e5905ee050902",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);