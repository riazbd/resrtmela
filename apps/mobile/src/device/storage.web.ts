/**
 * The same `Storage` port, for the browser.
 *
 * The app does not ship on the web. This file exists because the browser is
 * how the screens are looked at during development — the one Android
 * emulator this project's build machine can run needs 2GB it does not have,
 * and a browser tab is a fraction of that. Metro picks this file over
 * `storage.ts` for the web target and nothing else changes.
 *
 * `expo-sqlite` cannot be the backing here: its web build loads a wasm
 * module that this bundler does not resolve, and dragging a SQLite engine
 * into a development lens would be the wrong trade anyway. `localStorage`
 * has exactly the contract the port was written against — it is the
 * contract the port was written against, since `@rh/app-core` was extracted
 * from a console that used it.
 *
 * The real answer, on a phone, is `storage.ts`.
 */
import type { Storage } from "@rh/app-core";
import { memoryStorage } from "@rh/app-core";

/** Kept so this file and `storage.ts` present the same module surface. */
export interface SyncKeyValue {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): boolean;
  clearSync(): boolean;
}

/**
 * `localStorage`, or memory where there is none.
 *
 * A private window, a browser with site data blocked, and server rendering
 * all reach the second branch. Nothing is guarded beyond that: the caller
 * decides, and `session.tsx` wraps this in `guardedStorage` for the same
 * reason it does on a phone.
 */
export function deviceStorage(): Storage {
  let backing: globalThis.Storage | null = null;
  try {
    backing = typeof window !== "undefined" ? window.localStorage : null;
    // touched rather than trusted: Safari in a private window has the object
    // and throws on write
    backing?.setItem("rh.probe", "1");
    backing?.removeItem("rh.probe");
  } catch {
    backing = null;
  }
  if (!backing) return memoryStorage();

  const store = backing;
  return {
    getItem: (key) => store.getItem(key),
    setItem: (key, value) => store.setItem(key, value),
    removeItem: (key) => store.removeItem(key),
    clear: () => store.clear(),
  };
}
