import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getToken, setLastEmail, setToken } from "./api";
import { auth } from "./firebase";
import { createUserWithEmailAndPassword, signInAnonymously, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";

export type User = {
  user_id: string; email: string; name: string; picture?: string;
  role: string; phone?: string; committee_id?: string | null;
};

export function authErrorMessage(error: any, registering: boolean): string {
  const code = String(error?.code || "").replace("auth/", "");
  const rawMessage = String(error?.message || "");
  const messages: Record<string, string> = {
    "invalid-credential": "Email or password is incorrect.",
    "invalid-login-credentials": "Email or password is incorrect.",
    "user-not-found": "No account exists for this email. Choose Create an account first.",
    "wrong-password": "Password is incorrect.",
    "email-already-in-use": "An account already exists for this email. Choose Sign in.",
    "weak-password": "Password must contain at least 6 characters.",
    "invalid-email": "Enter a valid email address.",
    "operation-not-allowed": "Email/password login is disabled in Firebase Authentication.",
    "network-request-failed": "Network error. Check your internet connection and try again.",
  };
  if (messages[code]) return messages[code];
  if (rawMessage.includes("Invalid Firebase token") || rawMessage.includes("Firebase token")) {
    return "Firebase login succeeded, but the backend rejected the token. Check the Render Firebase service account and project configuration.";
  }
  if (rawMessage.includes("Unauthorized") || rawMessage.includes("Missing token") || rawMessage.includes("Invalid session")) {
    return "Your session is invalid or expired. Try signing out and back in, and confirm the app is using the live backend URL.";
  }
  if (rawMessage.includes("HTTP 401") || rawMessage.includes("HTTP 400")) {
    return "The backend rejected the login request. Verify the Firebase project is configured correctly and the app is pointing to the live backend.";
  }
  return rawMessage || (registering ? "Account creation failed." : "Sign in failed.");
}

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  signInAnonymous: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as any);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const exchangeFirebaseUser = useCallback(async (firebaseUser: { getIdToken: () => Promise<string> }) => {
    const idToken = await firebaseUser.getIdToken();
    const res = await api.firebaseAuth(idToken);
    await setToken(res.session_token);
    setUser(res.user);
  }, []);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) { setUser(null); return; }
    try { const u = await api.me(); setUser(u); }
    catch { await setToken(null); setUser(null); }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim();
    const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
    await setLastEmail(normalizedEmail);
    await exchangeFirebaseUser(credential.user);
  }, [exchangeFirebaseUser]);

  const register = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim();
    const credential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
    await setLastEmail(normalizedEmail);
    await exchangeFirebaseUser(credential.user);
  }, [exchangeFirebaseUser]);

  const signInAnonymous = useCallback(async () => {
    const credential = await signInAnonymously(auth);
    await exchangeFirebaseUser(credential.user);
  }, [exchangeFirebaseUser]);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch {}
    try { await firebaseSignOut(auth); } catch {}
    await setToken(null);
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, signIn, register, signInAnonymous, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
