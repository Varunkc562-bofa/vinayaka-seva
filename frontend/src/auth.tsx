import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { api, getToken, setToken } from "./api";

WebBrowser.maybeCompleteAuthSession();

export type User = {
  user_id: string; email: string; name: string; picture?: string;
  role: string; phone?: string;
};

type AuthCtx = {
  user: User | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({} as any);
export const useAuth = () => useContext(Ctx);

const consumed = new Set<string>();

function extractSessionId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?#&]session_id=([^&#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const capturedUrlRef = useRef<string | null>(null);

  const exchange = useCallback(async (session_id: string) => {
    if (consumed.has(session_id)) return;
    consumed.add(session_id);
    try {
      const res = await api.authSession(session_id);
      await setToken(res.session_token);
      setUser(res.user);
    } catch (e) { console.warn("auth exchange failed", e); }
  }, []);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) { setUser(null); return; }
    try { const u = await api.me(); setUser(u); }
    catch { await setToken(null); setUser(null); }
  }, []);

  // Web: parse URL on mount
  useEffect(() => {
    (async () => {
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const sid = extractSessionId(window.location.href);
        if (sid) {
          await exchange(sid);
          try {
            const url = new URL(window.location.href);
            url.hash = ""; url.searchParams.delete("session_id");
            window.history.replaceState(window.history.state, "", url.toString());
          } catch {}
        }
      } else {
        const initial = await Linking.getInitialURL();
        const sid = extractSessionId(initial);
        if (sid) await exchange(sid);
      }
      await refresh();
      setLoading(false);
    })();

    if (Platform.OS !== "web") {
      const sub = Linking.addEventListener("url", async ({ url }) => {
        capturedUrlRef.current = url;
        const sid = extractSessionId(url);
        if (sid) await exchange(sid);
      });
      return () => sub.remove();
    }
  }, [exchange, refresh]);

  const signIn = useCallback(async () => {
    const redirect = Platform.OS === "web"
      ? (typeof window !== "undefined" ? window.location.origin + "/" : "/")
      : Linking.createURL("");
    const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
    if (Platform.OS === "web") {
      if (typeof window !== "undefined") window.location.href = authUrl;
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
    let url: string | null = (result as any).url || null;
    if (!url) url = capturedUrlRef.current;
    if (!url) url = await Linking.getInitialURL();
    const sid = extractSessionId(url);
    if (sid) await exchange(sid);
    await refresh();
  }, [exchange, refresh]);

  const signOut = useCallback(async () => {
    try { await api.logout(); } catch {}
    await setToken(null);
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, signIn, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
