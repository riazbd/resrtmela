"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/error-state";

/**
 * The console's error boundary. Without it, a thrown error inside any page
 * replaced the whole screen with nothing at all — no message, no navigation,
 * no way back except the browser's reload button.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // one line in the browser console, with the id the API returned, so a
    // screenshot of devtools is enough to find the request server-side
    console.error("[ui]", error.message, (error as { digest?: string }).digest ?? "");
  }, [error]);

  return <ErrorState error={error} reset={reset} />;
}
