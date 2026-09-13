import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  canWaitOffline,
  isNetworkError,
  type OfflineQueue,
  type QueuedKind,
  type QueuedWrite,
} from "./offline-queue";

/**
 * The outbox, wired to the app.
 *
 * `submit` is the only thing screens need: it tries the network, and when the
 * network is the problem it queues instead of failing. The desk keeps working;
 * the guest gets their room; the write lands when the connection does.
 *
 * It deliberately does not queue everything. What may wait is decided by
 * `canWaitOffline`, and the rule is identity, not urgency: a write that
 * creates a new row and carries its own reference can be replayed all day and
 * still make one row. An edit cannot — two devices editing the same row
 * offline cannot both be right, and the second write would quietly overwrite
 * the first — so an edit still needs a connection and says so.
 *
 * Three things the console did inline are props here, because each of them is
 * a different object on a phone: knowing whether there is a network
 * (`navigator.onLine` and the window's online/offline events, against
 * NetInfo), telling a person that something failed (`window.alert` against
 * `Alert.alert`), and making the call itself.
 */

export interface OutboxValue {
  pending: QueuedWrite[];
  online: boolean;
  flushing: boolean;
  /** Sends now, or queues if the network is down. Throws only when the server refuses. */
  submit: (input: {
    kind: QueuedKind;
    label: string;
    path: string;
    body: Record<string, unknown>;
    method?: string;
  }) => Promise<{ queued: boolean }>;
  flush: () => Promise<void>;
  discard: (id: string) => void;
}

export interface OutboxProviderProps {
  children: React.ReactNode;
  queue: OfflineQueue;
  /** One authenticated write. The host decides what carries it. */
  send: (path: string, body: Record<string, unknown>, method: string) => Promise<unknown>;
  /**
   * Subscribes to connectivity, and reports the current state immediately so
   * the provider never has to guess at a first value. Returns an unsubscribe.
   */
  watchOnline: (onChange: (online: boolean) => void) => () => void;
  /**
   * How this app tells a person that a queued write was refused. The one case
   * where something a person did did not happen and only they can fix it, so
   * it is never swallowed — and never merely logged.
   */
  announceRejected: (label: string, reason: string) => void;
  /** How often to retry while anything is waiting. */
  retryEveryMs?: number;
}

const Ctx = createContext<OutboxValue | null>(null);

export function OutboxProvider({
  children,
  queue,
  send,
  watchOnline,
  announceRejected,
  retryEveryMs = 30_000,
}: OutboxProviderProps) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<QueuedWrite[]>([]);
  const [online, setOnline] = useState(true);
  const [flushing, setFlushing] = useState(false);

  /**
   * The callbacks are held in refs and read when they are called, never listed
   * as effect dependencies.
   *
   * A host writes these as inline arrows — the ordinary way to write a wrapper
   * — so they are new objects on every render. Depending on them would tear
   * down and rebuild the connectivity subscription every time anything on the
   * screen changed: waste in a browser, and a NetInfo listener churning against
   * the OS on a phone.
   */
  const latest = useRef({ send, watchOnline, announceRejected });
  latest.current = { send, watchOnline, announceRejected };

  const refresh = useCallback(() => setPending(queue.pending()), [queue]);

  const flush = useCallback(async () => {
    if (queue.pending().length === 0) return;
    setFlushing(true);
    try {
      const result = await queue.flush();
      refresh();
      if (result.sent > 0) {
        // whatever landed changed the desk's world; let every screen re-read
        await qc.invalidateQueries();
      }
      for (const r of result.rejected ?? []) {
        latest.current.announceRejected(r.write.label, r.reason);
      }
    } finally {
      setFlushing(false);
    }
  }, [queue, qc, refresh]);

  useEffect(() => {
    refresh();
    const stop = latest.current.watchOnline((up) => {
      setOnline(up);
      if (up) void flush();
    });
    /**
     * A connectivity event is optimistic wherever it comes from — a browser
     * fires `online` when an interface comes up, not when the API is
     * reachable, and a phone is no better. The timer is what actually rescues
     * a desk whose router rebooted.
     */
    const timer = setInterval(() => {
      if (queue.pending().length > 0) void flush();
    }, retryEveryMs);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [flush, refresh, queue, retryEveryMs]);

  const submit: OutboxValue["submit"] = useCallback(
    async (input) => {
      try {
        await latest.current.send(input.path, input.body, input.method ?? "POST");
        return { queued: false };
      } catch (error) {
        if (!isNetworkError(error, online)) throw error;
        if (!canWaitOffline(input.kind)) {
          // saying "saved" and then quietly losing the change would be worse
          // than this refusal, which at least the person can act on
          throw new Error(
            "This change needs a connection — someone else may be editing the same thing. Try again when you are back online.",
          );
        }
        queue.enqueue(input);
        refresh();
        return { queued: true };
      }
    },
    [queue, refresh, online],
  );

  const discard = useCallback(
    (id: string) => {
      queue.remove(id);
      refresh();
    },
    [queue, refresh],
  );

  const value = useMemo(
    () => ({ pending, online, flushing, submit, flush, discard }),
    [pending, online, flushing, submit, flush, discard],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOutbox(): OutboxValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useOutbox must be used inside OutboxProvider");
  }
  return ctx;
}
