/**
 * The app's session, wired from the parts `@rh/app-core` asks for.
 *
 * The console has the same file. Six things the provider used to reach for
 * directly are supplied by the host, because each is a different object on a
 * phone: where the token is kept, how a call is made, how permissions are
 * fetched, where money formatting is held, what the offline cache is, and
 * what "go to this screen" means.
 */
import { useMemo, useState, type ReactNode } from "react";
import { router } from "expo-router";
import { AuthProvider as SharedAuthProvider, CacheStore, guardedStorage } from "@rh/app-core";
import { createApiClient, type MoneyFormat } from "@rh/shared";
import { deviceStorage } from "../device/storage";
import { MoneyFormatProvider } from "../design/money";
import { API_URL } from "./config";
import { makeApi } from "./transport";

export { useAuth, type AuthValue } from "@rh/app-core";

/**
 * One store, two views of it, and the difference is load-bearing.
 *
 * The session is guarded: nothing it does has a cleverer answer to a failed
 * write than carrying on, and a front desk that cannot open because storage
 * misbehaved is not a trade worth making. The cache is *not* guarded,
 * because `CacheStore` has a better answer to a full store than swallowing —
 * it drops the oldest half and retries — and a guard would silently retire
 * that.
 */
const device = deviceStorage();
const session = guardedStorage(device);
const cache = new CacheStore(device);

/**
 * Stepping out of an impersonated session. In the console this is a full
 * page load, so nothing of the tenant's is left in memory; a phone has no
 * such thing, so it is a router replace and the provider clears what it
 * holds itself.
 *
 * A module constant rather than an inline arrow: it reaches a dependency
 * array inside the provider, and a new function each render would make the
 * context value new each render, re-rendering every screen that reads it.
 */
const goTo = (path: string) => router.replace(path as never);

const onSignedOut = () => router.replace("/login");

export const api = makeApi({ baseUrl: API_URL, storage: session, onSignedOut });
export const client = createApiClient(api);

/** Two answers in one request: what this person may do, and what the plan includes. */
const permissionsFor = (resortId?: number) => client.permissions(resortId);

export function SessionProvider({ children }: { children: ReactNode }) {
  /**
   * Money is a context on the phone rather than module state, because the
   * app can be rebuilt for a second resort without a reload and a module
   * variable would keep the first one's currency.
   */
  const [format, setFormat] = useState<MoneyFormat>({});
  const rememberCurrency = useMemo(
    () => (resort: { currency?: string; locale?: string } | null) =>
      setFormat({ currency: resort?.currency, locale: resort?.locale }),
    [],
  );

  return (
    <SharedAuthProvider
      storage={session}
      api={api}
      permissionsFor={permissionsFor}
      onActiveResort={rememberCurrency}
      cache={cache}
      navigate={goTo}
    >
      <MoneyFormatProvider value={format}>{children}</MoneyFormatProvider>
    </SharedAuthProvider>
  );
}
