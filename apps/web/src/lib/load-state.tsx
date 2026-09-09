/**
 * A screen that cannot load says so.
 *
 * Fourteen places wrote `.catch(() => setRows([]))`, which turns an expired
 * token, a 403 or a database that is down into a cheerful "nothing here". A
 * manager whose session had lapsed read "No team members yet" on a resort with
 * twenty staff, and had no way to tell that from the truth.
 *
 * `Empty` and `ErrorState` both already exist; what was missing was anywhere to
 * put the error. This hook is that place, and it is deliberately tiny so
 * converting a call site is one line at the catch and one line at the render.
 */
"use client";

import { useCallback, useState } from "react";
import { ErrorState } from "@/components/error-state";

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
      setError(e instanceof Error ? e : new Error("Could not load this"));
      fallback?.();
    },
    [],
  );
  const clear = useCallback(() => setError(null), []);
  return { error, onFail, clear };
}

/**
 * Renders the failure, or nothing.
 *
 * Sits above the list rather than replacing it: a screen that has stale rows
 * and a failed refresh should show both, so the reader knows what they are
 * looking at and that it did not just update.
 */
export function LoadFailed({ error, onRetry }: { error: Error | null; onRetry?: () => void }) {
  if (!error) return null;
  return <ErrorState error={error} reset={onRetry} />;
}
