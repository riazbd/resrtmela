import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, setToken, type Me, type Resort } from "./api";

interface AuthState {
  me: Me | null;
  activeResort: Resort | null;
  booting: boolean;
  login: (phone: string, password: string) => Promise<void>;
  loginWithToken: (accessToken: string) => Promise<void>;
  logout: () => void;
  setActiveResort: (r: Resort) => void;
  isStaff: boolean;
  isManagement: boolean;
  isAgent: boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [activeResort, setActive] = useState<Resort | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem("rh.token");
        if (saved) {
          setToken(saved);
          const meData = await api<Me>("/auth/me");
          setMe(meData);
          setActive(meData.resorts[0]?.resort ?? null);
        }
      } catch {
        setToken(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  async function login(phone: string, password: string) {
    const res = await api<{ accessToken: string }>("/auth/login", {
      method: "POST",
      body: { phone, password },
    });
    await loginWithToken(res.accessToken);
  }

  async function loginWithToken(accessToken: string) {
    await AsyncStorage.setItem("rh.token", accessToken);
    setToken(accessToken);
    const meData = await api<Me>("/auth/me");
    setMe(meData);
    setActive(meData.resorts[0]?.resort ?? null);
  }

  async function logout() {
    await AsyncStorage.removeItem("rh.token");
    setToken(null);
    setMe(null);
    setActive(null);
  }

  const value = useMemo<AuthState>(
    () => ({
      me,
      activeResort,
      booting,
      login,
      loginWithToken,
      logout,
      setActiveResort: setActive,
      isStaff: ["SUPER_ADMIN", "RESORT_ADMIN", "MANAGER", "FRONT_DESK"].includes(me?.role ?? ""),
      isManagement: ["SUPER_ADMIN", "RESORT_ADMIN", "MANAGER"].includes(me?.role ?? ""),
      isAgent: me?.role === "AGENT",
    }),
    [me, activeResort, booting],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
