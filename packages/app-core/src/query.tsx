import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryOptions } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { ApiError } from "@rh/shared";
import { type CacheStore, cacheKeyOf, describeAge } from "./offline-cache";

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
/**
 * Whether a failed read is worth asking again.
 *
 * Named, rather than written inline in the options below, because the case
 * that matters most is invisible when it is a lambda: a 4xx is never retried.
 * Asking "do you have permission?" three times does not change the answer, it
 * only delays the message by eight seconds — and nothing could check that.
 */
export function worthRetrying(failureCount: number, error: unknown): boolean {
  const status = error instanceof ApiError ? error.status : 0;
  if (status >= 400 && status < 500) return false;
  return failureCount < 2;
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: worthRetrying,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        // a write is never retried on its own: the user pressed a button once
        retry: false,
      },
    },
  });
}

/**
 * Where the cache lives, so `useApi` can reach it without importing a
 * singleton. The console's is backed by localStorage and the app's by MMKV;
 * `null` means keep nothing, which is what a server render and a first launch
 * both look like.
 */
const CacheCtx = createContext<CacheStore | null>(null);

export function QueryProvider({
  children,
  cache,
}: {
  children: React.ReactNode;
  cache: CacheStore | null;
}) {
  // one client per session, created inside state so a re-render or a Fast
  // Refresh does not throw the cache away
  const [client] = useState(makeQueryClient);

  /**
   * Every successful read is written to the browser, and read back on the next
   * load. The in-memory cache dies with the page, which is why opening the app
   * with no signal used to show nothing at all — the one moment the last-known
   * figures are worth most.
   *
   * Only successful reads are kept, and only their data: an error is not worth
   * restoring, and a screen that restores yesterday's failure is a screen
   * nobody can clear.
   */
  useEffect(() => {
    if (!cache) return;
    const queries = client.getQueryCache();

    for (const query of queries.getAll()) {
      if (query.state.data !== undefined) continue;
      const kept = cache.load<unknown>(cacheKeyOf(query.queryKey));
      if (kept) query.setData(kept.data);
    }

    return queries.subscribe((event) => {
      if (event.type !== "updated" || event.query.state.status !== "success") return;
      const data = event.query.state.data;
      if (data === undefined) return;
      cache.save(cacheKeyOf(event.query.queryKey), data);
    });
  }, [client, cache]);

  return (
    <CacheCtx.Provider value={cache}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </CacheCtx.Provider>
  );
}

/**
 * Hydrates one query from what the browser kept, before the network answers.
 *
 * `useApi` calls this itself, so a screen written the ordinary way gets the
 * behaviour without asking: last-known rows appear immediately, the request
 * goes out behind them, and the screen updates when it lands.
 */
function keptData<T>(cache: CacheStore | null, key: readonly unknown[]): { data: T; age: number } | null {
  // the `typeof window === "undefined"` guard this used to carry is gone with
  // the singleton: a null cache is the honest way to say "nothing is kept
  // here", and it covers a server render and a first launch alike
  return cache ? cache.load<T>(cacheKeyOf(key)) : null;
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
  const cache = useContext(CacheCtx);
  // whatever this screen last saw, available on the first frame rather than
  // after a round trip that may never complete
  const [kept] = useState(() => keptData<T>(cache, key));

  const query = useQuery<T, Error, T, readonly unknown[]>({
    queryKey: key,
    queryFn: fetcher,
    // TanStack's placeholder type excludes a `T` that could itself be a
    // function; no API response here is one, and the guard is not exported to
    // say so in the type
    ...(kept ? { placeholderData: kept.data as never } : {}),
    ...options,
  });

  return {
    ...query,
    /**
     * Set while the rows on screen came out of the browser rather than the
     * server, with how old they are in the reader's words. A screen that shows
     * stale figures without saying so is worse than an empty one: the reader
     * cannot tell.
     */
    stale: query.isFetching || query.isSuccess ? null : kept ? describeAge(kept.age) : null,
  };
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
  options: (rid: number | undefined, list: string) => ["resort-options", rid, list] as const,
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

  // the agency's own side; keyed by agency rather than resort, because that is
  // what owns the rows
  agentTours: () => ["agent", "tours"] as const,
  agentPackages: () => ["agent", "packages"] as const,
  agentPackage: (id: number) => ["agent", "package", id] as const,
  agentHeads: () => ["agent", "expense-heads"] as const,
  agentExpenses: (q?: unknown) => ["agent", "expenses", q] as const,
  agentEmployees: () => ["agent", "employees"] as const,
  agentPayroll: (month: string) => ["agent", "payroll", month] as const,
  agentSales: (q?: unknown) => ["agent", "sales", q] as const,
  agentSalesDoc: (id: number) => ["agent", "sales", "doc", id] as const,
  agentGuests: (q?: unknown) => ["agent", "guests", q] as const,
  agentRooms: (from: string, to: string) => ["agent", "rooms", from, to] as const,
  agentCalendar: (from: string, to: string, resortId?: number) =>
    ["agent", "calendar", from, to, resortId ?? null] as const,
  agentWallet: () => ["agent", "wallet"] as const,
};
