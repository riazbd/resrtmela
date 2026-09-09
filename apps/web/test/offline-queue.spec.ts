/**
 * The front desk when the connection drops.
 *
 * Sajek, Bandarban and the hill districts lose connectivity for minutes at a
 * time as a matter of routine. A front desk that cannot check a guest in
 * because the network dropped is worse than the paper register it replaced —
 * paper always works — and no competitor selling into this market handles it.
 *
 * So the three actions that cannot wait — check in, check out, take money —
 * are written to a local queue when the network fails, and replayed in order
 * when it comes back. Every queued write carries a reference the server treats
 * as its identity, so a replay of a request that actually succeeded returns
 * the original rather than taking the money twice.
 *
 * The rules these tests hold:
 *  - a network failure queues; a rejection by the server does not
 *  - the queue survives a reload, because the browser may well be closed
 *  - replay is in order, and stops at the first thing that fails
 *  - nothing is ever silently dropped
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineQueue, isNetworkError } from "@/lib/offline-queue";
import { ApiError } from "@/lib/api";

beforeEach(() => {
  window.localStorage.clear();
});

const action = (over: Partial<Parameters<OfflineQueue["enqueue"]>[0]> = {}) => ({
  kind: "payment" as const,
  label: "Collect ৳3,000 for BK-00042",
  path: "/bookings/42/payments",
  body: { amount: 3000, method: "CASH" },
  ...over,
});

describe("what counts as offline", () => {
  it("treats a failed fetch as offline, because that is what a dropped connection looks like", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("does not treat a refusal by the server as offline", () => {
    expect(isNetworkError(new ApiError(403, "Missing permission: payments.create"))).toBe(false);
    expect(isNetworkError(new ApiError(402, "Suspended"))).toBe(false);
  });

  it("treats a 5xx as worth retrying — the desk did nothing wrong", () => {
    expect(isNetworkError(new ApiError(503, "Service unavailable"))).toBe(true);
  });
});

describe("the queue", () => {
  it("gives every write an identity, so a replay cannot double-charge", () => {
    const q = new OfflineQueue(vi.fn());
    const id = q.enqueue(action());
    expect(q.pending()[0]!.clientRef).toMatch(/.+/);
    expect(q.pending()[0]!.id).toBe(id);
  });

  it("survives a reload, because the browser may be closed before the network returns", () => {
    new OfflineQueue(vi.fn()).enqueue(action());
    const reloaded = new OfflineQueue(vi.fn());
    expect(reloaded.pending()).toHaveLength(1);
    expect(reloaded.pending()[0]!.label).toContain("BK-00042");
  });

  it("sends the client reference with the body when it replays", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    const q = new OfflineQueue(send);
    q.enqueue(action());

    await q.flush();

    const [path, body] = send.mock.calls[0]!;
    expect(path).toBe("/bookings/42/payments");
    expect((body as { clientRef: string }).clientRef).toMatch(/.+/);
    expect(q.pending()).toHaveLength(0);
  });

  it("replays in the order the desk did the work", async () => {
    const seen: string[] = [];
    const q = new OfflineQueue(async (path: string) => {
      seen.push(path);
      return {};
    });
    q.enqueue(action({ path: "/a" }));
    q.enqueue(action({ path: "/b" }));
    q.enqueue(action({ path: "/c" }));

    await q.flush();

    expect(seen).toEqual(["/a", "/b", "/c"]);
  });

  it("stops at the first failure and keeps the rest, rather than reordering the day", async () => {
    const q = new OfflineQueue(async (path: string) => {
      if (path === "/b") throw new TypeError("Failed to fetch");
      return {};
    });
    q.enqueue(action({ path: "/a" }));
    q.enqueue(action({ path: "/b" }));
    q.enqueue(action({ path: "/c" }));

    const result = await q.flush();

    expect(result).toEqual({ sent: 1, failed: 1, remaining: 2 });
    expect(q.pending().map((p) => p.path)).toEqual(["/b", "/c"]);
  });

  it("drops a write the server refused, and says which one", async () => {
    const q = new OfflineQueue(async () => {
      throw new ApiError(400, "amount must be > 0");
    });
    q.enqueue(action());

    const result = await q.flush();

    // retrying it forever would block every later write behind something that
    // can never succeed, so it leaves the queue — loudly
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected![0]!.reason).toContain("amount must be > 0");
    expect(q.pending()).toHaveLength(0);
  });

  it("counts a replay of something that already landed as done", async () => {
    const q = new OfflineQueue(async () => ({ replayed: true }));
    q.enqueue(action());

    const result = await q.flush();

    expect(result.sent).toBe(1);
    expect(q.pending()).toHaveLength(0);
  });

  it("never runs two flushes at once, which would send everything twice", async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    const q = new OfflineQueue(async () => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return {};
    });
    q.enqueue(action({ path: "/a" }));
    q.enqueue(action({ path: "/b" }));

    await Promise.all([q.flush(), q.flush()]);

    expect(maxConcurrent).toBe(1);
    expect(q.pending()).toHaveLength(0);
  });
});
