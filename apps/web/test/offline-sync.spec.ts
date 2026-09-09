/**
 * Working with no connection at all.
 *
 * The outbox already carried the three things a front desk cannot postpone.
 * What it did not do was let anyone *read*: open the app on a hill road and
 * every screen was blank, because nothing survived the page load. And an agent
 * in the field — writing up a tour, filing the day's expenses, drafting a
 * quotation on the bus back — had no way to record any of it until they found
 * a signal.
 *
 * So two things move here.
 *
 * **Reads are kept.** Whatever the app last saw is written to the browser and
 * read back on the next load, so a screen opens with last-known data and a
 * plain mark of how old it is, instead of a spinner that never resolves.
 *
 * **More writes may wait.** The old rule — only three actions queue — was
 * right about the danger and wrong about the scope. What makes a write safe to
 * replay is not urgency, it is *identity*: a write that creates a new row and
 * carries its own reference can be replayed all day and still make one row.
 * Editing a row someone else may also be editing cannot, so it still waits for
 * a connection.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OfflineQueue, isNetworkError, canWaitOffline } from "@/lib/offline-queue";
import { CacheStore, MAX_CACHE_AGE_MS } from "@/lib/offline-cache";

beforeEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

describe("what may wait for a connection", () => {
  it("lets a new row wait, because it carries its own identity", () => {
    expect(canWaitOffline("payment")).toBe(true);
    expect(canWaitOffline("expense")).toBe(true);
    expect(canWaitOffline("quotation")).toBe(true);
    expect(canWaitOffline("package")).toBe(true);
  });

  it("does not let an edit wait, because two devices editing cannot both be right", () => {
    expect(canWaitOffline("edit")).toBe(false);
    expect(canWaitOffline("delete")).toBe(false);
  });
});

describe("keeping what was read", () => {
  it("gives back what it was given, after a reload", () => {
    new CacheStore().save("guests", { rows: [{ id: 1, fullName: "Farhana" }] });

    // a new instance is what a page load looks like
    const found = new CacheStore().load<{ rows: { id: number }[] }>("guests");

    expect(found!.data.rows[0]!.id).toBe(1);
  });

  it("says how old what it kept is, so a screen can be honest about it", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T10:00:00Z"));
    new CacheStore().save("guests", { rows: [] });

    vi.setSystemTime(new Date("2026-09-09T10:20:00Z"));
    const found = new CacheStore().load("guests");

    expect(found!.age).toBe(20 * 60_000);
  });

  it("throws away what is too old to trust", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T10:00:00Z"));
    new CacheStore().save("rooms", { rows: [] });

    vi.setSystemTime(new Date("2026-09-01T10:00:00Z").getTime() + MAX_CACHE_AGE_MS + 1);

    expect(new CacheStore().load("rooms")).toBeNull();
  });

  it("survives a corrupt entry rather than bringing the screen down with it", () => {
    window.localStorage.setItem("rh.cache.v1", "{ not json");

    expect(new CacheStore().load("anything")).toBeNull();
  });

  it("drops the oldest entries rather than filling the browser's storage", () => {
    const store = new CacheStore(3);

    store.save("a", { n: 1 });
    store.save("b", { n: 2 });
    store.save("c", { n: 3 });
    store.save("d", { n: 4 });

    expect(store.load("a")).toBeNull();
    expect(store.load("d")).not.toBeNull();
    expect(store.keys()).toHaveLength(3);
  });

  it("forgets everything when someone signs out, because the next person is not them", () => {
    const store = new CacheStore();
    store.save("guests", { rows: [{ id: 1 }] });

    store.clear();

    expect(store.load("guests")).toBeNull();
    expect(window.localStorage.getItem("rh.cache.v1")).toBeNull();
  });
});

describe("replaying what waited", () => {
  it("sends an agent's field notes when the signal comes back, in the order they were written", async () => {
    const sent: string[] = [];
    const queue = new OfflineQueue(async (path) => {
      sent.push(path);
    });

    queue.enqueue({ kind: "expense", label: "Fuel ৳800", path: "/agent/expenses", body: { amount: 800 } });
    queue.enqueue({
      kind: "quotation",
      label: "Quote for Farhana",
      path: "/agent/sales",
      body: { kind: "QUOTATION" },
    });

    const result = await queue.flush();

    expect(result.sent).toBe(2);
    expect(sent).toEqual(["/agent/expenses", "/agent/sales"]);
    expect(queue.pending()).toEqual([]);
  });

  it("gives the server the same reference every time, so a replay makes one row", async () => {
    const refs: unknown[] = [];
    let firstTry = true;
    const queue = new OfflineQueue(async (_path, body) => {
      refs.push((body as { clientRef: string }).clientRef);
      if (firstTry) {
        firstTry = false;
        throw new TypeError("Failed to fetch");
      }
    });
    queue.enqueue({ kind: "expense", label: "Fuel ৳800", path: "/agent/expenses", body: { amount: 800 } });

    await queue.flush();
    await queue.flush();

    expect(refs).toHaveLength(2);
    expect(refs[0]).toBe(refs[1]);
  });
});
