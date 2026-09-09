"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  OfflineQueue,
  canWaitOffline,
  isNetworkError,
  type QueuedKind,
  type QueuedWrite,
} from "@/lib/offline-queue";
import { useQueryClient } from "@tanstack/react-query";

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
 */

interface OutboxValue {
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

const Ctx = createContext<OutboxValue | null>(null);

export function OutboxProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const queue = useMemo(
    () => new OfflineQueue((path, body) => api(path, { method: "POST", body })),
    [],
  );
  const [pending, setPending] = useState<QueuedWrite[]>([]);
  const [online, setOnline] = useState(true);
  const [flushing, setFlushing] = useState(false);

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
      if (result.rejected?.length) {
        // a refused write is never swallowed: it is the one case where a human
        // has to know something they did did not happen
        for (const r of result.rejected) {
          window.alert(`Could not save: ${r.write.label}\n\n${r.reason}`);
        }
      }
    } finally {
      setFlushing(false);
    }
  }, [queue, qc, refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();
    const back = () => {
      setOnline(true);
      void flush();
    };
    const gone = () => setOnline(false);
    window.addEventListener("online", back);
    window.addEventListener("offline", gone);
    // the browser's online event is optimistic — it fires when an interface
    // comes up, not when the API is actually reachable — so also retry on a
    // timer while anything is waiting
    const timer = setInterval(() => {
      if (queue.pending().length > 0) void flush();
    }, 30_000);
    return () => {
      window.removeEventListener("online", back);
      window.removeEventListener("offline", gone);
      clearInterval(timer);
    };
  }, [flush, refresh, queue]);

  const submit: OutboxValue["submit"] = useCallback(
    async (input) => {
      try {
        await api(input.path, { method: input.method ?? "POST", body: input.body });
        return { queued: false };
      } catch (error) {
        if (!isNetworkError(error)) throw error;
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
    [queue, refresh],
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
