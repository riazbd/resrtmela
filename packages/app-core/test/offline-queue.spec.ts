/**
 * The front desk when the connection drops.
 *
 * Sajek and the hill districts lose the network for minutes at a time as a
 * matter of routine, and a desk that cannot check a guest in because of it is
 * worse than the paper register it replaced. So writes wait here and replay in
 * order.
 *
 * The property that makes that safe rather than merely clever is that a
 * replayed write must not happen twice — the common failure is a request that
 * *landed* and whose response was lost coming back, and replaying that must
 * return the original payment rather than take the money again. That rests
 * entirely on `clientRef` being generated once and surviving every retry, which
 * is why it is the first thing tested here.
 */
import { describe, expect, it, vi } from "vitest";
import { OfflineQueue, canWaitOffline, isNetworkError } from "../src/offline-queue";
import { ApiError } from "@rh/shared";
import { memoryStorage, type Storage } from "../src/storage";

const collector = () => {
  const sent: { path: string; body: Record<string, unknown> }[] = [];
  return { sent, send: async (path: string, body: Record<string, unknown>) => void sent.push({ path, body }) };
};

describe("what may wait for a connection", () => {
  it("lets a new row wait, because it carries its own identity", () => {
    for (const kind of ["payment", "checkin", "checkout", "booking", "expense", "quotation", "invoice", "package", "payroll"] as const) {
      expect(canWaitOffline(kind)).toBe(true);
    }
  });

  it("does not let an edit or a delete wait: two devices cannot both be right", () => {
    expect(canWaitOffline("edit")).toBe(false);
    expect(canWaitOffline("delete")).toBe(false);
  });
});

describe("OfflineQueue", () => {
  const write = { kind: "payment" as const, label: "Collect ৳3,000 for BK-00042", path: "/payments", body: { amount: 3000 } };

  it("keeps what was queued, in the order it was written", () => {
    const queue = new OfflineQueue(collector().send, memoryStorage());
    queue.enqueue(write);
    queue.enqueue({ ...write, label: "second" });
    expect(queue.pending().map((w) => w.label)).toEqual([write.label, "second"]);
  });

  it("gives every write its own reference", () => {
    const queue = new OfflineQueue(collector().send, memoryStorage());
    queue.enqueue(write);
    queue.enqueue(write);
    const [a, b] = queue.pending();
    expect(a!.clientRef).not.toBe(b!.clientRef);
  });

  /**
   * The one that protects a guest's money. A reference regenerated on the
   * second attempt would look like a second payment to the server, and the
   * resort would take ৳3,000 twice for one stay.
   */
  it("sends the same reference on a retry as on the attempt that failed", async () => {
    const seen: string[] = [];
    let failNext = true;
    const queue = new OfflineQueue(async (_path, body) => {
      seen.push(String(body.clientRef));
      if (failNext) throw new TypeError("Failed to fetch");
    }, memoryStorage());

    queue.enqueue(write);
    await queue.flush();
    failNext = false;
    await queue.flush();

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });

  it("sends oldest first and empties as it goes", async () => {
    const { sent, send } = collector();
    const queue = new OfflineQueue(send, memoryStorage());
    queue.enqueue({ ...write, body: { n: 1 } });
    queue.enqueue({ ...write, body: { n: 2 } });

    const result = await queue.flush();

    expect(sent.map((s) => s.body.n)).toEqual([1, 2]);
    expect(result.sent).toBe(2);
    expect(queue.pending()).toEqual([]);
  });

  /**
   * Stopping matters as much as sending: a check-out that landed before the
   * check-in it follows would reorder the resort's day, and the desk would
   * have no way to reason about what actually reached the server.
   */
  it("stops at the first write the network refuses and keeps the rest in order", async () => {
    const { sent } = collector();
    const queue = new OfflineQueue(async (path, body) => {
      if (body.n === 2) throw new TypeError("Failed to fetch");
      sent.push({ path, body });
    }, memoryStorage());
    for (const n of [1, 2, 3]) queue.enqueue({ ...write, body: { n } });

    const result = await queue.flush();

    expect(sent.map((s) => s.body.n)).toEqual([1]);
    expect(result).toMatchObject({ sent: 1, failed: 1, remaining: 2 });
    expect(queue.pending().map((w) => w.body.n)).toEqual([2, 3]);
  });

  /**
   * A refusal is different from a dropped connection: it will refuse again in
   * ten minutes, and retrying forever would wall off every write behind it.
   * It leaves the queue — but it is reported, never swallowed.
   */
  it("drops a write the server refuses, reports it, and carries on", async () => {
    const queue = new OfflineQueue(async (_path, body) => {
      if (body.n === 1) throw new ApiError(422, "A payment cannot exceed the balance due");
    }, memoryStorage());
    queue.enqueue({ ...write, body: { n: 1 } });
    queue.enqueue({ ...write, body: { n: 2 } });

    const result = await queue.flush();

    expect(result.sent).toBe(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected![0]!.reason).toMatch(/exceed the balance/);
    expect(queue.pending()).toEqual([]);
  });

  it("will not flush twice at once, which would send everything twice", async () => {
    let inFlight = 0;
    let peak = 0;
    const queue = new OfflineQueue(async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
    }, memoryStorage());
    queue.enqueue(write);
    queue.enqueue(write);

    await Promise.all([queue.flush(), queue.flush()]);

    expect(peak).toBe(1);
  });

  it("survives an outbox somebody else corrupted rather than bricking the desk", () => {
    const backing = memoryStorage();
    backing.setItem("rh.outbox", "{ not json");
    const queue = new OfflineQueue(collector().send, backing);
    expect(queue.pending()).toEqual([]);
    expect(() => queue.enqueue(write)).not.toThrow();
    expect(queue.pending()).toHaveLength(1);
  });

  it("keeps working when storage refuses to hold anything", () => {
    const refusing: Storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
      clear: () => {},
    };
    expect(() => new OfflineQueue(collector().send, refusing).enqueue(write)).not.toThrow();
  });

  it("forgets a write by id", () => {
    const queue = new OfflineQueue(collector().send, memoryStorage());
    const id = queue.enqueue(write);
    queue.enqueue({ ...write, label: "kept" });
    queue.remove(id);
    expect(queue.pending().map((w) => w.label)).toEqual(["kept"]);
  });
});

/**
 * `navigator.onLine` used to be read here. React Native has no such property —
 * connectivity there comes from NetInfo, and a resort's wifi being up while its
 * uplink is down is the commonest case anyway. So the caller says what it
 * knows, and the default is the conservative one: assume online, and treat only
 * the failures that are unambiguously the network as retryable.
 */
describe("isNetworkError", () => {
  it("calls a dropped fetch and a 5xx worth retrying", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new ApiError(503, "Bad gateway"))).toBe(true);
    expect(isNetworkError(new ApiError(0, "No response"))).toBe(true);
  });

  it("does not retry a refusal, which would refuse again in ten minutes", () => {
    expect(isNetworkError(new ApiError(422, "Too much"))).toBe(false);
    expect(isNetworkError(new ApiError(403, "Not yours"))).toBe(false);
  });

  it("treats anything as retryable when the caller says it is offline", () => {
    expect(isNetworkError(new Error("who knows"), false)).toBe(true);
    expect(isNetworkError(new Error("who knows"), true)).toBe(false);
  });

  it("assumes online when the caller does not say, rather than guessing at a global", () => {
    expect(isNetworkError(new Error("who knows"))).toBe(false);
  });
});
