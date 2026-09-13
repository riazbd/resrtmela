/**
 * The one thing that does not travel between the console and the app.
 *
 * Everything else in this package is React, and React Native runs React. What
 * it does not have is `window.localStorage` — so every module moved here reads
 * and writes through this port instead, and the host decides what backs it.
 *
 * The port is synchronous on purpose. localStorage is synchronous, every caller
 * being moved was written against that contract, and making it a promise would
 * turn an extraction into a rewrite of eight files' control flow.
 */
import { describe, expect, it, vi } from "vitest";
import { guardedStorage, memoryStorage, type Storage } from "../src/storage";

describe("memoryStorage", () => {
  it("gives back what it was given", () => {
    const store = memoryStorage();
    store.setItem("rh.resortId", "7");
    expect(store.getItem("rh.resortId")).toBe("7");
  });

  it("answers null for a key it has never seen", () => {
    expect(memoryStorage().getItem("rh.nothing")).toBeNull();
  });

  it("distinguishes an absent key from a stored empty string", () => {
    const store = memoryStorage();
    store.setItem("rh.empty", "");
    expect(store.getItem("rh.empty")).toBe("");
    expect(store.getItem("rh.absent")).toBeNull();
  });

  it("forgets one key on removeItem and all of them on clear", () => {
    const store = memoryStorage();
    store.setItem("a", "1");
    store.setItem("b", "2");
    store.removeItem("a");
    expect(store.getItem("a")).toBeNull();
    expect(store.getItem("b")).toBe("2");
    store.clear();
    expect(store.getItem("b")).toBeNull();
  });

  it("starts empty for each caller, so one test cannot leak into the next", () => {
    memoryStorage().setItem("shared", "no");
    expect(memoryStorage().getItem("shared")).toBeNull();
  });
});

/**
 * A private window, a browser told to block site data, and the thumbnail
 * capture that runs a page with no storage at all: in each of those the
 * accessor itself throws. A resort losing its front desk because a phone was
 * in private mode is not a trade anyone would make, so the guard swallows.
 */
describe("guardedStorage", () => {
  const throwing = (): Storage => ({
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
    clear: () => {
      throw new Error("SecurityError");
    },
  });

  it("reads null rather than throwing", () => {
    expect(guardedStorage(throwing()).getItem("rh.token")).toBeNull();
  });

  it("swallows a write that the backing store refuses", () => {
    expect(() => guardedStorage(throwing()).setItem("rh.token", "abc")).not.toThrow();
  });

  it("swallows removeItem and clear", () => {
    const store = guardedStorage(throwing());
    expect(() => store.removeItem("rh.token")).not.toThrow();
    expect(() => store.clear()).not.toThrow();
  });

  it("is transparent when the backing store works", () => {
    const backing = memoryStorage();
    const store = guardedStorage(backing);
    store.setItem("rh.lang", "bn");
    expect(store.getItem("rh.lang")).toBe("bn");
    expect(backing.getItem("rh.lang")).toBe("bn");
  });

  it("does not call the backing store more than once per operation", () => {
    const backing = memoryStorage();
    const getItem = vi.fn(backing.getItem);
    guardedStorage({ ...backing, getItem }).getItem("rh.lang");
    expect(getItem).toHaveBeenCalledTimes(1);
  });
});
