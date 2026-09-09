"use client";

/**
 * What the app last saw, kept for the next time there is no signal.
 *
 * The outbox let the desk keep *writing* with no connection. Reading was still
 * impossible: open the app on a hill road and every screen was blank, because
 * the in-memory query cache dies with the page. An agent on a bus, an owner
 * checking last month's expenses on the way to a meeting, a desk whose router
 * has gone down — all of them saw a spinner that never resolved.
 *
 * So every successful read is written here and read back on the next load. Two
 * things keep that honest:
 *
 * 1. **Age travels with the data.** A screen showing stale figures says so.
 *    Silently presenting old numbers as current is worse than an empty screen,
 *    because the reader cannot tell.
 * 2. **It is a cache, never a source.** Anything past a day is dropped, the
 *    store is capped so it cannot fill the browser's quota, and signing out
 *    empties it — the next person at that counter is not the last one.
 */

const KEY = "rh.cache.v1";

/** A day. Beyond that, a rate or an availability grid is a guess, not data. */
export const MAX_CACHE_AGE_MS = 24 * 60 * 60_000;

/** Enough for every screen a shift touches, small enough to never hit the quota. */
const DEFAULT_MAX_ENTRIES = 120;

interface Entry {
  at: number;
  data: unknown;
}

export interface Cached<T> {
  data: T;
  /** milliseconds since this was read from the server */
  age: number;
}

export class CacheStore {
  constructor(private readonly maxEntries = DEFAULT_MAX_ENTRIES) {}

  private read(): Record<string, Entry> {
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as Record<string, Entry>) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      // a corrupt cache must not bring every screen down on load; losing it is
      // the cheap failure, and the next successful read refills it
      return {};
    }
  }

  private write(entries: Record<string, Entry>) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(entries));
    } catch {
      // quota exceeded or storage blocked: drop the oldest half and try once
      // more, then give up quietly — this is a convenience, not a guarantee
      try {
        const kept = Object.entries(entries)
          .sort(([, a], [, b]) => b.at - a.at)
          .slice(0, Math.floor(this.maxEntries / 2));
        window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(kept)));
      } catch {
        /* storage is unavailable; the app works, it just forgets */
      }
    }
  }

  save(key: string, data: unknown): void {
    const entries = this.read();
    // Several screens can save inside the same millisecond, and then "the
    // oldest" is whatever order the keys happen to come back in. Stamping at
    // least one tick past the newest entry makes eviction mean what it says.
    const newest = Math.max(0, ...Object.values(entries).map((e) => e.at));
    entries[key] = { at: Math.max(Date.now(), newest + 1), data };

    // keep the newest; an old entry is the one nobody has looked at in a while
    const sorted = Object.entries(entries).sort(([, a], [, b]) => b.at - a.at);
    this.write(Object.fromEntries(sorted.slice(0, this.maxEntries)));
  }

  load<T>(key: string): Cached<T> | null {
    const entry = this.read()[key];
    if (!entry) return null;
    const age = Date.now() - entry.at;
    if (age > MAX_CACHE_AGE_MS) {
      this.forget(key);
      return null;
    }
    return { data: entry.data as T, age };
  }

  keys(): string[] {
    return Object.keys(this.read());
  }

  forget(key: string): void {
    const entries = this.read();
    delete entries[key];
    this.write(entries);
  }

  /** On sign-out. The next person at this counter is not the last one. */
  clear(): void {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* nothing to do; the data was never guaranteed to be there */
    }
  }
}

/** One store for the app, so two screens do not fight over the same key. */
export const cacheStore = new CacheStore();

/** A query key becomes a storage key. Stable ordering, so it round-trips. */
export function cacheKeyOf(key: readonly unknown[]): string {
  return JSON.stringify(key);
}

/** "just now", "12 minutes ago" — what a screen says about data it kept. */
export function describeAge(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return "yesterday";
}
