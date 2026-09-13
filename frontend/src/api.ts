import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
export const API = `${BASE}/api`;

const TOKEN_KEY = "vs_session_token";
let inMemoryToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (inMemoryToken) return inMemoryToken;
  if (Platform.OS === "web") {
    try { inMemoryToken = typeof window !== "undefined" ? window.localStorage.getItem(TOKEN_KEY) : null; }
    catch { inMemoryToken = null; }
  } else {
    inMemoryToken = await SecureStore.getItemAsync(TOKEN_KEY);
  }
  return inMemoryToken;
}

export async function setToken(token: string | null) {
  inMemoryToken = token;
  if (Platform.OS === "web") {
    try {
      if (token) window.localStorage.setItem(TOKEN_KEY, token);
      else window.localStorage.removeItem(TOKEN_KEY);
    } catch {}
  } else {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

async function request(path: string, opts: RequestInit = {}) {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (res.status === 401) {
    await setToken(null);
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(t || `HTTP ${res.status}`);
  }
  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

export const api = {
  authSession: (session_id: string) => request("/auth/session", {
    method: "POST", body: JSON.stringify({ session_id }),
  }),
  me: () => request("/auth/me"),
  logout: () => request("/auth/logout", { method: "POST" }),

  dashboard: () => request("/dashboard"),
  members: () => request("/members"),
  updateRole: (id: string, role: string) => request(`/members/${id}/role`, {
    method: "PATCH", body: JSON.stringify({ role }),
  }),
  roles: () => request("/roles"),

  tasks: (mine = false) => request(`/tasks${mine ? "?mine=true" : ""}`),
  createTask: (data: any) => request("/tasks", { method: "POST", body: JSON.stringify(data) }),
  updateTask: (id: string, data: any) => request(`/tasks/${id}`, {
    method: "PATCH", body: JSON.stringify(data),
  }),
  commentTask: (id: string, text: string) => request(`/tasks/${id}/comments`, {
    method: "POST", body: JSON.stringify({ text }),
  }),
  deleteTask: (id: string) => request(`/tasks/${id}`, { method: "DELETE" }),

  donations: () => request("/donations"),
  createDonation: (d: any) => request("/donations", { method: "POST", body: JSON.stringify(d) }),

  expenses: () => request("/expenses"),
  createExpense: (e: any) => request("/expenses", { method: "POST", body: JSON.stringify(e) }),
  approveExpense: (id: string) => request(`/expenses/${id}/approve`, { method: "PATCH" }),

  announcements: () => request("/announcements"),
  createAnnouncement: (a: any) => request("/announcements", { method: "POST", body: JSON.stringify(a) }),

  events: () => request("/events"),
  createEvent: (e: any) => request("/events", { method: "POST", body: JSON.stringify(e) }),

  seed: () => request("/dev/seed", { method: "POST" }),

  aiHistory: () => request("/ai/history"),
};
