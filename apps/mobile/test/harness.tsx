/**
 * What a screen needs around it before it will render.
 *
 * Every screen from phase 1 on reads through `useApi`, which needs a query
 * client, and draws money, which needs a format. Both are providers the real
 * app supplies in `app/_layout.tsx`; a test that mounts one screen has to
 * supply them too, and doing it in each spec is how one of them ends up
 * subtly different from the rest.
 *
 * The cache is `null` on purpose. On a device the cache is what makes the
 * last-known figures appear before the network answers; under a test it would
 * make one spec's rows visible in the next, which is a failure nobody can
 * reproduce alone.
 *
 * **Two of the data layer's defaults have to be turned off here, and finding
 * out why cost an hour.** Both are right on a phone and both stop jest from
 * ever exiting:
 *
 *   - `retry` — a failed read is tried twice more, after 1s and 2s. Under
 *     RNTL 14 that pending timer sits inside the renderer's act scope and
 *     the run never finishes: a spec asserting an error state hangs at zero
 *     CPU, indefinitely, with no output. Proved by switching one rejection
 *     from `Error` (retried, hangs) to `ApiError(403)` (never retried, passes
 *     in 252ms).
 *   - `gcTime: 5 * 60_000` — the right number for a front desk walking
 *     between screens, and a five-minute `setTimeout` left behind by every
 *     query a test renders.
 *
 * Do not reach for `--forceExit` instead: it would hide the next real leak as
 * well as these two.
 */
import type { ReactNode } from "react";
import { OfflineQueue, OutboxProvider, QueryProvider, memoryStorage, useQueryClient } from "@rh/app-core";
import { MoneyFormatProvider } from "../src/design/money";

/** Typed off the hook, so this file needs no dependency of its own. */
let live: ReturnType<typeof useQueryClient> | null = null;

/**
 * Renders nothing. It exists to reach the client the provider made, and it is
 * the provider's first child so that it has changed the defaults before the
 * screen beside it mounts its first query.
 *
 * Exported because `Harness` is not the only thing that provides a client:
 * a spec that mounts the app's own `SessionProvider` — to check that the app
 * carries a data layer at all — needs the same two defaults turned off, and
 * hangs for the same five minutes without them.
 */
export function Settle() {
  const client = useQueryClient();
  live = client;
  client.setDefaultOptions({ queries: { retry: false, gcTime: 0 } });
  return null;
}

afterEach(() => {
  live?.clear();
  live = null;
});

/**
 * An outbox that never sends anything and never queues anything.
 *
 * It is here because the app mounts one above every screen, and a harness
 * that does not is a harness a screen can pass inside and fail outside —
 * which is precisely how the missing `QueryProvider` survived a green
 * suite until somebody opened the app in a browser. A spec that cares what
 * was queued mocks `src/api/desk` and asserts on that instead.
 */
function quietOutbox(children: ReactNode) {
  const queue = new OfflineQueue(
    async () => undefined,
    memoryStorage(),
    () => true,
  );
  return (
    <OutboxProvider
      queue={queue}
      send={async () => undefined}
      watchOnline={(onChange) => {
        onChange(true);
        return () => {};
      }}
      announceRejected={() => {}}
    >
      {children}
    </OutboxProvider>
  );
}

export function Harness({ children }: { children: ReactNode }) {
  return (
    <QueryProvider cache={null}>
      <Settle />
      {/* the empty format is the default one — taka, en-IN — which is what a
          resort that has never set a currency gets in production too */}
      <MoneyFormatProvider value={{}}>{quietOutbox(children)}</MoneyFormatProvider>
    </QueryProvider>
  );
}
