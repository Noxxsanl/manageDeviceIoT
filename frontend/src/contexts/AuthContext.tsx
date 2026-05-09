"use client";

import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/types/user";
import {
  AUTH_ROUTES,
  getUser,
  isAuthenticated,
  login as mockLogin,
  logout as mockLogout,
} from "@/lib/auth";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, remember?: boolean) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setUser(isAuthenticated() ? getUser() : null);
      setLoading(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const login = useCallback(async (username: string, password: string, remember = false) => {
    const authUser = await mockLogin(username, password, remember);
    setUser(authUser);
    router.replace(AUTH_ROUTES.dashboard);
  }, [router]);

  const logout = useCallback(() => {
    mockLogout();
    setUser(null);
    router.replace(AUTH_ROUTES.login);
  }, [router]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="rounded-3xl border border-slate-800/80 bg-slate-900/95 p-10 text-center shadow-xl shadow-slate-950/30">
            <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Checking access</p>
            <h1 className="mt-4 text-2xl font-semibold text-white">Preparing your workspace...</h1>
          </div>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthContext;
