/**
 * The wiring, proved rather than assumed.
 *
 * `@rh/app-core` is where the console's session, query cache, translations and
 * offline modules are moving. Before any of them move, the console has to be
 * able to import from the package at all — through pnpm's link, through Next's
 * `transpilePackages`, and through vitest's resolver, which are three separate
 * things that can each be wrong on their own.
 *
 * It also proves the browser half of the storage port. `guardedStorage` is
 * tested in app-core against a fake that throws; here it is tested against the
 * real `window.localStorage`, in the only environment this repo has that has
 * one.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { guardedStorage, memoryStorage, type Storage } from "@rh/app-core";

describe("the console can reach @rh/app-core", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("imports the storage port across the package boundary", () => {
    expect(typeof guardedStorage).toBe("function");
    expect(typeof memoryStorage).toBe("function");
  });

  it("accepts window.localStorage as a backing store without a cast", () => {
    // structural, not nominal: if localStorage ever stops satisfying the port,
    // this stops compiling, which is the point
    const backing: Storage = window.localStorage;
    const store = guardedStorage(backing);
    store.setItem("rh.resortId", "7");
    expect(store.getItem("rh.resortId")).toBe("7");
    expect(window.localStorage.getItem("rh.resortId")).toBe("7");
  });

  it("reads an absent key as null, the way every moved caller expects", () => {
    expect(guardedStorage(window.localStorage).getItem("rh.never-written")).toBeNull();
  });

  it("clears the browser store, which is what signing out does", () => {
    const store = guardedStorage(window.localStorage);
    store.setItem("rh.resortId", "7");
    store.setItem("rh.lang", "bn");
    store.clear();
    expect(window.localStorage.length).toBe(0);
  });
});
