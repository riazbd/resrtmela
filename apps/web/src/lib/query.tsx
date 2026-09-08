"use client";

import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "@/lib/api";

/**
 * The data layer.
 *
 * Every screen used to fetch in a `useEffect` with no cache, no dedupe and no
 * retry: 53 of them. Walking from the Day Sheet to Bookings and back re-fetched
 * everything both times, two components needing the same room list asked for it
 * twice, and a dropped request — which on a hill-district connection is a
 * normal Tuesday — showed an empty screen with no way to recover but F5.
 *
 * The defaults below are chosen for that connection, not for a demo:
 *
 * - **staleTime 30s.** A front desk moves between screens constantly; asking
 *   the server again half a second later answers a question nobody asked.
 * - **retry twice, with backoff — but never on a 4xx.** A dropped packet is
 *   worth retrying; "you do not have permission" is not, and retrying it three
 *   times just delays the message.
 * - **refetch on reconnect, not on every window focus.** Coming back from a
 *   dropped connection should re-read; alt-tabbing to WhatsApp should not.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          const status = error instanceof ApiError ? error.status : 0;
          if (status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        // a write is never retried on its own: the user pressed a button once
        retry: false,
      },
    },
  });
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // one client per browser session, created inside state so a re-render or a
  // Fast Refresh does not throw the cache away
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * A query, with the two things every screen here needs: it waits until the
 * active resort is known, and it never fires with an undefined id in the URL.
 */
export function useApi<T>(
  key: readonly unknown[],
  fetcher: () => Promise<T>,
  options?: Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, "queryKey" | "queryFn">,
) {
  return useQuery<T, Error, T, readonly unknown[]>({ queryKey: key, queryFn: fetcher, ...options });
}

export { useMutation, useQueryClient };

/**
 * Cache keys in one place.
 *
 * Every key starts with the resort id, so switching resorts cannot show the
 * previous one's rows for a frame, and invalidating one resort never throws
 * away another's.
 */
export const keys = {
  resort: (rid: number | undefined) => ["resort", rid] as const,
  bookings: (rid: number | undefined, filters?: unknown) => ["bookings", rid, filters] as const,
  booking: (id: number) => ["booking", id] as const,
  calendar: (rid: number | undefined, from: string, to: string) => ["calendar", rid, from, to] as const,
  daySheet: (rid: number | undefined, date?: string) => ["day-sheet", rid, date] as const,
  today: (rid: number | undefined) => ["today", rid] as const,
  dues: (rid: number | undefined, page?: unknown) => ["dues", rid, page] as const,
  guests: (rid: number | undefined, q?: unknown) => ["guests", rid, q] as const,
  rooms: (rid: number | undefined) => ["rooms", rid] as const,
  roomTypes: (rid: number | undefined) => ["room-types", rid] as const,
  ratePlans: (rid: number | undefined) => ["rate-plans", rid] as const,
  availability: (rid: number | undefined, from: string, to: string) => ["availability", rid, from, to] as const,
  expenses: (rid: number | undefined, q?: unknown) => ["expenses", rid, q] as const,
  expenseCategories: (rid: number | undefined) => ["expense-categories", rid] as const,
  fbBills: (rid: number | undefined, q?: unknown) => ["fb-bills", rid, q] as const,
  fbInHouse: (rid: number | undefined) => ["fb-in-house", rid] as const,
  fbPackages: (rid: number | undefined) => ["fb-packages", rid] as const,
  activities: (rid: number | undefined) => ["activities", rid] as const,
  payroll: (rid: number | undefined, month: string) => ["payroll", rid, month] as const,
  employees: (rid: number | undefined) => ["employees", rid] as const,
  reports: (rid: number | undefined, name: string, range?: unknown) => ["reports", rid, name, range] as const,
  platform: (name: string, arg?: unknown) => ["platform", name, arg] as const,
  notifications: () => ["notifications"] as const,
};
