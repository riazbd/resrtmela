"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, setToken, permissionsFor, setMoneyFormat, type Me, type Resort } from "./api";
import { cacheStore } from "./offline-cache";

interface AuthState {
  me: Me | null;
  activeResort: Resort | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  setActiveResort: (r: Resort) => void;
  role: string;
  isStaff: boolean;
  isManagement: boolean;
  isAgent: boolean;
  isImpersonating: boolean;
  impersonate: (accessToken: string) => Promise<void>;
  exitImpersonation: () => void;
  perms: string[];
  /** Keys from PLAN_FEATURES that the active resort's plan includes. */
  features: string[];
  can: (perm: string) => boolean;
  refreshPerms: () => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [activeResort, setActive] = useState<Resort | null>(null);
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState<string[]>([]);
  /**
   * What the active resort's plan includes.
   *
   * A second reason a screen might not be theirs, alongside `perms`: the owner
   * gave them the permission, but the resort is not on a plan that has it.
   */
  const [features, setFeatures] = useState<string[]>([]);
  const [permTick, setPermTick] = useState(0);

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

  // money renders in the active resort's currency and locale
  useEffect(() => {
    setMoneyFormat({ currency: activeResort?.currency, locale: activeResort?.locale });
  }, [activeResort]);

  // permission set for the active resort
  useEffect(() => {
    let alive = true;
    if (!me || !activeResort) {
      setPerms([]);
      setFeatures([]);
      return;
    }
    permissionsFor(activeResort.id)
      .then((r) => {
        if (!alive) return;
        setPerms(r.permissions);
        setFeatures(r.features ?? []);
      })
      .catch(() => {
        if (alive) {
          setPerms([]);
          setFeatures([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [me, activeResort, permTick]);

  const login = useCallback(async (identifier: string, password: string) => {
    const res = await api<{ accessToken: string }>("/auth/login", {
      method: "POST",
      body: { identifier, password },
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
    window.localStorage.removeItem("rh.impersonator");
    // whatever the app kept for reading offline belongs to the person signing
    // out, not to whoever sits down at this counter next
    cacheStore.clear();
    setMe(null);
    setActive(null);
    setPerms([]);
    setFeatures([]);
  }, []);

  const impersonate = useCallback(async (accessToken: string) => {
    // remember the super admin session so we can step back out
    const current = getToken();
    if (current) window.localStorage.setItem("rh.impersonator", current);
    window.localStorage.removeItem("rh.resortId");
    setToken(accessToken);
    const meData = await api<Me>("/auth/me");
    setMe(meData);
    setActive(meData.resorts.map((r) => r.resort)[0] ?? null);
  }, []);

  const exitImpersonation = useCallback(() => {
    const original = window.localStorage.getItem("rh.impersonator");
    window.localStorage.removeItem("rh.impersonator");
    if (original) {
      setToken(original);
      window.location.href = "/platform";
    } else {
      setToken(null);
      setMe(null);
      setActive(null);
      window.location.href = "/login";
    }
  }, []);

  const setActiveResort = useCallback((r: Resort) => {
    setActive(r);
    window.localStorage.setItem("rh.resortId", String(r.id));
  }, []);

  const can = useCallback(
    (perm: string) => perms.includes("*") || perms.includes(perm),
    [perms],
  );

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
      isImpersonating: typeof window !== "undefined" && !!window.localStorage.getItem("rh.impersonator"),
      impersonate,
      exitImpersonation,
      perms,
      features,
      can,
      refreshPerms: () => setPermTick((t) => t + 1),
    }),
    [me, activeResort, loading, login, logout, setActiveResort, impersonate, exitImpersonation, perms, features, can],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
