"use client";

import { ApiError } from "@/lib/api";

/**
 * The front desk when the connection drops.
 *
 * Sajek, Bandarban and the hill districts lose connectivity for minutes at a
 * time as a matter of routine. A front desk that cannot check a guest in
 * because the network dropped is worse than the paper register it replaced —
 * paper always works — and it is the reason a resort keeps the register on the
 * counter next to the software it is paying for. No competitor selling into
 * this market handles it.
 *
 * So the three actions that cannot wait — check in, check out, take money —
 * are written here when the network fails, and replayed in order when it
 * returns. Everything else still requires a connection: a queue that accepts
 * every write becomes a second, worse database.
 *
 * Two properties make this safe rather than clever:
 *
 * 1. **Every write carries its own identity.** The server treats `clientRef`
 *    as the identity of the payment, so replaying a request that actually
 *    succeeded — the common case, where the request landed and the response
 *    was lost coming back — returns the original instead of taking the money
 *    a second time.
 * 2. **Nothing is dropped silently.** A write the server refuses leaves the
 *    queue, because retrying it forever would block every later write behind
 *    something that can never succeed — but it is reported, never swallowed.
 */

export type QueuedKind = "payment" | "checkin" | "checkout";

export interface QueuedWrite {
  id: string;
  kind: QueuedKind;
  /** what to tell the user this was, in their words: "Collect ৳3,000 for BK-00042" */
  label: string;
  path: string;
  body: Record<string, unknown>;
  clientRef: string;
  queuedAt: number;
  attempts: number;
}

export interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
  /** writes the server refused; they have left the queue and need a human */
  rejected?: { write: QueuedWrite; reason: string }[];
}

export type Sender = (path: string, body: Record<string, unknown>) => Promise<unknown>;

const STORAGE_KEY = "rh.outbox";

/**
 * Whether this failure means "try again later" or "this will never work".
 *
 * A fetch that never got an answer is a dropped connection. So is a 5xx: the
 * desk did nothing wrong and the same request may well succeed in a minute.
 * A 4xx is the server refusing, and refusing again in ten minutes.
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof ApiError) return error.status >= 500 || error.status === 0;
  // fetch rejects with a TypeError when it cannot reach the host at all
  return error instanceof TypeError || !navigator.onLine;
}

function newRef(): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return rand.slice(0, 40);
}

export class OfflineQueue {
  private flushing = false;

  constructor(private readonly send: Sender) {}

  private read(): QueuedWrite[] {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as QueuedWrite[]) : [];
    } catch {
      // a corrupt outbox must not brick the desk; better to lose it than to
      // make every screen throw on load
      return [];
    }
  }

  private write(rows: QueuedWrite[]) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    } catch {
      // storage full or blocked — the caller already has the error path
    }
  }

  pending(): QueuedWrite[] {
    return this.read();
  }

  /** Adds a write to the outbox and returns its id. */
  enqueue(input: { kind: QueuedKind; label: string; path: string; body: Record<string, unknown> }): string {
    const write: QueuedWrite = {
      id: newRef(),
      kind: input.kind,
      label: input.label,
      path: input.path,
      body: input.body,
      // generated once, here: a reference regenerated on each attempt would
      // defeat the whole point of having one
      clientRef: newRef(),
      queuedAt: Date.now(),
      attempts: 0,
    };
    this.write([...this.read(), write]);
    return write.id;
  }

  remove(id: string) {
    this.write(this.read().filter((w) => w.id !== id));
  }

  /**
   * Sends what is queued, oldest first.
   *
   * It stops at the first thing that fails. Sending the rest would reorder the
   * day — a check-out landing before the check-in it follows — and the desk
   * would have no way to reason about what actually reached the server.
   */
  async flush(): Promise<FlushResult> {
    // two flushes at once would send everything twice; the server would answer
    // the duplicates correctly, but the outbox would be a lie in the meantime
    if (this.flushing) return { sent: 0, failed: 0, remaining: this.read().length };
    this.flushing = true;
    try {
      const rejected: { write: QueuedWrite; reason: string }[] = [];
      let sent = 0;
      let failed = 0;

      for (const write of this.read()) {
        try {
          await this.send(write.path, { ...write.body, clientRef: write.clientRef });
          this.remove(write.id);
          sent++;
        } catch (error) {
          if (isNetworkError(error)) {
            failed++;
            break; // still offline — leave this and everything after it
          }
          // the server refused: it will refuse again, so it leaves the queue
          this.remove(write.id);
          rejected.push({ write, reason: (error as Error).message });
        }
      }

      const remaining = this.read().length;
      return rejected.length > 0 ? { sent, failed, remaining, rejected } : { sent, failed, remaining };
    } finally {
      this.flushing = false;
    }
  }
}
