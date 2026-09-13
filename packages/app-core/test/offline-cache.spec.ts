/**
 * What the app last saw, kept for the next time there is no signal.
 *
 * The first real consumer of the storage port, and the one that shows why the
 * port is not simply `guardedStorage` everywhere: this class has its own,
 * better answer to a full quota — drop the oldest half and try again — and a
 * guard that swallowed the throw would have silently retired that strategy.
 * So it takes a store that still throws, and keeps its own handling.
 */
import { describe, expect, it, vi } from "vitest";
import { CacheStore, MAX_CACHE_AGE_MS, cacheKeyOf, describeAge } from "../src/offline-cache";
import { memoryStorage, type Storage } from "../src/storage";

const CACHE_KEY = "rh.cache.v1";

describe("CacheStore", () => {
  it("gives back what it saved, with an age attached", () => {
    const store = new CacheStore(memoryStorage());
    store.save("rooms", [{ id: 1 }]);
    const got = store.load<{ id: number }[]>("rooms");
    expect(got?.data).toEqual([{ id: 1 }]);
    expect(got?.age).toBeLessThan(1000);
  });

  it("has nothing for a key it never saw", () => {
    expect(new CacheStore(memoryStorage()).load("rooms")).toBeNull();
  });

  it("drops and forgets anything older than a day", () => {
    const backing = memoryStorage();
    const store = new CacheStore(backing);
    const twoDaysAgo = Date.now() - 2 * MAX_CACHE_AGE_MS;
    backing.setItem(CACHE_KEY, JSON.stringify({ rooms: { at: twoDaysAgo, data: [1] } }));
    expect(store.load("rooms")).toBeNull();
    expect(store.keys()).toEqual([]);
  });

  it("keeps the newest entries when it is full", () => {
    const store = new CacheStore(memoryStorage(), 3);
    for (const key of ["a", "b", "c", "d"]) store.save(key, key);
    expect(store.keys().sort()).toEqual(["b", "c", "d"]);
  });

  /**
   * Several screens can save inside the same millisecond, and then "the oldest"
   * is whatever order the keys came back in. Frozen time is the only way to
   * make that failure reproducible.
   */
  it("still evicts in save order when every save lands on the same millisecond", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-13T06:00:00Z"));
    try {
      const store = new CacheStore(memoryStorage(), 2);
      for (const key of ["a", "b", "c"]) store.save(key, key);
      expect(store.keys().sort()).toEqual(["b", "c"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("survives a cache somebody else corrupted", () => {
    const backing = memoryStorage();
    backing.setItem(CACHE_KEY, "{not json");
    const store = new CacheStore(backing);
    expect(store.load("rooms")).toBeNull();
    expect(() => store.save("rooms", [1])).not.toThrow();
    expect(store.load<number[]>("rooms")?.data).toEqual([1]);
  });

  /**
   * The reason the store is handed an unguarded backing: this recovery only
   * runs if the throw actually arrives.
   */
  it("drops the oldest half and retries when the quota is full", () => {
    const held = new Map<string, string>();
    let refuseOver = 200;
    const tight: Storage = {
      getItem: (k) => held.get(k) ?? null,
      setItem: (k, v) => {
        if (v.length > refuseOver) throw new Error("QuotaExceededError");
        held.set(k, v);
      },
      removeItem: (k) => void held.delete(k),
      clear: () => held.clear(),
    };
    const store = new CacheStore(tight, 4);
    refuseOver = Number.MAX_SAFE_INTEGER;
    for (const key of ["a", "b", "c", "d"]) store.save(key, "x".repeat(40));
    refuseOver = 200; // now everything is too big, and the halving has to happen
    store.save("e", "x".repeat(40));
    expect(store.keys().length).toBeLessThanOrEqual(2);
  });

  it("gives up quietly when storage will not take anything at all", () => {
    const refusing: Storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {},
      clear: () => {},
    };
    expect(() => new CacheStore(refusing).save("rooms", [1])).not.toThrow();
  });

  /**
   * The one that would be expensive to get wrong. Signing out empties the
   * cache; it must not empty the session token, the language, or the active
   * resort, which live beside it under their own keys.
   */
  it("clears its own key and leaves everything else in storage alone", () => {
    const backing = memoryStorage();
    backing.setItem("rh.token", "a-real-session");
    backing.setItem("rh.lang", "bn");
    const store = new CacheStore(backing);
    store.save("rooms", [1]);

    store.clear();

    expect(store.load("rooms")).toBeNull();
    expect(backing.getItem("rh.token")).toBe("a-real-session");
    expect(backing.getItem("rh.lang")).toBe("bn");
  });

  it("forgets one key without disturbing the others", () => {
    const store = new CacheStore(memoryStorage());
    store.save("rooms", [1]);
    store.save("guests", [2]);
    store.forget("rooms");
    expect(store.load("rooms")).toBeNull();
    expect(store.load<number[]>("guests")?.data).toEqual([2]);
  });
});

describe("cacheKeyOf", () => {
  it("turns a query key into something that round-trips", () => {
    expect(cacheKeyOf(["rooms", 7])).toBe(cacheKeyOf(["rooms", 7]));
    expect(cacheKeyOf(["rooms", 7])).not.toBe(cacheKeyOf(["rooms", 8]));
  });
});

describe("describeAge", () => {
  it("says how old the figures on the screen are", () => {
    expect(describeAge(0)).toBe("just now");
    expect(describeAge(60_000)).toBe("1 minute ago");
    expect(describeAge(12 * 60_000)).toBe("12 minutes ago");
    expect(describeAge(60 * 60_000)).toBe("1 hour ago");
    expect(describeAge(5 * 60 * 60_000)).toBe("5 hours ago");
    expect(describeAge(30 * 60 * 60_000)).toBe("yesterday");
  });
});
