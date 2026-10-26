import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { api, ApiError } from "./api";
import type { PublicConfig, RegisterResult, User } from "./types";

type AuthState = {
  user: User | null;
  config: PublicConfig | null;
  loading: boolean;
  signIn: (credential: string) => Promise<void>;
  devSignIn: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, confirmPassword: string) => Promise<RegisterResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const cfg = await api.config();
        if (active) setConfig(cfg);
      } catch {
        // config is non-fatal
      }

      try {
        const { user: me } = await api.me();
        if (active) setUser(me);
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 401) console.error(err);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (credential: string) => {
    const { user: signedIn } = await api.loginWithGoogle(credential);
    setUser(signedIn);
  }, []);

  const devSignIn = useCallback(async (email: string) => {
    const { user: signedIn } = await api.devLogin(email);
    setUser(signedIn);
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { user: signedIn } = await api.loginWithPassword(email, password);
    setUser(signedIn);
  }, []);

  const register = useCallback(async (email: string, password: string, confirmPassword: string) => {
    return api.register(email, password, confirmPassword);
  }, []);

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
    window.google?.accounts.id.disableAutoSelect();
  }, []);

  const value = useMemo(
    () => ({ user, config, loading, signIn, devSignIn, signInWithPassword, register, signOut }),
    [user, config, loading, signIn, devSignIn, signInWithPassword, register, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
