/**
 * The app's session, wired from the parts `@rh/app-core` asks for.
 *
 * The console has the same file. Six things the provider used to reach for
 * directly are supplied by the host, because each is a different object on a
 * phone: where the token is kept, how a call is made, how permissions are
 * fetched, where money formatting is held, what the offline cache is, and
 * what "go to this screen" means.
 *
 * All six now come from `./wire`, which is the bottom of this graph rather
 * than the middle of it — see the note there for the require cycle that
 * made the move necessary. `api` and `client` are re-exported because the
 * whole app imports them from here and where they are built is not the
 * app's business.
 */
import { useMemo, useState, type ReactNode } from "react";
import { AuthProvider as SharedAuthProvider, QueryProvider } from "@rh/app-core";
import { platform, pushToken } from "./push";
import type { MoneyFormat } from "@rh/shared";
import { MoneyFormatProvider } from "../design/money";
import { Outbox } from "./outbox";
import { api, cache, client, goTo, permissionsFor, session } from "./wire";

export { useAuth, type AuthValue } from "@rh/app-core";
export { api, client } from "./wire";

/**
 * Ask to be told things, and stop asking.
 *
 * Both are fire-and-forget. A person who declines notifications, a
 * device with no Play Services, a phone offline at the moment of
 * sign-in — none of those is a reason to fail a sign-in, and all of
 * them happen.
 *
 * `forgetThisDevice` runs while the token is still in storage, because
 * it is an authenticated call. `AuthProvider` sequences that; this only
 * has to not await it.
 */
async function rememberThisDevice() {
  const { token } = await pushToken();
  if (!token) return;
  try {
    await client.auth.registerDevice(token, platform);
  } catch {
    // a sign-in is not failed by a notification that could not be set up
  }
}

async function forgetThisDevice() {
  const { token } = await pushToken();
  if (!token) return;
  try {
    await client.auth.forgetDevice(token, platform);
  } catch {
    // the server sweeps tokens Expo calls dead, so a missed delete is
    // eventually corrected rather than permanent
  }
}

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
    /**
     * The data layer is outside the session, as it is in the console's
     * `app/layout.tsx` — a screen reads through `useApi` whether or not
     * anybody is signed in yet, and the sign-out that clears the session
     * should not take the query client with it.
     *
     * It was missing until 2026-09-20, and no test could see that: a screen
     * spec mounts the screen, never the thing around it. What found it was
     * opening the dashboard in a browser, where it drew nothing at all and
     * said "No QueryClient set". `the-app-carries-its-own-providers.spec.tsx`
     * now mounts this provider rather than a harness, and asks.
     */
    <QueryProvider cache={cache}>
      <SharedAuthProvider
        storage={session}
        api={api}
        permissionsFor={permissionsFor}
        onActiveResort={rememberCurrency}
        cache={cache}
        navigate={goTo}
        onSignedIn={rememberThisDevice}
        onSignedOut={forgetThisDevice}
      >
        <MoneyFormatProvider value={format}>
          {/*
            Inside the session and inside the query client, because the
            outbox writes as whoever is signed in and refreshes what they
            are looking at when a held write lands.
          */}
          <Outbox>{children}</Outbox>
        </MoneyFormatProvider>
      </SharedAuthProvider>
    </QueryProvider>
  );
}
