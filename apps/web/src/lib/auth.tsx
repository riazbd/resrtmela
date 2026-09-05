"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken, type Me, type Resort } from "./api";

interface AuthState {
  me: Me | null;
  activeResort: Resort | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<void>;
  logout: () => void;
  setActiveResort: (r: Resort) => void;
  role: string;
  isStaff: boolean;
  isManagement: boolean;
  isAgent: boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [activeResort, setActive] = useState<Resort | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const meData = await api<Me>("/auth/me");
        if (!alive) return;
        setMe(meData);
        const resorts = meData.resorts.map((r) => r.resort);
        const savedId = Number(window.localStorage.getItem("rh.resortId"));
        const resort =
          resorts.find((r) => r.id === savedId) ?? resorts[0] ?? null;
        setActive(resort);
        if (resort) window.localStorage.setItem("rh.resortId", String(resort.id));
      } catch {
        setToken(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    const res = await api<{ accessToken: string }>("/auth/login", {
      method: "POST",
      body: { phone, password },
    });
    setToken(res.accessToken);
    const meData = await api<Me>("/auth/me");
    setMe(meData);
    const resort = meData.resorts.map((r) => r.resort)[0] ?? null;
    setActive(resort);
    if (resort) window.localStorage.setItem("rh.resortId", String(resort.id));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setMe(null);
    setActive(null);
  }, []);

  const setActiveResort = useCallback((r: Resort) => {
    setActive(r);
    window.localStorage.setItem("rh.resortId", String(r.id));
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      me,
      activeResort,
      loading,
      login,
      logout,
      setActiveResort,
      role: me?.role ?? "",
      isStaff: ["SUPER_ADMIN", "RESORT_ADMIN", "MANAGER", "FRONT_DESK"].includes(me?.role ?? ""),
      isManagement: ["SUPER_ADMIN", "RESORT_ADMIN", "MANAGER"].includes(me?.role ?? ""),
      isAgent: me?.role === "AGENT",
    }),
    [me, activeResort, loading, login, logout, setActiveResort],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
