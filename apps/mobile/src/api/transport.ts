/**
 * Where the token lives, for the phone.
 *
 * `@rh/shared`'s client types every route and says of the transport: "where a
 * token lives is not this file's concern". This is that concern — which
 * address, whose session, and what a refusal means — and nothing else. Every
 * path in the app comes from the typed client, never from here.
 */
import {
  APP_PLATFORM_HEADER,
  APP_VERSION_HEADER,
  ApiError,
  normalizeApiUrl,
  UPGRADE_REQUIRED,
} from "@rh/shared";
import type { Storage } from "@rh/app-core";

/** Where the session token is kept. The same key `@rh/app-core` uses. */
export const TOKEN_KEY = "rh.token";

export interface TransportPorts {
  /** The API's address. From `expo-constants`, never a literal. */
  baseUrl: string;
  storage: Storage;
  /** Injected so a test can answer without a network. */
  fetch?: typeof fetch;
  /**
   * Called when a session that existed has just been refused. The shell
   * sends the person to the sign-in screen; a test counts it.
   */
  onSignedOut?: () => void;
  /** What this build calls itself. The server's floor is applied to it. */
  appVersion?: string;
  /** "android" | "ios", for the log line the server writes when it refuses. */
  appPlatform?: string;
  /**
   * Called when the server says this build is too old to serve.
   *
   * The shell shows a screen with a Download button and no way past it.
   * Separate from `onSignedOut` on purpose: signing in again is the one
   * thing that will not help, and sending somebody to the login screen
   * to solve this would be a loop.
   */
  onUpdateRequired?: () => void;
}

export type Api = <T>(
  path: string,
  opts?: { method?: string; body?: unknown },
) => Promise<T>;

export function makeApi({
  baseUrl,
  storage,
  fetch: doFetch = fetch,
  onSignedOut,
  appVersion,
  appPlatform,
  onUpdateRequired,
}: TransportPorts): Api {
  const base = normalizeApiUrl(baseUrl);

  return async function api<T>(
    path: string,
    opts: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const token = storage.getItem(TOKEN_KEY);
    const res = await doFetch(`${base}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        /*
         * What is calling, on every request rather than at sign-in.
         *
         * A phone signs in once and then runs for weeks; a floor raised
         * on Tuesday has to reach the person who signed in on Monday,
         * and the only moment it can is the next call they make.
         */
        ...(appVersion ? { [APP_VERSION_HEADER]: appVersion } : {}),
        ...(appPlatform ? { [APP_PLATFORM_HEADER]: appPlatform } : {}),
      },
      // `undefined`, not `null`: a GET with a body is refused by some proxies
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* an empty body is a legitimate answer to a DELETE */
    }

    if (!res.ok) {
      const message =
        (payload as { message?: string })?.message ??
        (payload as { error?: string })?.error ??
        `Request failed (${res.status})`;
      /**
       * End the session only if there was one.
       *
       * A wrong password on the sign-in screen is also a 401, and signing
       * somebody out of a screen they have not reached yet is the bug this
       * guard exists for. The console carries the same rule.
       */
      if (res.status === 401 && token) {
        storage.removeItem(TOKEN_KEY);
        onSignedOut?.();
      }
      /*
       * 426 is the server refusing the *build*, not the person.
       *
       * The token is left exactly where it is: this is not a sign-out,
       * and clearing it would mean the person has to find their password
       * again after installing the update — a second problem, caused by
       * us, on top of the first.
       */
      if (res.status === UPGRADE_REQUIRED) onUpdateRequired?.();
      throw new ApiError(res.status, String(message), payload);
    }

    return payload as T;
  };
}
