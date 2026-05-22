import { Store } from "@tanstack/react-store";

export interface AuthUser {
  id: string;
  name: string;
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

const STORAGE_KEY = "octo:auth";

function readPersisted(): AuthState {
  if (typeof window === "undefined") return { token: null, user: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null };
    const parsed = JSON.parse(raw) as Partial<AuthState>;
    return {
      token: typeof parsed.token === "string" ? parsed.token : null,
      user:
        parsed.user && typeof parsed.user === "object"
          ? { id: String(parsed.user.id ?? ""), name: String(parsed.user.name ?? "") }
          : null,
    };
  } catch {
    return { token: null, user: null };
  }
}

export const authStore = new Store<AuthState>(readPersisted());

export const authActions = {
  signIn: (token: string, user: AuthUser) => authStore.setState(() => ({ token, user })),
  signOut: () => authStore.setState(() => ({ token: null, user: null })),
};

export function persistAuth(): void {
  if (typeof window === "undefined") return;
  authStore.subscribe(() => {
    try {
      const { token, user } = authStore.state;
      if (token) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user }));
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore storage quota / private mode errors
    }
  });
}
