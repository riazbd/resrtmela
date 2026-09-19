/**
 * Where the token lives, for the phone.
 *
 * `@rh/shared`'s client types every route and says of the transport: "where a
 * token lives is not this file's concern". This is that concern — which
 * address, whose session, and what a refusal means — and nothing else. Every
 * path in the app comes from the typed client, never from here.
 */
import { ApiError, normalizeApiUrl } from "@rh/shared";
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
      throw new ApiError(res.status, String(message), payload);
    }

    return payload as T;
  };
}
