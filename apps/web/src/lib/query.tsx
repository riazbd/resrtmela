"use client";

/**
 * The console's data layer.
 *
 * Everything that decides behaviour — how long a figure is worth trusting,
 * what is worth retrying, what a screen shows before the network answers —
 * moved to `@rh/app-core`. A phone reading different rules than the desk is
 * exactly the disagreement this whole extraction exists to prevent.
 *
 * What stays is the one thing that cannot be shared: which store the cache
 * writes to.
 */
import { QueryProvider as SharedQueryProvider } from "@rh/app-core";
import { cacheStore } from "@/lib/offline-cache";

export { useApi, useMutation, useQueryClient, worthRetrying, keys } from "@rh/app-core";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return <SharedQueryProvider cache={cacheStore}>{children}</SharedQueryProvider>;
}
