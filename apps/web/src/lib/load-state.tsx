/**
 * A screen that cannot load says so — the console's half.
 *
 * `useLoadFailure` moved to `@rh/app-core`: keeping the error rather than
 * swallowing it is a rule both clients need, and two implementations of it
 * would eventually disagree. What could not move is the drawing. `ErrorState`
 * is Tailwind and `<div>`s, and React Native has neither, so the app renders
 * the same failure natively over the same hook.
 */
"use client";

import { ErrorState } from "@/components/error-state";

export { type LoadFailure, useLoadFailure } from "@rh/app-core";

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
