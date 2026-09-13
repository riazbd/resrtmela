/**
 * A screen that cannot load says so.
 *
 * Fourteen places wrote `.catch(() => setRows([]))`, which turns an expired
 * token, a 403 or a database that is down into a cheerful "nothing here". A
 * manager whose session had lapsed read "No team members yet" on a resort with
 * twenty staff, and had no way to tell that from the truth.
 *
 * The hook is here and the rendering is not. `LoadFailed` draws `<ErrorState>`
 * — Tailwind and `<div>`s — so it stayed in the console, and the app will draw
 * the same failure with a native component over this same hook. What both
 * clients must agree on is *that the error is kept*, which is the part that was
 * missing in the first place.
 */
import { useCallback, useState } from "react";

export interface LoadFailure {
  /** the failure to show, or null while nothing has gone wrong */
  error: Error | null;
  /** pass this to `.catch()`: it records the failure and runs your fallback */
  onFail: (fallback?: () => void) => (e: unknown) => void;
  clear: () => void;
}

export function useLoadFailure(): LoadFailure {
  const [error, setError] = useState<Error | null>(null);
  const onFail = useCallback(
    (fallback?: () => void) => (e: unknown) => {
      // a client that rejects with a string, a body, or nothing at all still
      // has to leave something a person can read on the screen
      setError(e instanceof Error ? e : new Error("Could not load this"));
      fallback?.();
    },
    [],
  );
  const clear = useCallback(() => setError(null), []);
  return { error, onFail, clear };
}
