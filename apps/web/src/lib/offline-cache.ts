"use client";

/**
 * The console's copy of what the app last saw.
 *
 * `CacheStore` moved to `@rh/app-core` — the phone needs the same cache, and
 * two implementations of "how old is too old" would eventually disagree. What
 * stays here is the one thing that cannot move: which store it writes to.
 *
 * Two details are load-bearing.
 *
 * The backing store reaches for `window` inside each method rather than at
 * module scope. This module is `"use client"`, but Next still evaluates client
 * modules while prerendering on the server, where `window` does not exist —
 * touching it at the top level would fail the build rather than a method call.
 *
 * And it is deliberately unguarded. `CacheStore` has its own answer to a full
 * quota, better than the guard's: drop the oldest half and try once more.
 * Wrapping this in `guardedStorage` would swallow the throw that recovery is
 * waiting for.
 */
import { CacheStore, type Storage } from "@rh/app-core";

export { CacheStore, MAX_CACHE_AGE_MS, cacheKeyOf, describeAge, type Cached } from "@rh/app-core";

/**
 * Exported so a test can build a store on the real browser rather than reach
 * through this module for a private. The console's stake in the cache is
 * precisely that it survives a page load in a browser, and that is worth
 * naming.
 */
export const browserStorage: Storage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => window.localStorage.setItem(key, value),
  removeItem: (key) => window.localStorage.removeItem(key),
  clear: () => window.localStorage.clear(),
};

/** One store for the app, so two screens do not fight over the same key. */
export const cacheStore = new CacheStore(browserStorage);
