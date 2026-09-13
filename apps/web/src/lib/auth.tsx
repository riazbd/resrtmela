"use client";

/**
 * The console's session.
 *
 * `AuthProvider` moved to `@rh/app-core`. It had to be last: every other
 * module that moved is one of its dependencies, and it is the one place where
 * a mistake either locks somebody out of a resort that is theirs or shows them
 * one that is not.
 *
 * Six things it used to reach for are supplied here, because each is a
 * different object on a phone. Five are mechanical. The sixth is `navigate`:
 * leaving an impersonated session used to assign `window.location.href`, which
 * is a full page load — correct in a browser, and meaningless in an app, where
 * it becomes a router push.
 */
import { AuthProvider as SharedAuthProvider, guardedStorage } from "@rh/app-core";
import { api, permissionsFor, setMoneyFormat } from "@/lib/api";
import { browserStorage, cacheStore } from "@/lib/offline-cache";

export { useAuth, type AuthValue } from "@rh/app-core";

/**
 * Guarded, and that is load-bearing rather than cautious.
 *
 * `isImpersonating` is read during render, not in an effect — so it runs while
 * Next prerenders this "use client" module on the server, where `window` does
 * not exist. The code that moved carried a `typeof window !== "undefined"`
 * check for exactly that; the guard is where that check lives now, and without
 * it the whole console would 500 on its first paint.
 *
 * Unlike `CacheStore`, nothing here has a cleverer answer to a failed write
 * than "carry on", so swallowing is the right behaviour all the way down.
 */
const session = guardedStorage(browserStorage);

/**
 * Both of these are module constants rather than inline arrows, and that is
 * not tidiness. `navigate` reaches `exitImpersonation`'s dependency array; an
 * arrow written in the JSX would be a new function on every render, so the
 * context value would be new on every render, and every screen reading `useAuth`
 * would re-render along with it.
 */
const rememberResortCurrency = (resort: { currency?: string; locale?: string } | null) =>
  setMoneyFormat({ currency: resort?.currency, locale: resort?.locale });

// a full page load, which is what stepping out of an impersonated session
// should be: nothing of the tenant's is left in memory
const goTo = (path: string) => {
  window.location.href = path;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <SharedAuthProvider
      storage={session}
      api={api}
      permissionsFor={permissionsFor}
      onActiveResort={rememberResortCurrency}
      cache={cacheStore}
      navigate={goTo}
    >
      {children}
    </SharedAuthProvider>
  );
}
