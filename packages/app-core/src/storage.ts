/**
 * Where a client keeps what it must remember between launches.
 *
 * The console keeps it in `window.localStorage`; the app keeps it in MMKV.
 * Neither of those exists in the other, so the modules that need storage — the
 * session token, the active resort, the language, the offline cache, the write
 * queue — take this port and let the host decide what backs it.
 *
 * Synchronous, because localStorage is, and because eight modules being moved
 * out of `apps/web/src/lib` were written against that contract. An asynchronous
 * port would have turned a move into a rewrite of their control flow, which is
 * how extractions come to break production.
 */
export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

/** A store that lives as long as the process. Tests, and servers with no DOM. */
export function memoryStorage(): Storage {
  const held = new Map<string, string>();
  return {
    // `?? null`, not `|| null`: a stored empty string is a value, and telling
    // it apart from an absent key is the difference between "they chose no
    // filter" and "they have never opened this screen"
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, value) => void held.set(key, value),
    removeItem: (key) => void held.delete(key),
    clear: () => held.clear(),
  };
}

/**
 * The same store, but it cannot take the app down with it.
 *
 * Three situations make the accessor itself throw rather than return nothing:
 * a private window, a browser configured to block site data, and a quota that
 * is full. In all three the honest answer is "I remembered nothing", and a
 * front desk that cannot open because a phone is in private mode is not a
 * trade worth making.
 *
 * Failures are swallowed, not logged: this runs on every read of every cached
 * screen, and a store that is unavailable is unavailable for the whole session
 * — the log would be one line repeated thousands of times.
 */
export function guardedStorage(backing: Storage): Storage {
  return {
    getItem: (key) => {
      try {
        return backing.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        backing.setItem(key, value);
      } catch {
        /* nothing was remembered; the caller's next read will say so */
      }
    },
    removeItem: (key) => {
      try {
        backing.removeItem(key);
      } catch {
        /* it was already unreachable, which is what removal wanted */
      }
    },
    clear: () => {
      try {
        backing.clear();
      } catch {
        /* as above */
      }
    },
  };
}
