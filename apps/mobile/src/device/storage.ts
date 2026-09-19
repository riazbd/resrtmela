/**
 * The phone's answer to `@rh/app-core`'s `Storage` port.
 *
 * That port is synchronous because `window.localStorage` is, and because the
 * eight modules moved out of the console were written against that contract —
 * an asynchronous port would have made the move a rewrite of their control
 * flow, which is how extractions come to break production.
 *
 * The store beneath is `expo-sqlite/kv-store`, not `react-native-mmkv` as the
 * phase-0 plan named. MMKV would work; what it costs only became visible with
 * a device in front of us. It is not in Expo Go, so every look at every screen
 * would have needed a cloud build and the signing key that goes with it —
 * turning a ten-second loop into a twenty-minute one for the whole project.
 * `expo-sqlite/kv-store` has the same four synchronous methods, ships in Expo
 * Go, and is maintained alongside the SDK.
 */
import kvStore from "expo-sqlite/kv-store";
import type { Storage } from "@rh/app-core";

/**
 * The part of `expo-sqlite/kv-store` this adapter uses.
 *
 * Declared rather than imported so a test can hand in a fake, and so the
 * dependency is one named shape instead of a whole module. The real store has
 * async methods too; the port has no use for them.
 */
export interface SyncKeyValue {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): boolean;
  clearSync(): boolean;
}

/**
 * A `Storage` backed by the device.
 *
 * Unguarded on purpose. `guardedStorage` is the caller's decision and the two
 * callers want different things: `AuthProvider` must never take the app down
 * over a failed read, while `CacheStore` has a better answer to a full store
 * than swallowing — drop the oldest half and retry — and a guard around it
 * would silently retire that.
 */
export function deviceStorage(backing: SyncKeyValue = kvStore): Storage {
  return {
    // `?? null`, not `|| null`: a stored empty string is a value, and telling
    // it apart from an absent key is the difference between "they chose no
    // filter" and "they have never opened this screen"
    getItem: (key) => backing.getItemSync(key) ?? null,
    setItem: (key, value) => backing.setItemSync(key, value),
    // the store answers whether anything was there; the port does not ask,
    // and passing the boolean through would make the app's store a different
    // shape from the console's — the one thing the port exists to prevent
    removeItem: (key) => void backing.removeItemSync(key),
    clear: () => void backing.clearSync(),
  };
}
