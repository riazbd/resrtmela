import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Me, Resort } from "@rh/shared";
import type { CacheStore } from "./offline-cache";
import type { Storage } from "./storage";

/**
 * Who is signed in, which resort they are looking at, and what they may do.
 *
 * The last module out of the console and the one every other stands on. Six
 * things it used to reach for directly are supplied by the host now, because
 * each is a different object on a phone: where the token is kept, how a call
 * is made, how permissions are fetched, where money formatting is held, what
 * the offline cache is, and what "go to this screen" means.
 *
 * The three storage keys are named here rather than passed in. They are this
 * module's own business, and a host that could rename them could also collide
 * with the cache's.
 */
const TOKEN = "rh.token";
const RESORT_ID = "rh.resortId";
const IMPERSONATOR = "rh.impersonator";

export interface AuthPorts {
  /** Where the session is kept: localStorage on the console, MMKV on the phone. */
  storage: Storage;
  /** One authenticated call. Carries whatever token `storage` holds. */
  api: <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;
  /**
   * Optional, because not everyone signed in is inside a resort: an agency
   * works across all of them and the platform owner runs none. Asked without
   * one, the server answers what the person themselves may do.
   */
  permissionsFor: (resortId?: number) => Promise<{ permissions: string[]; features?: string[] }>;
  /**
   * Told whenever the active resort changes, so the host can render money in
   * that resort's currency and locale. A callback rather than a direct call
   * because the formatter is module state on the console and a context on the
   * phone.
   */
  onActiveResort: (resort: Resort | null) => void;
  /** Emptied on sign-out. `null` where nothing is cached. */
  cache: CacheStore | null;
  /** Where to go on leaving an impersonated session. A router push, or a location assignment. */
  navigate: (path: string) => void;
}

export interface AuthValue {
  me: Me | null;
  activeResort: Resort | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<Me>;
  /**
   * Adopts an access token this component did not itself request — signup's
   * own POST mints one just as validly as a login does. Stores it, loads
   * `/auth/me`, activates the first resort and remembers it, and hands back
   * `me` so the caller can route somewhere that is actually theirs. `login`
   * is this plus the POST that gets the token in the first place.
   */
  adoptToken: (accessToken: string) => Promise<Me>;
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

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({
  children,
  storage,
  api,
  permissionsFor,
  onActiveResort,
  cache,
  navigate,
}: AuthPorts & { children: React.ReactNode }) {
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
      if (!storage.getItem(TOKEN)) {
        setLoading(false);
        return;
      }
      try {
        const meData = await api<Me>("/auth/me");
        if (!alive) return;
        setMe(meData);
        const resorts = meData.resorts.map((r) => r.resort);
        const savedId = Number(storage.getItem(RESORT_ID));
        const resort =
          resorts.find((r) => r.id === savedId) ?? resorts[0] ?? null;
        setActive(resort);
        if (resort) storage.setItem(RESORT_ID, String(resort.id));
      } catch {
        storage.removeItem(TOKEN);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [storage, api]);

  // money renders in the active resort's currency and locale
  useEffect(() => {
    onActiveResort(activeResort);
  }, [activeResort, onActiveResort]);

  /**
   * What this person may do — asked about the active resort when there is one.
   *
   * There is not always one, and that is the whole point. An agency sells
   * across resorts and belongs to none, so `consoleGate` lets an agent into the
   * console without one; this effect used to read that as "nothing to ask
   * about" and leave them holding an empty permission set for ever. Every
   * agency link in the sidebar names a permission, so the menu emptied itself
   * and a newly registered agency saw a single screen — while `/agent/*`
   * answered every one of its calls, because the server was never the one
   * refusing. An agency owner whose account also happened to be linked to a
   * resort got the full menu, which is what made it look like a resort was
   * somehow granting agency access.
   *
   * Plan features stay tied to the resort: a plan is a resort's, and an agency
   * is on nobody's.
   */
  useEffect(() => {
    let alive = true;
    if (!me) {
      setPerms([]);
      setFeatures([]);
      return;
    }
    permissionsFor(activeResort?.id)
      .then((r) => {
        if (!alive) return;
        setPerms(r.permissions);
        setFeatures(activeResort ? r.features ?? [] : []);
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
  }, [me, activeResort, permTick, permissionsFor]);

  const adoptToken = useCallback(
    async (accessToken: string) => {
      storage.setItem(TOKEN, accessToken);
      const meData = await api<Me>("/auth/me");
      setMe(meData);
      const resort = meData.resorts.map((r) => r.resort)[0] ?? null;
      setActive(resort);
      if (resort) storage.setItem(RESORT_ID, String(resort.id));
      // handed back so the caller can send them somewhere that is theirs: state
      // set here is not readable until the next render
      return meData;
    },
    [storage, api],
  );

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await api<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: { identifier, password },
      });
      return adoptToken(res.accessToken);
    },
    [adoptToken],
  );

  const logout = useCallback(() => {
    storage.removeItem(TOKEN);
    storage.removeItem(IMPERSONATOR);
    // whatever the app kept for reading offline belongs to the person signing
    // out, not to whoever sits down at this counter next. `cache.clear()` and
    // not `storage.clear()`: the device's language and its remembered resort
    // are the device's, and signing out is not a factory reset.
    cache?.clear();
    setMe(null);
    setActive(null);
    setPerms([]);
    setFeatures([]);
  }, [storage, cache]);

  const impersonate = useCallback(
    async (accessToken: string) => {
      // remember the super admin session so we can step back out
      const current = storage.getItem(TOKEN);
      if (current) storage.setItem(IMPERSONATOR, current);
      storage.removeItem(RESORT_ID);
      storage.setItem(TOKEN, accessToken);
      const meData = await api<Me>("/auth/me");
      setMe(meData);
      setActive(meData.resorts.map((r) => r.resort)[0] ?? null);
    },
    [storage, api],
  );

  const exitImpersonation = useCallback(() => {
    const original = storage.getItem(IMPERSONATOR);
    storage.removeItem(IMPERSONATOR);
    if (original) {
      storage.setItem(TOKEN, original);
      navigate("/platform");
    } else {
      storage.removeItem(TOKEN);
      setMe(null);
      setActive(null);
      navigate("/login");
    }
  }, [storage, navigate]);

  const setActiveResort = useCallback((r: Resort) => {
    setActive(r);
    storage.setItem(RESORT_ID, String(r.id));
  }, []);

  const can = useCallback(
    (perm: string) => perms.includes("*") || perms.includes(perm),
    [perms],
  );

  const value = useMemo<AuthValue>(
    () => ({
      me,
      activeResort,
      loading,
      login,
      adoptToken,
      logout,
      setActiveResort,
      role: me?.role ?? "",
      isStaff: ["SUPER_ADMIN", "RESORT_ADMIN", "MANAGER", "FRONT_DESK"].includes(me?.role ?? ""),
      isManagement: ["SUPER_ADMIN", "RESORT_ADMIN", "MANAGER"].includes(me?.role ?? ""),
      isAgent: me?.role === "AGENT",
      isImpersonating: !!storage.getItem(IMPERSONATOR),
      impersonate,
      exitImpersonation,
      perms,
      features,
      can,
      refreshPerms: () => setPermTick((t) => t + 1),
    }),
    [me, activeResort, loading, login, adoptToken, logout, setActiveResort, impersonate, exitImpersonation, perms, features, can, storage],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
