// @vitest-environment node

/**
 * The console prerenders on a server, and the rest of this suite cannot see it.
 *
 * Every other spec here runs in jsdom, where `window` exists — so the whole
 * suite is blind to the one failure mode that took the front page down once
 * before: a `"use client"` module reaching for the browser while Next renders
 * it on the server. Next does render client modules there, for the first HTML.
 *
 * The storage extraction made this sharper. `AuthProvider` reads
 * `rh.impersonator` during render rather than in an effect, so it runs on the
 * server. The code that moved carried a `typeof window !== "undefined"` check
 * for exactly that; what replaced it is `guardedStorage`, and this file is what
 * says so rather than hoping.
 */
import { describe, expect, it } from "vitest";
import { guardedStorage } from "@rh/app-core";
import { browserStorage } from "@/lib/offline-cache";

describe("with no window at all", () => {
  it("has genuinely removed it, so this test means something", () => {
    expect(typeof window).toBe("undefined");
  });

  /**
   * Not a complaint about the raw store — this is exactly why `CacheStore` is
   * given the unguarded one and handles the throw itself.
   */
  it("throws from the raw browser store, which is the honest answer", () => {
    expect(() => browserStorage.getItem("rh.token")).toThrow();
  });

  it("reads null through the guard instead of taking the render down", () => {
    const session = guardedStorage(browserStorage);
    expect(session.getItem("rh.impersonator")).toBeNull();
    expect(session.getItem("rh.token")).toBeNull();
  });

  it("swallows a write, so nothing on the server path can throw", () => {
    const session = guardedStorage(browserStorage);
    expect(() => session.setItem("rh.lang", "bn")).not.toThrow();
    expect(() => session.removeItem("rh.token")).not.toThrow();
    expect(() => session.clear()).not.toThrow();
  });

  /**
   * The cache holds the unguarded store and catches for itself, so it has to
   * survive a server render on its own terms.
   */
  it("lets the offline cache report nothing rather than crash", async () => {
    const { cacheStore } = await import("@/lib/offline-cache");
    expect(cacheStore.load("rooms")).toBeNull();
    expect(cacheStore.keys()).toEqual([]);
    expect(() => cacheStore.save("rooms", [1])).not.toThrow();
    expect(() => cacheStore.clear()).not.toThrow();
  });
});
